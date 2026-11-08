import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { Hono } from 'hono'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from './index.js'
import {
  createSessionWriteRateLimit,
  parseWriteRateLimitMode,
  EXPENSIVE_ROUTE_RULES,
  type SessionWriteRateLimit,
  type WriteRateLimitMode,
} from './session-write-rate-limit.js'

function createMockLogger(): ILogger & { warn: Mock } {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as ILogger & { warn: Mock }
}

function session(userId: string): SessionContext {
  return { userId, username: userId, role: 'user', sessionId: `s-${userId}` }
}

let current: SessionWriteRateLimit | undefined

/** Builds an app whose "auth" middleware takes the user from the X-Test-User header. */
function createApp(
  mode: WriteRateLimitMode,
  logger: ILogger,
  extra: Partial<Parameters<typeof createSessionWriteRateLimit>[0]> = {},
): Hono<{ Variables: { session: SessionContext } }> {
  current = createSessionWriteRateLimit({ mode, logger, ...extra })
  const app = new Hono<{ Variables: { session: SessionContext } }>()
  app.use('/api/v1/*', async (c, next) => {
    const user = c.req.header('X-Test-User')
    if (user !== undefined) c.set('session', session(user))
    await next()
  })
  app.use('/api/v1/*', current.middleware)
  app.all('/api/v1/*', (c) => c.json({ ok: true }))
  return app
}

async function call(app: Hono<{ Variables: { session: SessionContext } }>, method: string, path: string, user = 'u1'): Promise<Response> {
  return app.request(path, { method, headers: { 'X-Test-User': user } })
}

afterEach(() => {
  current?.destroy()
  current = undefined
})

const SMALL = { defaultLimit: { limit: 3, windowMs: 60_000 }, autosaveLimit: { limit: 5, windowMs: 60_000 } }

describe('parseWriteRateLimitMode', () => {
  it('accepts the three modes and falls back to log-only', () => {
    expect(parseWriteRateLimitMode('enforce')).toBe('enforce')
    expect(parseWriteRateLimitMode(' OFF ')).toBe('off')
    expect(parseWriteRateLimitMode('log-only')).toBe('log-only')
    expect(parseWriteRateLimitMode(undefined)).toBe('log-only')
    expect(parseWriteRateLimitMode('bogus')).toBe('log-only')
  })
})

describe('default bucket (enforce)', () => {
  it('limits writes per user, not globally', async () => {
    const app = createApp('enforce', createMockLogger(), SMALL)
    for (let i = 0; i < 3; i++) expect((await call(app, 'POST', '/api/v1/vaults/v1/folders', 'a')).status).toBe(200)
    expect((await call(app, 'POST', '/api/v1/vaults/v1/folders', 'a')).status).toBe(429)
    expect((await call(app, 'POST', '/api/v1/vaults/v1/folders', 'b')).status).toBe(200)
  })

  it('does not count GET requests', async () => {
    const app = createApp('enforce', createMockLogger(), SMALL)
    for (let i = 0; i < 10; i++) expect((await call(app, 'GET', '/api/v1/vaults/v1/tree')).status).toBe(200)
    expect((await call(app, 'POST', '/api/v1/vaults/v1/folders')).status).toBe(200)
  })

  it('answers 429 in the project error format with Retry-After', async () => {
    const app = createApp('enforce', createMockLogger(), SMALL)
    for (let i = 0; i < 3; i++) await call(app, 'PUT', '/api/v1/users/me')
    const res = await call(app, 'PUT', '/api/v1/users/me')
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    const body = (await res.json()) as { code: string; message: string; timestamp: string }
    expect(body.code).toBe('RATE_LIMITED')
    expect(typeof body.message).toBe('string')
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false)
  })

  it('passes requests without a session through', async () => {
    const app = createApp('enforce', createMockLogger(), SMALL)
    for (let i = 0; i < 6; i++) {
      expect((await app.request('/api/v1/vaults/v1/folders', { method: 'POST' })).status).toBe(200)
    }
  })
})

describe('autosave bucket', () => {
  it('has its own higher limit and does not consume the default bucket', async () => {
    const app = createApp('enforce', createMockLogger(), SMALL)
    for (let i = 0; i < 5; i++) expect((await call(app, 'PUT', '/api/v1/vaults/v1/files')).status).toBe(200)
    expect((await call(app, 'PUT', '/api/v1/vaults/v1/files')).status).toBe(429)
    // default bucket (3) is untouched by autosave
    expect((await call(app, 'POST', '/api/v1/vaults/v1/folders')).status).toBe(200)
  })
})

describe('exemptions', () => {
  it.each([
    ['POST', '/api/v1/auth/login'],
    ['PUT', '/api/v1/users/me/password'],
    ['POST', '/api/v1/mcp'],
    ['POST', '/api/v1/mcp/tokens'],
    ['DELETE', '/api/v1/mcp/tokens/t1'],
    ['POST', '/api/v1/chat/conversations/c1/messages'],
    ['POST', '/api/v1/proxy'],
    ['POST', '/api/v1/vaults/v1/transcribe'],
    ['POST', '/api/v1/welcome-vault'],
  ])('%s %s is not counted', async (method, path) => {
    const app = createApp('enforce', createMockLogger(), SMALL)
    for (let i = 0; i < 10; i++) expect((await call(app, method, path)).status).toBe(200)
    // the default bucket is still empty
    for (let i = 0; i < 3; i++) expect((await call(app, 'POST', '/api/v1/vaults/v1/folders')).status).toBe(200)
  })
})

describe('route table', () => {
  it('stricter table rule wins over the default bucket', async () => {
    const app = createApp('enforce', createMockLogger(), { defaultLimit: { limit: 100, windowMs: 60_000 } })
    const path = '/api/v1/vaults/v1/git-sync/remotes/r1/sync-now'
    for (let i = 0; i < 6; i++) expect((await call(app, 'POST', path)).status).toBe(200)
    expect((await call(app, 'POST', path)).status).toBe(429)
    expect((await call(app, 'POST', path, 'other')).status).toBe(200)
  })

  it('table hits also consume the default bucket', async () => {
    const app = createApp('enforce', createMockLogger(), { defaultLimit: { limit: 2, windowMs: 60_000 } })
    expect((await call(app, 'POST', '/api/v1/vaults/v1/replace')).status).toBe(200)
    expect((await call(app, 'POST', '/api/v1/vaults/v1/replace')).status).toBe(200)
    expect((await call(app, 'POST', '/api/v1/vaults/v1/replace')).status).toBe(429)
  })

  it('GET search is limited by the table only (120/min)', async () => {
    const app = createApp('enforce', createMockLogger(), SMALL)
    for (let i = 0; i < 120; i++) expect((await call(app, 'GET', '/api/v1/vaults/v1/search?q=x')).status).toBe(200)
    expect((await call(app, 'GET', '/api/v1/vaults/v1/search?q=x')).status).toBe(429)
    expect((await call(app, 'GET', '/api/v1/search?q=x', 'x')).status).toBe(200)
  })

  it('plugin/theme installs share one bucket (10 per 10 min)', async () => {
    const app = createApp('enforce', createMockLogger(), { defaultLimit: { limit: 1000, windowMs: 60_000 } })
    const paths = [
      '/api/v1/vaults/v1/plugins',
      '/api/v1/vaults/v1/plugins/store-install',
      '/api/v1/plugin-store/update-all',
      '/api/v1/vaults/v1/plugins/abc/update',
      '/api/v1/vaults/v1/theme-store/install',
    ]
    for (let i = 0; i < 10; i++) expect((await call(app, 'POST', paths[i % paths.length] as string)).status).toBe(200)
    expect((await call(app, 'POST', paths[0] as string)).status).toBe(429)
  })

  it('every table rule matches its documented path and method', () => {
    const samples: Array<[string, string, string]> = [
      ['sync-now', 'POST', '/api/v1/vaults/v1/mail-import/c1/import-now'],
      ['check-updates', 'POST', '/api/v1/vaults/v1/plugins/check-updates'],
      ['vault-destructive', 'DELETE', '/api/v1/vaults/v1'],
      ['vault-destructive', 'POST', '/api/v1/vaults/v1/transfer'],
      ['vault-destructive', 'PUT', '/api/v1/vaults/v1/shares/u2'],
      ['admin-users', 'POST', '/api/v1/admin/users'],
      ['admin-users', 'PUT', '/api/v1/admin/users/u1/password'],
      ['admin-users', 'DELETE', '/api/v1/admin/users/u1'],
      ['admin-users', 'POST', '/api/v1/admin/restart'],
      ['import-upload', 'POST', '/api/v1/vaults/v1/import/folder'],
      ['import-upload', 'POST', '/api/v1/vaults/v1/upload'],
      ['generate-ssh-key', 'POST', '/api/v1/vaults/v1/git-sync/generate-ssh-key'],
    ]
    for (const [name, method, path] of samples) {
      const rule = EXPENSIVE_ROUTE_RULES.find((r) => r.name === name)
      expect(rule, name).toBeDefined()
      expect(rule?.methods.includes(method), `${name} ${method}`).toBe(true)
      expect(rule?.pattern.test(path), `${name} ${path}`).toBe(true)
    }
  })
})

describe('log-only mode', () => {
  it('never blocks but logs "would block"', async () => {
    const logger = createMockLogger()
    const app = createApp('log-only', logger, SMALL)
    for (let i = 0; i < 6; i++) expect((await call(app, 'POST', '/api/v1/vaults/v1/folders')).status).toBe(200)
    expect(logger.warn).toHaveBeenCalledTimes(3)
    const [message, meta] = logger.warn.mock.calls[0] as [string, { userId: string; buckets: string[] }]
    expect(message).toContain('would block')
    expect(meta.userId).toBe('u1')
    expect(meta.buckets).toEqual(['default'])
  })

  it('logs "blocked" and not "would block" when enforcing', async () => {
    const logger = createMockLogger()
    const app = createApp('enforce', logger, SMALL)
    for (let i = 0; i < 4; i++) await call(app, 'POST', '/api/v1/vaults/v1/folders')
    expect((logger.warn.mock.calls[0] as [string])[0]).toContain('blocked')
  })
})

describe('off mode', () => {
  it('neither counts nor blocks nor logs', async () => {
    const logger = createMockLogger()
    const app = createApp('off', logger, SMALL)
    for (let i = 0; i < 20; i++) expect((await call(app, 'POST', '/api/v1/vaults/v1/folders')).status).toBe(200)
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
