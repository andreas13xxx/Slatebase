/**
 * Main-thread front end for the spellcheck worker.
 *
 * A single worker is shared by every open editor — the dictionary costs a
 * megabyte of parsed data, so one instance per tab would be wasteful — and it
 * is created lazily on the first check, so a user who never turns spellcheck
 * on never downloads a dictionary.
 *
 * Everything here degrades to "no spellcheck" rather than throwing: an
 * unavailable `Worker` (jsdom in tests), a failed dictionary fetch, or a worker
 * that stops answering all end with zero diagnostics, never with a broken
 * editor.
 *
 * @module spellcheck/spellcheck-client
 */
import { showToast } from '../../components/ToastNotification'
import { readPersonalWords, addPersonalWord } from './personal-dictionary'
import {
  DEFAULT_SPELLCHECK_LANGUAGE,
  type SpellcheckLanguage,
  type SpellcheckRequest,
  type SpellcheckResponse,
} from './protocol'

/**
 * How long a check or suggest request may take before it is abandoned.
 * Building the German dictionary is the slow part and happens once; a request
 * that outlives this has hit something unexpected, and a lint pass that never
 * settles would leave stale underlines on screen forever.
 */
const REQUEST_TIMEOUT_MS = 10_000

let worker: Worker | null = null
let workerUnavailable = false
let requestCounter = 0
let currentLanguage: SpellcheckLanguage | null = null
let ready = false
let loadFailureReported = false

/** Resolvers for in-flight requests, keyed by request id. */
const pendingChecks = new Map<number, (unknownWords: string[]) => void>()
const pendingSuggestions = new Map<number, (suggestions: string[]) => void>()

/** Notified whenever previously-returned verdicts may have become stale. */
const changeListeners = new Set<() => void>()

function notifyChanged(): void {
  for (const listener of changeListeners) listener()
}

/**
 * Subscribes to "the answers you got earlier may be wrong now" — the
 * dictionary finished loading, the language changed, or a word was added.
 * The CM6 extension uses this to re-run the linter (see spellcheck-extension.ts).
 *
 * @returns an unsubscribe function.
 */
export function subscribeToSpellcheckChanges(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => { changeListeners.delete(listener) }
}

/** URL of a dictionary file, honouring a non-root Vite `base`. */
function dictionaryUrl(language: SpellcheckLanguage, extension: 'aff' | 'dic'): string {
  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : base + '/'
  return prefix + 'dictionaries/' + language + '.' + extension
}

function handleResponse(response: SpellcheckResponse): void {
  switch (response.kind) {
    case 'loaded':
      ready = true
      notifyChanged()
      break

    case 'load-failed':
      ready = false
      console.error('[Spellcheck] Dictionary failed to load:', response.message)
      // Once per session: repeating it for every editor that mounts would
      // bury the toast stack on an offline or misconfigured deployment.
      if (!loadFailureReported) {
        loadFailureReported = true
        showToast('error', 'Wörterbuch konnte nicht geladen werden — Rechtschreibprüfung ist inaktiv.')
      }
      break

    case 'check-result':
      pendingChecks.get(response.id)?.(response.unknownWords)
      pendingChecks.delete(response.id)
      break

    case 'suggest-result':
      pendingSuggestions.get(response.id)?.(response.suggestions)
      pendingSuggestions.delete(response.id)
      break
  }
}

/**
 * Returns the shared worker, creating it on first use.
 *
 * Returns `null` where workers aren't available — jsdom in the unit tests, or
 * a browser that refuses the module worker — after which no further attempts
 * are made.
 */
function ensureWorker(): Worker | null {
  if (worker || workerUnavailable) return worker

  try {
    worker = new Worker(new URL('./spellcheck.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (event: MessageEvent<SpellcheckResponse>) => handleResponse(event.data))
    worker.addEventListener('error', (event) => {
      console.error('[Spellcheck] Worker error:', event.message)
      ready = false
    })
  } catch (error) {
    workerUnavailable = true
    console.warn('[Spellcheck] Web Worker unavailable — spellcheck disabled:', error)
    return null
  }

  return worker
}

function send(request: SpellcheckRequest): boolean {
  const instance = ensureWorker()
  if (!instance) return false
  instance.postMessage(request)
  return true
}

/**
 * Selects the dictionary language, loading it if it isn't the current one.
 * Safe to call on every render — a repeat call for the loaded language is a
 * no-op rather than another megabyte of parsing.
 */
export function setSpellcheckLanguage(language: SpellcheckLanguage): void {
  if (currentLanguage === language) return

  currentLanguage = language
  ready = false
  loadFailureReported = false

  const sent = send({
    kind: 'load',
    language,
    affUrl: dictionaryUrl(language, 'aff'),
    dicUrl: dictionaryUrl(language, 'dic'),
    personal: readPersonalWords(),
  })

  // Nothing will load, so make sure a linter waiting on `ready` stops waiting.
  if (!sent) notifyChanged()
}

/** Whether a dictionary is loaded and answering. */
export function isSpellcheckReady(): boolean {
  return ready
}

/**
 * Wraps a worker round-trip in a timeout, so a lost message can never leave a
 * lint pass pending forever.
 */
function request<T>(
  pending: Map<number, (value: T) => void>,
  build: (id: number) => SpellcheckRequest,
  fallback: T,
): Promise<T> {
  const id = ++requestCounter

  return new Promise<T>((resolve) => {
    const timeout = setTimeout(() => {
      pending.delete(id)
      resolve(fallback)
    }, REQUEST_TIMEOUT_MS)

    pending.set(id, (value) => {
      clearTimeout(timeout)
      resolve(value)
    })

    if (!send(build(id))) {
      clearTimeout(timeout)
      pending.delete(id)
      resolve(fallback)
    }
  })
}

/**
 * Checks a batch of words in one round-trip.
 *
 * Duplicates are collapsed before sending — a paragraph mentioning the same
 * misspelling five times should cost one lookup, not five.
 *
 * @returns the subset that the dictionary does not know. Empty while no
 *   dictionary is loaded, so nothing is underlined until there is one.
 */
export async function checkWords(words: readonly string[]): Promise<Set<string>> {
  if (!ready || words.length === 0) {
    // Kick off the load the first lint pass would otherwise be waiting for.
    if (!ready && currentLanguage === null) setSpellcheckLanguage(DEFAULT_SPELLCHECK_LANGUAGE)
    return new Set()
  }

  const unique = [...new Set(words)]
  const unknownWords = await request<string[]>(
    pendingChecks,
    (id) => ({ kind: 'check', id, words: unique }),
    [],
  )
  return new Set(unknownWords)
}

/** Correction suggestions for one word, best first. Empty if none or not ready. */
export async function suggestCorrections(word: string): Promise<string[]> {
  if (!ready) return []
  return await request<string[]>(
    pendingSuggestions,
    (id) => ({ kind: 'suggest', id, word }),
    [],
  )
}

/**
 * Adds a word to the personal dictionary — persisted, and pushed into the
 * live worker so the underline disappears without a reload.
 */
export function learnWord(word: string): void {
  if (!addPersonalWord(word)) return
  send({ kind: 'add', words: [word] })
  notifyChanged()
}

/** Test seam — drops the worker and all cached state. */
export function resetSpellcheckClient(): void {
  worker?.terminate()
  worker = null
  workerUnavailable = false
  currentLanguage = null
  ready = false
  loadFailureReported = false
  pendingChecks.clear()
  pendingSuggestions.clear()
  changeListeners.clear()
}
