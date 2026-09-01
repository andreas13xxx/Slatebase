/**
 * Spellcheck Web Worker: owns the nspell instance and the loaded dictionary.
 *
 * This runs off the main thread for two reasons, both of which would otherwise
 * be visible as UI jank while typing:
 *
 * - Building the checker parses a ~1.1 MB `.dic` (German), which takes
 *   several hundred milliseconds.
 * - `nspell.suggest()` generates and verifies edit candidates and can take
 *   100 ms+ for a single long word — right when the user has just opened a
 *   context menu and expects it to appear instantly.
 *
 * The dictionaries themselves are fetched as plain text from
 * `/dictionaries/<lang>.{aff,dic}`, emitted by the `spellcheckDictionaries()`
 * plugin in vite.config.ts. Keeping them out of the JS bundle means the
 * browser caches them separately and the initial page load never pays for them.
 *
 * @module spellcheck/spellcheck.worker
 */
import nspell, { type NSpell } from 'nspell'
import { isKnownCompound } from './compound'
import type { SpellcheckLanguage, SpellcheckRequest, SpellcheckResponse } from './protocol'

/**
 * The worker global. Typed by hand because tsconfig.app.json's `lib` is
 * `["ES2023", "DOM"]` — adding `WebWorker` there would conflict with `DOM`
 * for every other module in the app.
 */
interface WorkerScope {
  postMessage(message: SpellcheckResponse): void
  addEventListener(type: 'message', listener: (event: MessageEvent<SpellcheckRequest>) => void): void
}

const scope = globalThis as unknown as WorkerScope

/** Caps the verdict cache so a long session can't grow it without bound. */
const VERDICT_CACHE_LIMIT = 20_000

let speller: NSpell | null = null

/**
 * Whether the loaded dictionary needs the compound fallback. English forms
 * compounds with spaces or hyphens, so enabling it there would only invent
 * acceptances ("carpetbagger" is fine, "cardog" would become fine too).
 */
let compoundSplitting = false

/**
 * Memoises verdicts across lint passes — the same paragraph is re-checked on
 * every pause in typing, and the compound walk is the expensive path.
 */
const verdictCache = new Map<string, boolean>()

/**
 * Increments on every load request. A response from a superseded load (the
 * user switched language while the previous dictionary was still downloading)
 * carries a stale token and is dropped instead of overwriting the newer one.
 */
let loadToken = 0

/** Personal words, re-applied to each newly built instance. */
const personalWords = new Set<string>()

function respond(message: SpellcheckResponse): void {
  scope.postMessage(message)
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} — ${url}`)
  }
  return await response.text()
}

async function load(language: SpellcheckLanguage, affUrl: string, dicUrl: string, personal: string[]): Promise<void> {
  const token = ++loadToken
  // Drop the old checker immediately: until the new one is ready, "no
  // dictionary" (nothing underlined) is the honest state, and reporting
  // German verdicts on English text would be worse than reporting none.
  speller = null
  verdictCache.clear()

  try {
    const [aff, dic] = await Promise.all([fetchText(affUrl), fetchText(dicUrl)])
    if (token !== loadToken) return

    const instance = nspell(aff, dic)

    personalWords.clear()
    for (const word of personal) {
      personalWords.add(word)
      instance.add(word)
    }

    speller = instance
    compoundSplitting = language === 'de'
    respond({ kind: 'loaded', language })
  } catch (error) {
    if (token !== loadToken) return
    respond({
      kind: 'load-failed',
      language,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * A straight dictionary lookup, case-insensitive on the first letter.
 *
 * A capitalised word also counts as known when its lowercase form is — an
 * English sentence opener ("Their" vs. dictionary entry "their") would
 * otherwise be flagged — and vice versa, because the second half of a German
 * compound is written lowercase while the dictionary lists the noun
 * capitalised ("…struktur" vs. "Struktur").
 */
function inDictionary(word: string): boolean {
  if (!speller) return true
  if (speller.correct(word)) return true

  const lowercased = word.toLowerCase()
  if (lowercased !== word && speller.correct(lowercased)) return true

  const capitalised = word.charAt(0).toUpperCase() + word.slice(1)
  return capitalised !== word && speller.correct(capitalised)
}

/** The full verdict for one word: dictionary first, compound split second. */
function isKnown(word: string): boolean {
  if (!speller) return true

  const cached = verdictCache.get(word)
  if (cached !== undefined) return cached

  const known = inDictionary(word)
    || (compoundSplitting && isKnownCompound(word, inDictionary))

  if (verdictCache.size >= VERDICT_CACHE_LIMIT) verdictCache.clear()
  verdictCache.set(word, known)
  return known
}

scope.addEventListener('message', (event) => {
  const request = event.data

  switch (request.kind) {
    case 'load':
      void load(request.language, request.affUrl, request.dicUrl, request.personal)
      break

    case 'check':
      respond({
        kind: 'check-result',
        id: request.id,
        // With no dictionary loaded every word is "known", so the editor shows
        // nothing rather than underlining the entire document.
        unknownWords: speller ? request.words.filter((word) => !isKnown(word)) : [],
      })
      break

    case 'suggest':
      respond({
        kind: 'suggest-result',
        id: request.id,
        suggestions: speller ? speller.suggest(request.word).slice(0, 8) : [],
      })
      break

    case 'add': {
      let added = false
      for (const word of request.words) {
        if (personalWords.has(word)) continue
        personalWords.add(word)
        speller?.add(word)
        added = true
      }
      // The whole cache goes, not just the added words: a learned word can
      // also be the missing part of a compound cached as unknown.
      if (added) verdictCache.clear()
      break
    }
  }
})
