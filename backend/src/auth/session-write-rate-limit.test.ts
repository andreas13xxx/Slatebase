import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { Hono } from 'hono'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from './index.js'
import {
  createSessionWriteRateLimit,
  parseWriteRateLimitMode,
  resolveWriteRateLimitMode,
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

  it('GET search is limited by the table only (240/min)', async () => {
    const app = createApp('enforce', createMockLogger(), SMALL)
    for (let i = 0; i < 240; i++) expect((await call(app, 'GET', '/api/v1/vaults/v1/search?q=x')).status).toBe(200)
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
    expect(logger.warn).toHaveBeenCalledTimes(1) // 3 over the limit, throttled to one warning
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

describe('log-only warning throttle', () => {
  afterEach(() => vi.useRealTimers())

  it('warns once per user and bucket per minute, with a suppressed count', async () => {
    vi.useFakeTimers()
    const logger = createMockLogger()
    const app = createApp('log-only', logger, { defaultLimit: { limit: 1, windowMs: 10 * 60_000 } })
    for (let i = 0; i < 5; i++) await call(app, 'POST', '/api/v1/vaults/v1/folders') // 1 ok + 4 over
    await call(app, 'POST', '/api/v1/vaults/v1/folders', 'u2')
    await call(app, 'POST', '/api/v1/vaults/v1/folders', 'u2') // u2 has its own throttle slot
    expect(logger.warn).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(61_000)
    await call(app, 'POST', '/api/v1/vaults/v1/folders')
    expect(logger.warn).toHaveBeenCalledTimes(3)
    const meta = logger.warn.mock.calls[2]?.[1] as { suppressedSinceLastWarning: number }
    expect(meta.suppressedSinceLastWarning).toBe(3)
  })

  it('does not throttle blocked warnings when enforcing', async () => {
    const logger = createMockLogger()
    const app = createApp('enforce', logger, SMALL)
    for (let i = 0; i < 6; i++) await call(app, 'POST', '/api/v1/vaults/v1/folders')
    expect(logger.warn).toHaveBeenCalledTimes(3)
  })
})

describe('resolveWriteRateLimitMode', () => {
  it('warns on an invalid value and falls back to log-only', () => {
    const logger = createMockLogger()
    expect(resolveWriteRateLimitMode('enfroce', logger)).toBe('log-only')
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('stays silent for valid, unset or empty values', () => {
    const logger = createMockLogger()
    for (const v of ['enforce', ' Off ', 'log-only', undefined, '']) resolveWriteRateLimitMode(v, logger)
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe('narrowed chat/MCP exemption and new rules', () => {
  it.each([
    ['POST', '/api/v1/chat/conversations', 30],
    ['DELETE', '/api/v1/mcp/tokens/t1', 20],
    ['PUT', '/api/v1/users/me/email', 5],
    ['POST', '/api/v1/admin/account-settings/test', 5],
    ['PUT', '/api/v1/admin/config', 20],
    ['POST', '/api/v1/auth/passkey/register/verify', 20],
    ['DELETE', '/api/v1/users/me/passkeys/p1', 20],
    ['DELETE', '/api/v1/admin/users/u9/passkeys', 20],
    ['POST', '/api/v1/vaults/v1/public-shares/s1/regenerate', 10],
  ])('%s %s is limited to %i', async (method, path, limit) => {
    const app = createApp('enforce', createMockLogger(), { defaultLimit: { limit: 10_000, windowMs: 60_000 } })
    for (let i = 0; i < limit; i++) expect((await call(app, method, path)).status).toBe(200)
    expect((await call(app, method, path)).status).toBe(429)
  })

  it('mail routes share one bucket', async () => {
    const app = createApp('enforce', createMockLogger(), { defaultLimit: { limit: 10_000, windowMs: 60_000 } })
    for (let i = 0; i < 3; i++) await call(app, 'PUT', '/api/v1/users/me/email')
    for (let i = 0; i < 2; i++) await call(app, 'POST', '/api/v1/admin/account-settings/test')
    expect((await call(app, 'PUT', '/api/v1/users/me/email')).status).toBe(429)
  })

  it('other chat writes now count against the default bucket', async () => {
    const app = createApp('enforce', createMockLogger(), SMALL)
    for (let i = 0; i < 3; i++) await call(app, 'DELETE', '/api/v1/chat/conversations/c1/participants/me')
    expect((await call(app, 'DELETE', '/api/v1/chat/conversations/c1/participants/me')).status).toBe(429)
  })

  it('HEAD on search shares the search bucket', async () => {
    const app = createApp('enforce', createMockLogger(), SMALL)
    for (let i = 0; i < 240; i++) await call(app, 'HEAD', '/api/v1/vaults/v1/search?q=x')
    expect((await call(app, 'GET', '/api/v1/vaults/v1/search?q=x')).status).toBe(429)
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
