/**
 * Spellcheck module barrel.
 *
 * Slatebase checks spelling itself rather than leaving it to the browser: the
 * editor's own context menu (editor-context-menu.ts) replaces the native one,
 * and no browser exposes its spelling suggestions to JavaScript — so native
 * spellcheck could only ever underline words, never correct them.
 *
 * @module spellcheck
 */
export {
  SPELLCHECK_LANGUAGES,
  SPELLCHECK_LANGUAGE_LABELS,
  DEFAULT_SPELLCHECK_LANGUAGE,
  isSpellcheckLanguage,
  type SpellcheckLanguage,
} from './protocol'

export {
  setSpellcheckLanguage,
  isSpellcheckReady,
  suggestCorrections,
  learnWord,
} from './spellcheck-client'

export { ignoreWordForSession, readPersonalWords, removePersonalWord } from './personal-dictionary'

export {
  spellcheckExtension,
  misspelledWordAt,
  refreshSpellcheck,
  SPELLCHECK_SOURCE,
  type MisspelledWord,
} from './spellcheck-extension'

export { collectWords, type WordToken } from './tokenizer'
