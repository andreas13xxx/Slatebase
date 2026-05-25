import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { AuthController, AuthRouteModule } from './authRoutes.js'
import type { IAuthService, LoginResult, SessionContext, SessionInfo } from '../auth/index.js'
import { AuthenticationError, RateLimitError } from '../auth/index.js'
import { AccountSuspendedError } from '../user/index.js'
import type { ILogger } from '../logger/index.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }
}

function createMockAuthService(overrides: Partial<IAuthService> = {}): IAuthService {
  return {
    login: async () => ({
      token: 'a'.repeat(128),
      csrfToken: 'b'.repeat(64),
      user: {
        userId: 'user-1',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        role: 'user' as const,
        preferredLanguage: 'en' as const,
        colorScheme: 'system' as const,
        suspended: false,
        mustChangePassword: false,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      expiresAt: '2025-01-02T00:00:00.000Z',
    }),
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

// ─── Test App Factory ────────────────────────────────────────────────────────

function createTestApp(authService: IAuthService, sessionContext?: SessionContext) {
  const logger = createMockLogger()
  const controller = new AuthController(authService, logger)
  const routeModule = new AuthRouteModule(controller)

  const app = new Hono()

  // Simulate auth middleware setting session context
  if (sessionContext !== undefined) {
    app.use('*', async (c, next) => {
      c.set('session' as never, sessionContext as never)
      return next()
    })
  }

  routeModule.register(app)
  return app
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  const defaultSession: SessionContext = {
    userId: 'user-1',
    username: 'testuser',
    role: 'user',
    sessionId: 'session-1',
  }

  describe('POST /auth/login', () => {
    it('returns 200 with token, csrfToken, and user info on valid credentials', async () => {
      const authService = createMockAuthService()
      const app = createTestApp(authService)

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'password123' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json() as LoginResult
      expect(body.token).toBe('a'.repeat(128))
      expect(body.csrfToken).toBe('b'.repeat(64))
      expect(body.user.username).toBe('testuser')
      expect(body.expiresAt).toBe('2025-01-02T00:00:00.000Z')
    })

    it('returns 400 on invalid JSON body', async () => {
      const authService = createMockAuthService()
      const app = createTestApp(authService)

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string; message: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when username is missing', async () => {
      const authService = createMockAuthService()
      const app = createTestApp(authService)

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'password123' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when password is empty', async () => {
      const authService = createMockAuthService()
      const app = createTestApp(authService)

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: '' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string; message: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 401 on invalid credentials', async () => {
      const authService = createMockAuthService({
        login: async () => {
          throw new AuthenticationError('INVALID_CREDENTIALS', 'Invalid username or password')
        },
      })
      const app = createTestApp(authService)

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'wrongpass1' }),
      })

      expect(res.status).toBe(401)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 403 when account is suspended', async () => {
      const authService = createMockAuthService({
        login: async () => {
          throw new AccountSuspendedError()
        },
      })
      const app = createTestApp(authService)

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'password123' }),
      })

      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('ACCOUNT_SUSPENDED')
    })

    it('returns 429 when rate limited', async () => {
      const authService = createMockAuthService({
        login: async () => {
          throw new RateLimitError(900)
        },
      })
      const app = createTestApp(authService)

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'password123' }),
      })

      expect(res.status).toBe(429)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('RATE_LIMITED')
      expect(res.headers.get('Retry-After')).toBe('900')
    })
  })

  describe('POST /auth/logout', () => {
    it('returns 204 on successful logout', async () => {
      let loggedOutToken: string | undefined
      const authService = createMockAuthService({
        logout: async (token: string) => {
          loggedOutToken = token
        },
      })
      const app = createTestApp(authService, defaultSession)

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer my-session-token' },
      })

      expect(res.status).toBe(204)
      expect(loggedOutToken).toBe('my-session-token')
    })

    it('returns 401 when no Authorization header is present', async () => {
      const authService = createMockAuthService()
      const app = createTestApp(authService, defaultSession)

      const res = await app.request('/auth/logout', {
        method: 'POST',
      })

      expect(res.status).toBe(401)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })
  })

  describe('GET /auth/sessions', () => {
    it('returns 200 with session list', async () => {
      const mockSessions: SessionInfo[] = [
        {
          sessionId: 'session-1',
          userAgent: 'Mozilla/5.0',
          ipAddress: '192.168.1.1',
          createdAt: '2025-01-01T00:00:00.000Z',
          lastActivity: '2025-01-01T12:00:00.000Z',
        },
      ]
      const authService = createMockAuthService({
        getSessions: async () => mockSessions,
      })
      const app = createTestApp(authService, defaultSession)

      const res = await app.request('/auth/sessions', { method: 'GET' })

      expect(res.status).toBe(200)
      const body = await res.json() as SessionInfo[]
      expect(body).toHaveLength(1)
      expect(body[0]!.sessionId).toBe('session-1')
    })

    it('returns 401 when no session context is set', async () => {
      const authService = createMockAuthService()
      const app = createTestApp(authService) // no session context

      const res = await app.request('/auth/sessions', { method: 'GET' })

      expect(res.status).toBe(401)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })
  })

  describe('DELETE /auth/sessions/:sessionId', () => {
    it('returns 204 on successful session invalidation', async () => {
      let invalidatedSessionId: string | undefined
      const authService = createMockAuthService({
        invalidateSession: async (_userId: string, sessionId: string) => {
          invalidatedSessionId = sessionId
        },
      })
      const app = createTestApp(authService, defaultSession)

      const res = await app.request('/auth/sessions/target-session-id', {
        method: 'DELETE',
      })

      expect(res.status).toBe(204)
      expect(invalidatedSessionId).toBe('target-session-id')
    })

    it('returns 401 when no session context is set', async () => {
      const authService = createMockAuthService()
      const app = createTestApp(authService) // no session context

      const res = await app.request('/auth/sessions/target-session-id', {
        method: 'DELETE',
      })

      expect(res.status).toBe(401)
    })
  })

  describe('DELETE /auth/sessions', () => {
    it('returns 204 on successful invalidation of other sessions', async () => {
      let receivedToken: string | undefined
      const authService = createMockAuthService({
        invalidateOtherSessions: async (_userId: string, currentToken: string) => {
          receivedToken = currentToken
        },
      })
      const app = createTestApp(authService, defaultSession)

      const res = await app.request('/auth/sessions', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer keep-this-token' },
      })

      expect(res.status).toBe(204)
      expect(receivedToken).toBe('keep-this-token')
    })

    it('returns 401 when no session context is set', async () => {
      const authService = createMockAuthService()
      const app = createTestApp(authService) // no session context

      const res = await app.request('/auth/sessions', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer some-token' },
      })

      expect(res.status).toBe(401)
    })

    it('returns 401 when no Authorization header is present', async () => {
      const authService = createMockAuthService()
      const app = createTestApp(authService, defaultSession)

      const res = await app.request('/auth/sessions', {
        method: 'DELETE',
      })

      expect(res.status).toBe(401)
    })
  })
})
