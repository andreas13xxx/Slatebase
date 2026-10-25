// Integration tests for spellcheckDictionaryRoutes — GET/POST/DELETE /vaults/:vaultId/spellcheck/words

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { ISpellcheckDictionaryService } from '../spellcheck-dictionary/index.js'
import { SpellcheckDictionaryFullError, SpellcheckDictionaryUnreadableError } from '../spellcheck-dictionary/index.js'
import { createSpellcheckDictionaryRoutes } from './spellcheckDictionaryRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

function createMockService(overrides: Partial<ISpellcheckDictionaryService> = {}): ISpellcheckDictionaryService {
  return {
    getWords: async () => ({ words: ['Slatebase'] }),
    addWords: async (_vaultId, words) => ({ words }),
    removeWord: async () => ({ words: [] }),
    ...overrides,
  }
}

function createTestApp(service: ISpellcheckDictionaryService) {
  const session: SessionContext = { userId: 'user-1', username: 'user', role: 'user', sessionId: 'sess-1' }
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })
  app.route('/api/v1', createSpellcheckDictionaryRoutes({ spellcheckDictionaryService: service, logger: createMockLogger() }))
  return app
}

const post = (app: Hono, body: unknown) =>
  app.request('/api/v1/vaults/v1/spellcheck/words', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('spellcheckDictionaryRoutes', () => {
  it('GET returns the word list', async () => {
    const res = await createTestApp(createMockService()).request('/api/v1/vaults/v1/spellcheck/words')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ words: ['Slatebase'] })
  })

  it('POST adds the trimmed words', async () => {
    const res = await post(createTestApp(createMockService()), { words: [' Neu '] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ words: ['Neu'] })
  })

  it('POST rejects invalid bodies with 400', async () => {
    const app = createTestApp(createMockService())
    expect((await post(app, { words: [] })).status).toBe(400)
    expect((await post(app, { words: ['zwei Wörter'] })).status).toBe(400)
    const res = await app.request('/api/v1/vaults/v1/spellcheck/words', { method: 'POST', body: 'nope' })
    expect(res.status).toBe(400)
  })

  it('POST maps a full dictionary to 400', async () => {
    const app = createTestApp(createMockService({
      addWords: async () => { throw new SpellcheckDictionaryFullError(5000) },
    }))
    expect((await post(app, { words: ['x'] })).status).toBe(400)
  })

  it('POST maps an unreadable file to 409 and keeps the message', async () => {
    const app = createTestApp(createMockService({
      addWords: async () => { throw new SpellcheckDictionaryUnreadableError() },
    }))
    const res = await post(app, { words: ['x'] })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe('CONFLICT')
  })

  it('DELETE decodes the word from the path', async () => {
    let removed = ''
    const app = createTestApp(createMockService({
      removeWord: async (_vaultId, word) => { removed = word; return { words: [] } },
    }))
    const res = await app.request(`/api/v1/vaults/v1/spellcheck/words/${encodeURIComponent('Größe')}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(removed).toBe('Größe')
  })

  it('returns 500 for unexpected failures', async () => {
    const app = createTestApp(createMockService({ getWords: async () => { throw new Error('disk') } }))
    expect((await app.request('/api/v1/vaults/v1/spellcheck/words')).status).toBe(500)
  })
})
