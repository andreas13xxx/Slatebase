/**
 * Per-vault spellcheck word list data models.
 * Persisted as `.slatebase/spellcheck-words.json` inside each vault's data directory.
 */

/** Maximum number of words a vault's personal dictionary may hold. */
export const MAX_SPELLCHECK_WORDS = 5000

/** Maximum length of a single word, in characters. */
export const MAX_SPELLCHECK_WORD_LENGTH = 100

/** On-disk and wire shape of the list. Always sorted, so a Git merge of two devices' lists is line-based. */
export interface SpellcheckWordList {
  words: string[]
}

/** Service for reading and changing a vault's personal spellcheck dictionary. */
export interface ISpellcheckDictionaryService {
  /** Returns the vault's words, sorted. Empty if none were ever added. */
  getWords(vaultId: string): Promise<SpellcheckWordList>
  /** Adds words to the list (duplicates ignored). Throws `SpellcheckDictionaryFullError` past the cap. */
  addWords(vaultId: string, words: string[]): Promise<SpellcheckWordList>
  /** Removes one word. A word that is not on the list is not an error. */
  removeWord(vaultId: string, word: string): Promise<SpellcheckWordList>
}
