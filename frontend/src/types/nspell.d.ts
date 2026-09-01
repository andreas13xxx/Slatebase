/**
 * Hand-written types for `nspell`, which ships as untyped CommonJS
 * (`module.exports = NSpell`) with no bundled `.d.ts` and no `@types` package.
 *
 * Only the surface Slatebase actually calls is declared — `correct` and
 * `suggest` for checking and the context menu, `add` for the personal
 * dictionary (spellcheck.worker.ts).
 */
declare module 'nspell' {
  /** A loaded Hunspell dictionary, ready to check words against. */
  export interface NSpell {
    /** Whether the word is spelled correctly. */
    correct(word: string): boolean
    /** Correction suggestions, best first. Expensive — call it per word, on demand. */
    suggest(word: string): string[]
    /** Detailed verdict: correct, forbidden, or flagged as a warning. */
    spell(word: string): { correct: boolean; forbidden: boolean; warn: boolean }
    /** Teaches the instance a new word, optionally inflected like `model`. */
    add(word: string, model?: string): NSpell
    /** Forgets a previously known word. */
    remove(word: string): NSpell
    /** Merges in an additional `.dic` document. */
    dictionary(dic: string): NSpell
    /** Merges in a personal dictionary (`*word` marks a forbidden word). */
    personal(dic: string): NSpell
  }

  /** Builds a checker from the `.aff` and `.dic` documents of a Hunspell dictionary. */
  export default function nspell(aff: string, dic?: string): NSpell
}
