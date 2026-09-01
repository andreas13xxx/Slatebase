/**
 * The user's own word list — everything they picked "Zum Wörterbuch
 * hinzufügen" for, plus a session-only ignore list.
 *
 * Stored in localStorage under `slatebase:spellcheck-personal`, deliberately
 * alongside the existing `slatebase:spellcheck` toggle (useSpellcheck.ts)
 * rather than on the backend: the toggle set the precedent, and a per-device
 * word list needs no server round-trip on every keystroke. Moving it into
 * `vault-config` so it travels with the vault (and through Git Sync) is the
 * obvious follow-up — `readPersonalWords()`/`addPersonalWord()` are the only
 * two functions that would have to change.
 *
 * @module spellcheck/personal-dictionary
 */

const STORAGE_KEY = 'slatebase:spellcheck-personal'

/**
 * Guards against a corrupted or oversized entry poisoning every lint pass —
 * the whole list is handed to the worker on load and kept in memory there.
 */
const MAX_WORDS = 5000

/** Words the user ignored via the context menu, forgotten on reload. */
const sessionIgnored = new Set<string>()

/**
 * Reads the persisted word list. Returns `[]` for anything unexpected —
 * a spellchecker that silently knows no extra words is far better than one
 * that throws on startup because localStorage held junk.
 */
export function readPersonalWords(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  } catch {
    return []
  }
}

/** Persists the list, silently ignoring an unavailable or full localStorage. */
function persistPersonalWords(words: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words))
  } catch {
    // localStorage unavailable or quota exceeded — the in-memory worker copy
    // still knows the word for this session, which is the important half.
  }
}

/**
 * Adds a word to the persisted list.
 *
 * @returns `true` if the list actually changed — the caller uses this to skip
 *   the worker round-trip and lint refresh for a duplicate.
 */
export function addPersonalWord(word: string): boolean {
  const trimmed = word.trim()
  if (!trimmed) return false

  const words = readPersonalWords()
  if (words.includes(trimmed)) return false
  if (words.length >= MAX_WORDS) return false

  words.push(trimmed)
  persistPersonalWords(words)
  return true
}

/** Removes a word from the persisted list. */
export function removePersonalWord(word: string): boolean {
  const words = readPersonalWords()
  const next = words.filter((entry) => entry !== word)
  if (next.length === words.length) return false
  persistPersonalWords(next)
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
