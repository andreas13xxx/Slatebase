/**
 * Zod validation schemas for the spellcheck dictionary API input.
 */

import { z } from 'zod'
import { MAX_SPELLCHECK_WORDS, MAX_SPELLCHECK_WORD_LENGTH } from './types.js'

// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARACTERS = /[\s\u0000-\u001f\u007f]/

/** Whether a string is an acceptable dictionary word as it stands (no trimming). */
export function isValidSpellcheckWord(word: string): boolean {
  return word.length >= 1 && word.length <= MAX_SPELLCHECK_WORD_LENGTH && !FORBIDDEN_CHARACTERS.test(word)
}

/** A single dictionary word: trimmed, no whitespace or control characters inside. */
export const spellcheckWordSchema = z
  .string()
  .trim()
  .min(1, 'Word must not be empty')
  .max(MAX_SPELLCHECK_WORD_LENGTH, `Word must be at most ${MAX_SPELLCHECK_WORD_LENGTH} characters`)
  .refine((val) => !FORBIDDEN_CHARACTERS.test(val), 'Word must not contain whitespace or control characters')

/** Body of `POST /spellcheck/words` — one or more words to add. */
export const addSpellcheckWordsSchema = z.object({
  words: z.array(spellcheckWordSchema).min(1, 'At least one word is required').max(MAX_SPELLCHECK_WORDS),
})

/** Body of `POST /spellcheck/words/remove` — the word travels in the body, not the path (`..`, `/`). */
export const removeSpellcheckWordSchema = z.object({
  word: z.string().min(1, 'Word must not be empty').max(MAX_SPELLCHECK_WORD_LENGTH, `Word must be at most ${MAX_SPELLCHECK_WORD_LENGTH} characters`),
})

export type AddSpellcheckWordsInput = z.infer<typeof addSpellcheckWordsSchema>
