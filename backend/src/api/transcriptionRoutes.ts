// Transcription Routes — POST /vaults/:vaultId/transcribe
//
// Accepts a multipart audio upload plus a `language` field, forwards it to the
// configured Whisper backend via the TranscriptionService, and returns
// `{ text, detectedLanguage? }`. Audio is never persisted here; the optional
// "save as attachment" flow runs client-side through the existing upload
// endpoint (see the voice-transcription spec).
//
// Protection: session auth (via /api/v1/* middleware) + write access to the
// vault + a per-user rate limit. The `voice-transcription` feature toggle is
// applied as middleware in the composition root, like the other cold features.

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { SlidingWindowRateLimiter } from '../shared/sliding-window-rate-limiter.js'
import {
  transcribeFieldsSchema,
  transcriptionVaultIdParamSchema,
  AudioTooLargeError,
  TranscriptionNotConfiguredError,
  TranscriptionTimeoutError,
  TranscriptionBackendUnavailableError,
} from '../transcription/index.js'
import type { ITranscriptionService } from '../transcription/index.js'

// --- Helper: API Error Response ---

interface ApiError {
  code: string
  message: string
  timestamp: string
}

function createApiError(code: string, message: string): ApiError {
  return { code, message, timestamp: new Date().toISOString() }
}

// --- Dependencies ---

export interface TranscriptionRouteDependencies {
  transcriptionService: ITranscriptionService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  /** Per-user rate limiter (a session-only, resource-heavy endpoint needs its own). */
  rateLimiter: SlidingWindowRateLimiter
  logger: ILogger
}

// --- Route Factory ---

export function createTranscriptionRoutes(deps: TranscriptionRouteDependencies): Hono {
  const { transcriptionService, accessControl, vaultRegistry, rateLimiter, logger } = deps
  const app = new Hono()

  // POST /vaults/:vaultId/transcribe — transcribe an audio recording to text
  app.post('/vaults/:vaultId/transcribe', async (c: Context) => {
    const params = transcriptionVaultIdParamSchema.safeParse({ vaultId: c.req.param('vaultId') })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId } = params.data

    const session = c.get('session') as SessionContext | undefined
    if (!session) {
      return c.json(createApiError('UNAUTHORIZED', 'Missing session context'), 401)
    }

    // Vault existence + write access
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
    }
    try {
      await accessControl.checkWriteAccess(vaultId, session.userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        return c.json(createApiError('ACCESS_DENIED', error.message), 403)
      }
      if (error instanceof VaultNotFoundError) {
        return c.json(createApiError('VAULT_NOT_FOUND', error.message), 404)
      }
      throw error
    }

    // Not configured → surface a clear 503 rather than attempting a request.
    if (!transcriptionService.isConfigured()) {
      const err = new TranscriptionNotConfiguredError()
      return c.json(createApiError(err.code, err.message), 503)
    }

    // Per-user rate limit — a hijacked/CSRF-forged session must not be able to
    // hammer the (expensive) backend unbounded.
    const rateKey = session.userId
    const limit = rateLimiter.checkLimit(rateKey)
    if (!limit.allowed) {
      c.header('Retry-After', String(limit.retryAfter))
      return c.json(createApiError('RATE_LIMITED', 'Too many transcription requests. Please wait and try again.'), 429)
    }

    // Parse multipart body
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid multipart form data'), 400)
    }

    const audioPart = formData.get('audio')
    if (!(audioPart instanceof File)) {
      return c.json(createApiError('VALIDATION_ERROR', 'Missing audio file part'), 400)
    }

    const fields = transcribeFieldsSchema.safeParse({
      language: formData.get('language') ?? undefined,
      saveAudio: formData.get('saveAudio') ?? undefined,
    })
    if (!fields.success) {
      return c.json(createApiError('VALIDATION_ERROR', fields.error.issues[0]?.message ?? 'Invalid fields'), 400)
    }

    // A client `'auto'` selection maps to "let the backend detect" (undefined).
    const language = fields.data.language && fields.data.language !== 'auto' ? fields.data.language : undefined

    const audio = Buffer.from(await audioPart.arrayBuffer())
    const contentType = audioPart.type || 'application/octet-stream'

    // Record the request against the rate limit only once we're actually
    // attempting a (billable/expensive) transcription.
    rateLimiter.recordRequest(rateKey)

    try {
      const result = await transcriptionService.transcribe({ audio, contentType, language })
      logger.info('Transcription completed', { vaultId, bytes: audio.length })
      return c.json(result, 200)
    } catch (error) {
      if (error instanceof AudioTooLargeError) {
        return c.json(createApiError(error.code, error.message), 413)
      }
      if (error instanceof TranscriptionNotConfiguredError) {
        return c.json(createApiError(error.code, error.message), 503)
      }
      if (error instanceof TranscriptionTimeoutError) {
        return c.json(createApiError(error.code, error.message), 504)
      }
      if (error instanceof TranscriptionBackendUnavailableError) {
        return c.json(createApiError(error.code, 'The transcription backend is currently unavailable.'), 502)
      }
      logger.error('Transcription failed unexpectedly', {
        vaultId, message: error instanceof Error ? error.message : String(error),
      })
      return c.json(createApiError('INTERNAL_ERROR', 'Transcription failed'), 500)
    }
  })

  return app
}
