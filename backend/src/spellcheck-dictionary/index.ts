/**
 * Spellcheck dictionary module barrel export.
 */

export {
  SpellcheckDictionaryStore,
  SpellcheckDictionaryFullError,
  SpellcheckDictionaryUnreadableError,
} from './spellcheck-dictionary-store.js'
export type { VaultPathResolver } from './spellcheck-dictionary-store.js'
export { MAX_SPELLCHECK_WORDS, MAX_SPELLCHECK_WORD_LENGTH } from './types.js'
export type { ISpellcheckDictionaryService, SpellcheckWordList } from './types.js'
export { addSpellcheckWordsSchema, spellcheckWordSchema } from './validation.js'
export type { AddSpellcheckWordsInput } from './validation.js'
