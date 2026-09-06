// Voice Transcription — Zod validation schemas
//
// The audio itself arrives as a multipart file part (validated for size/type in
// the route + service); these schemas cover the accompanying scalar fields and
// route params.

import { z } from 'zod'
import { SUPPORTED_TRANSCRIPTION_LANGUAGES } from './types.js'

/**
 * The `language` field accompanying an audio upload: a supported Whisper code
 * or `'auto'`. Optional — absent is treated as `'auto'` by the route.
 */
export const transcriptionLanguageSchema = z
  .enum([...SUPPORTED_TRANSCRIPTION_LANGUAGES, 'auto'])
  .optional()

/**
 * Scalar fields submitted alongside the audio part. Multipart values arrive as
 * strings, so `saveAudio` is coerced from `'true'`/`'false'` rather than typed
 * as a boolean.
 */
export const transcribeFieldsSchema = z.object({
  language: transcriptionLanguageSchema,
  /** Whether the client also wants the recording stored as a vault attachment. */
  saveAudio: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})
export type TranscribeFieldsInput = z.infer<typeof transcribeFieldsSchema>

/** Path param for the transcription endpoint. */
export const transcriptionVaultIdParamSchema = z.object({
  vaultId: z.string().min(1, 'vaultId must not be empty'),
})
