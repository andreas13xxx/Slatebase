/**
 * The vault's own word list — everything anyone picked "Zum Wörterbuch
 * hinzufügen" for — plus a session-only ignore list.
 *
 * The list lives in the vault (`.slatebase/spellcheck-words.json`, behind
 * `/vaults/:id/spellcheck/words`), so it is shared by everyone working in the
 * vault and travels with it through Git Sync. Reads stay synchronous: the
 * spellcheck pipeline asks for the list on every lint pass, so it is held in
 * memory for the active vault and refreshed when the vault changes.
 * `localStorage` (one key per vault) is only a cache that lets the first lint
 * pass after a reload use the words before the server has answered.
 *
 * Words from the former device-wide list (`slatebase:spellcheck-personal`) are
 * uploaded into the first vault opened afterwards and the old key is removed.
 *
 * @module spellcheck/personal-dictionary
 */
import type { IApiClient } from '../../api'
import { showToast } from '../../components/ToastNotification'

/** The slice of the API client this module needs. */
type DictionaryApi = Pick<IApiClient, 'getSpellcheckWords' | 'addSpellcheckWords' | 'removeSpellcheckWord'>

/** Cache key prefix; the vault id is appended. */
const CACHE_PREFIX = 'slatebase:spellcheck-personal:'

/** The pre-vault, device-wide list — read once for migration, then deleted. */
const LEGACY_STORAGE_KEY = 'slatebase:spellcheck-personal'

/**
 * Guards against a corrupted or oversized entry poisoning every lint pass —
 * the whole list is handed to the worker on load and kept in memory there.
 * Matches the server-side cap.
 */
const MAX_WORDS = 5000

/** Same rules as the server's `spellcheckWordSchema`: a rejected word would fail the whole request. */
const MAX_WORD_LENGTH = 100
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARACTERS = /[\s\u0000-\u001f\u007f]/

function isValidWord(word: string): boolean {
  return word.length >= 1 && word.length <= MAX_WORD_LENGTH && !FORBIDDEN_CHARACTERS.test(word)
}

/** Words the user ignored via the context menu, forgotten on reload. */
const sessionIgnored = new Set<string>()

let api: DictionaryApi | null = null
let activeVaultId: string | null = null
let words: string[] = []

/** Whether the legacy list was already offered to a server this session (success or not). */
let legacyMigrationAttempted = false

/**
 * Changes made while the server copy of the active vault is still on its way.
 * They are applied on top of it, otherwise a word added during the request
 * would vanish again when the response replaces the list.
 */
interface LoadWindow {
  added: Set<string>
  removed: Set<string>
}
let loadWindow: LoadWindow | null = null

const changeListeners = new Set<(words: string[]) => void>()

function notify(): void {
  const snapshot = [...words]
  for (const listener of changeListeners) listener(snapshot)
}

/**
 * Subscribes to wholesale changes of the list (vault switch, server refresh).
 * Single additions made through {@link addPersonalWord} do not fire it — the
 * caller that added the word already knows.
 *
 * @returns an unsubscribe function.
 */
export function subscribeToPersonalWords(listener: (words: string[]) => void): () => void {
  changeListeners.add(listener)
  return () => { changeListeners.delete(listener) }
}

/** Parses a stored word list, returning `[]` for anything unexpected. */
function parseWordList(raw: string | null): string[] {
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).slice(0, MAX_WORDS)
  } catch {
    return []
  }
}

function readCache(vaultId: string): string[] {
  try {
    return parseWordList(localStorage.getItem(CACHE_PREFIX + vaultId))
  } catch {
    return []
  }
}

function writeCache(vaultId: string, list: string[]): void {
  try {
    localStorage.setItem(CACHE_PREFIX + vaultId, JSON.stringify(list))
  } catch {
    // localStorage unavailable or quota exceeded — it is only a cache.
  }
}

/** Connects the module to the API client. Called on app mount. */
export function initializePersonalDictionary(client: DictionaryApi): void {
  api = client
}

/**
 * Points the dictionary at a vault: shows the cached words at once, then
 * replaces them with the server's. The server always wins, including when it
 * answers with an empty list.
 *
 * A failed request keeps the cached words — "could not ask" is not "no words".
 */
export async function setActivePersonalDictionaryVault(vaultId: string | null): Promise<void> {
  if (vaultId === activeVaultId) return

  activeVaultId = vaultId
  words = vaultId === null ? [] : readCache(vaultId)
  const session: LoadWindow = { added: new Set(), removed: new Set() }
  loadWindow = vaultId === null ? null : session
  notify()
  if (vaultId === null || !api) {
    loadWindow = null
    return
  }

  try {
    let remote = (await api.getSpellcheckWords(vaultId)).words
    if (activeVaultId !== vaultId) return
    remote = await migrateLegacyWords(api, vaultId, remote)
    if (activeVaultId !== vaultId) return
    words = [...new Set([...remote, ...session.added])].filter((word) => !session.removed.has(word)).slice(0, MAX_WORDS)
    writeCache(vaultId, words)
    notify()
  } catch {
    // Keep the cached words; the next vault switch or reload asks again.
  } finally {
    if (loadWindow === session) loadWindow = null
  }
}

/**
 * Uploads the old device-wide list into the vault that is opened first, then
 * deletes it. Entries the server would reject are filtered out first — one bad
 * word fails the whole request. A failed upload (read-only access, server down)
 * keeps the old key for the next session; it is tried once per session, not on
 * every vault switch.
 */
async function migrateLegacyWords(client: DictionaryApi, vaultId: string, remote: string[]): Promise<string[]> {
  if (legacyMigrationAttempted) return remote

  let stored: string[]
  try {
    stored = parseWordList(localStorage.getItem(LEGACY_STORAGE_KEY))
  } catch {
    return remote
  }
  const legacy = [...new Set(stored.filter(isValidWord))]
  if (legacy.length === 0) {
    removeLegacyKey()
    return remote
  }

  legacyMigrationAttempted = true
  try {
    const merged = (await client.addSpellcheckWords(vaultId, legacy)).words
    removeLegacyKey()
    return merged
  } catch {
    return remote
  }
}

function removeLegacyKey(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/** The active vault's words (a copy). `[]` while no vault is active. */
export function readPersonalWords(): string[] {
  return [...words]
}

function reportSaveFailure(): void {
  showToast('error', 'Wörterbuch konnte nicht im Vault gespeichert werden — die Änderung wurde zurückgenommen.')
}

/** Applies a change to the in-memory list, the cache and an open load window. */
function applyChange(vaultId: string, word: string, present: boolean): void {
  words = present ? [...words, word] : words.filter((entry) => entry !== word)
  writeCache(vaultId, words)
  if (loadWindow) {
    if (present) {
      loadWindow.added.add(word)
      loadWindow.removed.delete(word)
    } else {
      loadWindow.removed.add(word)
      loadWindow.added.delete(word)
    }
  }
}

/**
 * Undoes a change whose server write failed, so the list does not keep words
 * (or lose them) that the vault never learned about. The listeners tell the
 * worker and re-lint. Skipped if the user has since switched vaults.
 */
function rollBack(vaultId: string, word: string, present: boolean): void {
  reportSaveFailure()
  if (activeVaultId !== vaultId || words.includes(word) === present) return
  applyChange(vaultId, word, present)
  notify()
}

/**
 * Adds a word to the active vault's list.
 *
 * The in-memory list changes immediately; the server write follows in the
 * background and is rolled back, with a toast, if it fails.
 *
 * @returns `true` if the list actually changed — the caller uses this to skip
 *   the worker round-trip and lint refresh for a duplicate.
 */
export function addPersonalWord(word: string): boolean {
  const trimmed = word.trim()
  if (!isValidWord(trimmed) || activeVaultId === null) return false
  if (words.includes(trimmed) || words.length >= MAX_WORDS) return false

  const vaultId = activeVaultId
  applyChange(vaultId, trimmed, true)
  api?.addSpellcheckWords(vaultId, [trimmed]).catch(() => rollBack(vaultId, trimmed, false))
  return true
}

/** Removes a word from the active vault's list; rolled back if the server write fails. */
export function removePersonalWord(word: string): boolean {
  if (activeVaultId === null || !words.includes(word)) return false

  const vaultId = activeVaultId
  applyChange(vaultId, word, false)
  api?.removeSpellcheckWord(vaultId, word).catch(() => rollBack(vaultId, word, true))
  return true
}

/** Marks a word as ignored until the page is reloaded. */
export function ignoreWordForSession(word: string): void {
  sessionIgnored.add(word)
}

/** Whether a word is on the session-only ignore list. */
export function isIgnoredForSession(word: string): boolean {
  return sessionIgnored.has(word)
}

/** Test seam — drops the session ignore list. */
export function clearSessionIgnored(): void {
  sessionIgnored.clear()
}

/** Test seam — drops all module state including the API client and listeners. */
export function resetPersonalDictionary(): void {
  api = null
  activeVaultId = null
  words = []
  loadWindow = null
  legacyMigrationAttempted = false
  sessionIgnored.clear()
  changeListeners.clear()
}
