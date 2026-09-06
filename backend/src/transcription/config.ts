// Voice Transcription configuration loader — env-driven, config-file defaults
//
// The Whisper backend URL is deployment-specific and read only from the
// environment (like a secret/endpoint): without it the feature stays
// functionally off even when the `voice-transcription` toggle is on. The
// operational limits (timeout, max audio size, offered languages) come from the
// `transcription` server-config section and can be overridden per setting via
// env. The enabled/disabled toggle itself is owned by the FeatureToggleService
// (`isEnabled('voice-transcription')`), not this loader.

import { z } from 'zod'
import type { IConfigService } from '../config/index.js'
import type { TranscriptionConfig } from './types.js'

// --- Zod Schema ---

const TranscriptionConfigSchema = z.object({
  backendUrl: z.string().url().optional(),
  timeoutMs: z.number().int().positive(),
  maxAudioBytes: z.number().int().positive(),
  supportedLanguages: z.array(z.string().min(1)).min(1),
})

// --- Loader ---

/**
 * Load the transcription module configuration.
 *
 * Precedence per value: environment variable > `transcription` config-file
 * section > schema default. The backend URL is env-only — there is no
 * config-file/admin fallback for it, since it points at infrastructure the
 * operator runs, not a value an admin edits at runtime.
 *
 * An empty or missing `SLATEBASE_TRANSCRIPTION_BACKEND_URL` leaves `backendUrl`
 * as `undefined`; the service then reports `isConfigured() === false` and the
 * route surfaces a clear "not configured" error instead of attempting a request.
 *
 * @param configService - The server config service (provides the `transcription` section defaults)
 * @returns Validated transcription configuration
 */
export function loadTranscriptionConfig(configService: IConfigService): TranscriptionConfig {
  const section = configService.getTranscriptionConfig()

  const raw: Record<string, unknown> = {
    backendUrl: normalizeUrl(process.env['SLATEBASE_TRANSCRIPTION_BACKEND_URL']),
    timeoutMs: parsePositiveInt(process.env['SLATEBASE_TRANSCRIPTION_TIMEOUT_MS'], section.timeoutMs),
    maxAudioBytes: parseMaxAudioBytes(process.env['SLATEBASE_TRANSCRIPTION_MAX_AUDIO_MB'], section.maxAudioBytes),
    supportedLanguages: section.supportedLanguages,
  }

  const parsed = TranscriptionConfigSchema.parse(raw)
  return {
    backendUrl: parsed.backendUrl,
    timeoutMs: parsed.timeoutMs,
    maxAudioBytes: parsed.maxAudioBytes,
    supportedLanguages: parsed.supportedLanguages,
  }
}

// --- Helpers ---

/** Treat empty/whitespace-only env values as "not set" (→ undefined). */
function normalizeUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Parse a string env var as a positive integer, else fall back. */
function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue
  const parsed = Number(value)
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
    return defaultValue
  }
  return parsed
}

/**
 * The max-audio env var is expressed in megabytes for operator convenience;
 * the config value is bytes. Accepts fractional MB (e.g. `0.5`), rejects
 * non-positive/NaN.
 */
function parseMaxAudioBytes(value: string | undefined, defaultBytes: number): number {
  if (value === undefined || value === '') return defaultBytes
  const mb = Number(value)
  if (Number.isNaN(mb) || !Number.isFinite(mb) || mb <= 0) {
    return defaultBytes
  }
  return Math.floor(mb * 1024 * 1024)
}
