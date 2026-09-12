// Integration tests for transcriptionRoutes — POST /vaults/:vaultId/transcribe

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import { SlidingWindowRateLimiter } from '../shared/sliding-window-rate-limiter.js'
import {
  AudioTooLargeError,
  TranscriptionBackendUnavailableError,
  TranscriptionTimeoutError,
} from '../transcription/index.js'
import type { ITranscriptionService, TranscriptionResult } from '../transcription/index.js'
import { createTranscriptionRoutes } from './transcriptionRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

function createMockService(overrides: Partial<ITranscriptionService> = {}): ITranscriptionService {
  return {
    isConfigured: () => true,
    getSupportedLanguages: () => ['de', 'en'],
    transcribe: async (): Promise<TranscriptionResult> => ({ text: 'transcribed text' }),
    ...overrides,
  }
}

function createMockAccessControl(overrides: Partial<IVaultAccessControl> = {}): IVaultAccessControl {
  return {
    checkReadAccess: async () => {},
    checkWriteAccess: async () => {},
    checkOwnerAccess: async () => {},
    createShare: async () => {},
    revokeShare: async () => {},
    updateSharePermission: async () => {},
    getUsersWithAccess: async () => [],
    ...overrides,
  }
}

const defaultEntry: VaultRegistryEntry = {
  id: 'vault-1',
  name: 'Test Vault',
  storagePath: '/data/vaults/vault-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  ownerId: 'owner-1',
}

function createMockVaultRegistry(entry: VaultRegistryEntry | null): IVaultRegistry {
  return {
    load: async () => [],
    save: async () => {},
    addEntry: async () => {},
    removeEntry: async () => {},
    findById: () => entry,
    findByName: () => null,
    updateEntries: async (mutator) => mutator([]),
  }
}

function createTestApp(options: {
  service?: ITranscriptionService
  accessControl?: IVaultAccessControl
  entry?: VaultRegistryEntry | null
  session?: SessionContext
  rateLimiter?: SlidingWindowRateLimiter
} = {}) {
  const logger = createMockLogger()
  const transcriptionService = options.service ?? createMockService()
  const accessControl = options.accessControl ?? createMockAccessControl()
  const vaultRegistry = createMockVaultRegistry('entry' in options ? (options.entry ?? null) : defaultEntry)
  const rateLimiter = options.rateLimiter ?? new SlidingWindowRateLimiter(10, 60_000)
  const session: SessionContext = options.session ?? { userId: 'owner-1', username: 'owner', role: 'user', sessionId: 'sess-1' }

  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })
  const routes = createTranscriptionRoutes({ transcriptionService, accessControl, vaultRegistry, rateLimiter, logger })
  app.route('/api/v1', routes)
  return { app, rateLimiter }
}

function audioForm(opts: { audio?: Blob; language?: string; saveAudio?: string; omitAudio?: boolean } = {}): FormData {
  const form = new FormData()
  if (!opts.omitAudio) {
    form.append('audio', opts.audio ?? new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }), 'rec.webm')
  }
  if (opts.language !== undefined) form.append('language', opts.language)
  if (opts.saveAudio !== undefined) form.append('saveAudio', opts.saveAudio)
  return form
}

async function post(app: Hono, vaultId: string, form: FormData): Promise<Response> {
  return app.request(`/api/v1/vaults/${vaultId}/transcribe`, { method: 'POST', body: form })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Transcription Routes', () => {
  it('returns 200 with the transcribed text on success', async () => {
    const { app } = createTestApp({
      service: createMockService({ transcribe: async () => ({ text: 'Hallo Welt', detectedLanguage: 'de' }) }),
    })
    const res = await post(app, 'vault-1', audioForm({ language: 'de' }))
    expect(res.status).toBe(200)
    const body = await res.json() as TranscriptionResult
    expect(body.text).toBe('Hallo Welt')
    expect(body.detectedLanguage).toBe('de')
  })

  it("maps a client 'auto' language to undefined for the service", async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: 'x' })
    const { app } = createTestApp({ service: createMockService({ transcribe }) })
    await post(app, 'vault-1', audioForm({ language: 'auto' }))
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ language: undefined }))
  })

  it('forwards a concrete language to the service', async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: 'x' })
    const { app } = createTestApp({ service: createMockService({ transcribe }) })
    await post(app, 'vault-1', audioForm({ language: 'en' }))
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }))
  })

  it('returns 404 when the vault does not exist', async () => {
    const { app } = createTestApp({ entry: null })
    const res = await post(app, 'missing', audioForm())
    expect(res.status).toBe(404)
  })

  it('returns 503 when the backend is not configured', async () => {
    const { app } = createTestApp({ service: createMockService({ isConfigured: () => false }) })
    const res = await post(app, 'vault-1', audioForm())
    expect(res.status).toBe(503)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('TRANSCRIPTION_NOT_CONFIGURED')
  })

  it('returns 400 when the audio part is missing', async () => {
    const { app } = createTestApp()
    const res = await post(app, 'vault-1', audioForm({ omitAudio: true }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid language value', async () => {
    const { app } = createTestApp()
    const res = await post(app, 'vault-1', audioForm({ language: 'klingon' }))
    expect(res.status).toBe(400)
  })

  it('returns 413 when the service reports the audio is too large', async () => {
    const { app } = createTestApp({
      service: createMockService({ transcribe: async () => { throw new AudioTooLargeError(999, 100) } }),
    })
    const res = await post(app, 'vault-1', audioForm())
    expect(res.status).toBe(413)
  })

  it('returns 504 on a backend timeout', async () => {
    const { app } = createTestApp({
      service: createMockService({ transcribe: async () => { throw new TranscriptionTimeoutError(120000) } }),
    })
    const res = await post(app, 'vault-1', audioForm())
    expect(res.status).toBe(504)
  })

  it('returns 502 when the backend is unavailable, without leaking detail', async () => {
    const { app } = createTestApp({
      service: createMockService({ transcribe: async () => { throw new TranscriptionBackendUnavailableError('ECONNREFUSED at 10.0.0.5') } }),
    })
    const res = await post(app, 'vault-1', audioForm())
    expect(res.status).toBe(502)
    const body = await res.json() as { message: string }
    expect(body.message).not.toContain('10.0.0.5')
  })

  it('returns 500 on an unexpected error', async () => {
    const { app } = createTestApp({
      service: createMockService({ transcribe: async () => { throw new Error('boom') } }),
    })
    const res = await post(app, 'vault-1', audioForm())
    expect(res.status).toBe(500)
  })

  it('enforces the per-user rate limit (429 with Retry-After)', async () => {
    const rateLimiter = new SlidingWindowRateLimiter(1, 60_000)
    const { app } = createTestApp({ rateLimiter })
    const first = await post(app, 'vault-1', audioForm())
    expect(first.status).toBe(200)
    const second = await post(app, 'vault-1', audioForm())
    expect(second.status).toBe(429)
    expect(second.headers.get('Retry-After')).not.toBeNull()
  })

  it('does not consume the rate limit before configuration/access checks', async () => {
    const rateLimiter = new SlidingWindowRateLimiter(1, 60_000)
    const { app } = createTestApp({ service: createMockService({ isConfigured: () => false }), rateLimiter })
    // Two "not configured" calls both return 503; neither should have counted
    // against the limit (checked before recordRequest).
    await post(app, 'vault-1', audioForm())
    const res = await post(app, 'vault-1', audioForm())
    expect(res.status).toBe(503)
  })
})
