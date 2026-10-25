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

/** Words the user ignored via the context menu, forgotten on reload. */
const sessionIgnored = new Set<string>()

let api: DictionaryApi | null = null
let activeVaultId: string | null = null
let words: string[] = []

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
  notify()
  if (vaultId === null || !api) return

  try {
    let remote = (await api.getSpellcheckWords(vaultId)).words
    if (activeVaultId !== vaultId) return
    remote = await migrateLegacyWords(api, vaultId, remote)
    if (activeVaultId !== vaultId) return
    words = remote.slice(0, MAX_WORDS)
    writeCache(vaultId, words)
    notify()
  } catch {
    // Keep the cached words; the next vault switch or reload asks again.
  }
}

/**
 * Uploads the old device-wide list into the vault that is opened first, then
 * deletes it. The old key stays when the upload fails (read-only access, server
 * down), so a later visit can still migrate it.
 */
async function migrateLegacyWords(client: DictionaryApi, vaultId: string, remote: string[]): Promise<string[]> {
  let legacy: string[]
  try {
    legacy = parseWordList(localStorage.getItem(LEGACY_STORAGE_KEY))
  } catch {
    return remote
  }
  if (legacy.length === 0) {
    removeLegacyKey()
    return remote
  }

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
  showToast('error', 'Wörterbuch konnte nicht im Vault gespeichert werden — das Wort gilt nur bis zum Neuladen.')
}

/**
 * Adds a word to the active vault's list.
 *
 * The in-memory list changes immediately; the server write follows in the
 * background. A failed write leaves the word known for this session and says so.
 *
 * @returns `true` if the list actually changed — the caller uses this to skip
 *   the worker round-trip and lint refresh for a duplicate.
 */
export function addPersonalWord(word: string): boolean {
  const trimmed = word.trim()
  if (!trimmed || activeVaultId === null) return false
  if (words.includes(trimmed) || words.length >= MAX_WORDS) return false

  const vaultId = activeVaultId
  words = [...words, trimmed]
  writeCache(vaultId, words)
  api?.addSpellcheckWords(vaultId, [trimmed]).catch(reportSaveFailure)
  return true
}

/** Removes a word from the active vault's list. */
export function removePersonalWord(word: string): boolean {
  if (activeVaultId === null || !words.includes(word)) return false

  const vaultId = activeVaultId
  words = words.filter((entry) => entry !== word)
  writeCache(vaultId, words)
  api?.removeSpellcheckWord(vaultId, word).catch(reportSaveFailure)
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
  sessionIgnored.clear()
  changeListeners.clear()
}
