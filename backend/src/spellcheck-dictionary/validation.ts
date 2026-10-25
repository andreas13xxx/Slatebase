/**
 * Zod validation schemas for the spellcheck dictionary API input.
 */

import { z } from 'zod'
import { MAX_SPELLCHECK_WORDS, MAX_SPELLCHECK_WORD_LENGTH } from './types.js'

/** A single dictionary word: trimmed, no whitespace or control characters inside. */
export const spellcheckWordSchema = z
  .string()
  .trim()
  .min(1, 'Word must not be empty')
  .max(MAX_SPELLCHECK_WORD_LENGTH, `Word must be at most ${MAX_SPELLCHECK_WORD_LENGTH} characters`)
  // eslint-disable-next-line no-control-regex
  .refine((val) => !/[\s\u0000-\u001f\u007f]/.test(val), 'Word must not contain whitespace or control characters')

/** Body of `POST /spellcheck/words` — one or more words to add. */
export const addSpellcheckWordsSchema = z.object({
  words: z.array(spellcheckWordSchema).min(1, 'At least one word is required').max(MAX_SPELLCHECK_WORDS),
})

export type AddSpellcheckWordsInput = z.infer<typeof addSpellcheckWordsSchema>
