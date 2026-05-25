import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { IAuthService, SessionContext } from './index.js'
import type { IUserRepository } from '../user/index.js'
import type { UserRecord } from '../user/index.js'
import { RateLimiter } from './ratelimit.js'
import {
  createAuthMiddleware,
  createCsrfMiddleware,
  createRateLimitMiddleware,
  createMustChangePasswordMiddleware,
} from './middleware.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockAuthService(overrides: Partial<IAuthService> = {}): IAuthService {
  return {
    login: async () => ({ token: 'tok', csrfToken: 'csrf', user: {} as never, expiresAt: '' }),
    logout: async () => {},
    validateSession: async () => null,
    getSessions: async () => [],
    invalidateSession: async () => {},
    invalidateOtherSessions: async () => {},
    generateCsrfToken: () => 'csrf-token',
    validateCsrfToken: () => true,
    ...overrides,
  }
}

function createMockUserRepository(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    findById: async () => null,
    findByUsername: async () => null,
    findAll: async () => ({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 1 }),
    save: async () => {},
    delete: async () => {},
    count: async () => 0,
    countByRole: async () => 0,
    ...overrides,
  }
}

function createMockUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    userId: 'user-1',
    username: 'testuser',
    passwordHash: 'hash',
    role: 'user',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: '',
    preferredLanguage: 'de',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const validSession: SessionContext = {
  userId: 'user-1',
  username: 'testuser',
  role: 'user',
  sessionId: 'session-1',
}

// ─── Auth Middleware Tests ───────────────────────────────────────────────────

describe('createAuthMiddleware', () => {
  it('should skip validation for POST /api/v1/auth/login', async () => {
    const authService = createMockAuthService()
    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.post('/api/v1/auth/login', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/auth/login', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('should return 401 when Authorization header is missing', async () => {
    const authService = createMockAuthService()
    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults')
    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('should return 401 when Authorization header is not Bearer format', async () => {
    const authService = createMockAuthService()
    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults', {
      headers: { Authorization: 'Basic abc123' },
    })
    expect(res.status).toBe(401)
  })

  it('should return 401 when token is empty after Bearer', async () => {
    const authService = createMockAuthService()
    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults', {
      headers: { Authorization: 'Bearer ' },
    })
    expect(res.status).toBe(401)
  })

  it('should return 401 when session is invalid/expired', async () => {
    const authService = createMockAuthService({
      validateSession: async () => null,
    })
    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('SESSION_EXPIRED')
  })

  it('should set session context and call next on valid token', async () => {
    const authService = createMockAuthService({
      validateSession: async () => validSession,
    })
    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.get('/api/v1/vaults', (c) => {
      const session = c.get('session' as never)
      return c.json({ session })
    })

    const res = await app.request('/api/v1/vaults', {
      headers: { Authorization: 'Bearer valid-token-123' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { session: SessionContext }
    expect(body.session).toEqual(validSession)
  })
})

// ─── CSRF Middleware Tests ───────────────────────────────────────────────────

describe('createCsrfMiddleware', () => {
  it('should skip CSRF check for GET requests', async () => {
    const authService = createMockAuthService()
    const app = new Hono()
    app.use('*', createAuthMiddleware(createMockAuthService({ validateSession: async () => validSession })))
    app.use('*', createCsrfMiddleware(authService))
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(200)
  })

  it('should skip CSRF check for HEAD requests', async () => {
    const authService = createMockAuthService()
    const app = new Hono()
    app.use('*', createAuthMiddleware(createMockAuthService({ validateSession: async () => validSession })))
    app.use('*', createCsrfMiddleware(authService))
    // Hono automatically handles HEAD for GET routes
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults', {
      method: 'HEAD',
      headers: { Authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(200)
  })

  it('should skip CSRF check for OPTIONS requests', async () => {
    const authService = createMockAuthService()
    const app = new Hono()
    app.use('*', createAuthMiddleware(createMockAuthService({ validateSession: async () => validSession })))
    app.use('*', createCsrfMiddleware(authService))
    app.on('OPTIONS', '/api/v1/vaults', (c) => c.body(null, 204))

    const res = await app.request('/api/v1/vaults', {
      method: 'OPTIONS',
      headers: { Authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(204)
  })

  it('should skip CSRF check for login endpoint', async () => {
    const authService = createMockAuthService()
    const app = new Hono()
    app.use('*', createCsrfMiddleware(authService))
    app.post('/api/v1/auth/login', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/auth/login', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('should return 403 when CSRF token header is missing on POST', async () => {
    const authService = createMockAuthService()
    const app = new Hono()
    app.use('*', createAuthMiddleware(createMockAuthService({ validateSession: async () => validSession })))
    app.use('*', createCsrfMiddleware(authService))
    app.post('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('CSRF_INVALID')
  })

  it('should return 403 when CSRF token is invalid', async () => {
    const authService = createMockAuthService({
      validateCsrfToken: () => false,
    })
    const app = new Hono()
    app.use('*', createAuthMiddleware(createMockAuthService({ validateSession: async () => validSession })))
    app.use('*', createCsrfMiddleware(authService))
    app.delete('/api/v1/vaults/abc', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults/abc', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid-token',
        'X-CSRF-Token': 'wrong-token',
      },
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('CSRF_INVALID')
  })

  it('should pass through when CSRF token is valid', async () => {
    const authService = createMockAuthService({
      validateCsrfToken: () => true,
    })
    const app = new Hono()
    app.use('*', createAuthMiddleware(createMockAuthService({ validateSession: async () => validSession })))
    app.use('*', createCsrfMiddleware(authService))
    app.put('/api/v1/users/me', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/users/me', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer valid-token',
        'X-CSRF-Token': 'valid-csrf-token',
      },
    })
    expect(res.status).toBe(200)
  })
})

// ─── Rate-Limit Middleware Tests ─────────────────────────────────────────────

describe('createRateLimitMiddleware', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    rateLimiter = new RateLimiter()
  })

  it('should skip rate limiting for non-login endpoints', async () => {
    const app = new Hono()
    app.use('*', createRateLimitMiddleware(rateLimiter))
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults')
    expect(res.status).toBe(200)
  })

  it('should allow login when not rate-limited', async () => {
    const app = new Hono()
    app.use('*', createRateLimitMiddleware(rateLimiter))
    app.post('/api/v1/auth/login', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    })
    expect(res.status).toBe(200)
  })

  it('should return 429 when username is blocked', async () => {
    // Pre-block the username
    for (let i = 0; i < 5; i++) {
      rateLimiter.recordFailedAttempt('blocked-user')
    }

    const app = new Hono()
    app.use('*', createRateLimitMiddleware(rateLimiter))
    app.post('/api/v1/auth/login', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'blocked-user', password: 'password123' }),
    })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    const body = await res.json() as { code: string }
    expect(body.code).toBe('RATE_LIMITED')
  })

  it('should record failed attempt after 401 response', async () => {
    const app = new Hono()
    app.use('*', createRateLimitMiddleware(rateLimiter))
    app.post('/api/v1/auth/login', (c) => {
      return c.json({ code: 'INVALID_CREDENTIALS', message: 'Invalid', timestamp: new Date().toISOString() }, 401)
    })

    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'fail-user', password: 'wrong' }),
      })
    }

    // 6th attempt should be blocked
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'fail-user', password: 'wrong' }),
    })
    expect(res.status).toBe(429)
  })

  it('should reset rate limit on successful login', async () => {
    // Record some failed attempts
    rateLimiter.recordFailedAttempt('reset-user')
    rateLimiter.recordFailedAttempt('reset-user')

    const app = new Hono()
    app.use('*', createRateLimitMiddleware(rateLimiter))
    app.post('/api/v1/auth/login', (c) => c.json({ token: 'abc' }, 200))

    await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'reset-user', password: 'correct' }),
    })

    // After successful login, rate limit should be reset
    const result = rateLimiter.checkRateLimit('reset-user')
    expect(result.allowed).toBe(true)
  })

  it('should pass through when body has no username', async () => {
    const app = new Hono()
    app.use('*', createRateLimitMiddleware(rateLimiter))
    app.post('/api/v1/auth/login', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    })
    expect(res.status).toBe(200)
  })
})

// ─── Must-Change-Password Middleware Tests ───────────────────────────────────

describe('createMustChangePasswordMiddleware', () => {
  it('should pass through when no session is set', async () => {
    const userRepo = createMockUserRepository()
    const app = new Hono()
    app.use('*', createMustChangePasswordMiddleware(userRepo))
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults')
    expect(res.status).toBe(200)
  })

  it('should allow password change endpoint when mustChangePassword is true', async () => {
    const user = createMockUser({ mustChangePassword: true })
    const userRepo = createMockUserRepository({
      findById: async () => user,
    })
    const authService = createMockAuthService({ validateSession: async () => validSession })

    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.use('*', createMustChangePasswordMiddleware(userRepo))
    app.put('/api/v1/users/me/password', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/users/me/password', {
      method: 'PUT',
      headers: { Authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(200)
  })

  it('should allow logout when mustChangePassword is true', async () => {
    const user = createMockUser({ mustChangePassword: true })
    const userRepo = createMockUserRepository({
      findById: async () => user,
    })
    const authService = createMockAuthService({ validateSession: async () => validSession })

    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.use('*', createMustChangePasswordMiddleware(userRepo))
    app.post('/api/v1/auth/logout', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(200)
  })

  it('should return 403 for other endpoints when mustChangePassword is true', async () => {
    const user = createMockUser({ mustChangePassword: true })
    const userRepo = createMockUserRepository({
      findById: async () => user,
    })
    const authService = createMockAuthService({ validateSession: async () => validSession })

    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.use('*', createMustChangePasswordMiddleware(userRepo))
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('PASSWORD_CHANGE_REQUIRED')
  })

  it('should pass through when mustChangePassword is false', async () => {
    const user = createMockUser({ mustChangePassword: false })
    const userRepo = createMockUserRepository({
      findById: async () => user,
    })
    const authService = createMockAuthService({ validateSession: async () => validSession })

    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.use('*', createMustChangePasswordMiddleware(userRepo))
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(200)
  })

  it('should return 401 when user is not found', async () => {
    const userRepo = createMockUserRepository({
      findById: async () => null,
    })
    const authService = createMockAuthService({ validateSession: async () => validSession })

    const app = new Hono()
    app.use('*', createAuthMiddleware(authService))
    app.use('*', createMustChangePasswordMiddleware(userRepo))
    app.get('/api/v1/vaults', (c) => c.json({ ok: true }))

    const res = await app.request('/api/v1/vaults', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })
})
