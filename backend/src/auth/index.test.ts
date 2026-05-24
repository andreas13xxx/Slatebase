import { describe, it, expect, beforeEach } from 'vitest'
import type { ILogger } from '../logger/index.js'
import type { IUserRepository } from '../user/index.js'
import type { UserRecord } from '../user/index.js'
import type { ISessionStore, Session, LoginMeta } from './index.js'
import { AuthService, AuthenticationError } from './index.js'
import { AccountSuspendedError } from '../user/index.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

function createMockUser(overrides?: Partial<UserRecord>): UserRecord {
  return {
    userId: 'user-1',
    username: 'testuser',
    // argon2id hash of 'password123'
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG',
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

function createMockSessionStore(): ISessionStore & {
  sessions: Session[]
  invalidatedTokens: string[]
} {
  const sessions: Session[] = []
  const invalidatedTokens: string[] = []

  return {
    sessions,
    invalidatedTokens,
    async create(session: Session): Promise<void> {
      sessions.push(session)
    },
    async update(session: Session): Promise<void> {
      const idx = sessions.findIndex(s => s.sessionId === session.sessionId)
      if (idx !== -1) {
        sessions[idx] = session
      }
    },
    async findByToken(token: string): Promise<Session | null> {
      const session = sessions.find(s => s.token === token)
      if (session === undefined) return null
      if (new Date(session.expiresAt).getTime() <= Date.now()) return null
      return session
    },
    async findByUserId(userId: string): Promise<Session[]> {
      return sessions.filter(s => s.userId === userId)
    },
    async invalidate(token: string): Promise<void> {
      invalidatedTokens.push(token)
      const idx = sessions.findIndex(s => s.token === token)
      if (idx !== -1) {
        sessions.splice(idx, 1)
      }
    },
    async invalidateAllForUser(userId: string, exceptToken?: string): Promise<void> {
      const toRemove = sessions.filter(
        s => s.userId === userId && (exceptToken === undefined || s.token !== exceptToken)
      )
      for (const s of toRemove) {
        invalidatedTokens.push(s.token)
      }
      const remaining = sessions.filter(
        s => s.userId !== userId || (exceptToken !== undefined && s.token === exceptToken)
      )
      sessions.length = 0
      sessions.push(...remaining)
    },
    async cleanup(): Promise<number> {
      return 0
    },
  }
}

function createMockUserRepository(users: UserRecord[]): IUserRepository {
  return {
    async findById(userId: string): Promise<UserRecord | null> {
      return users.find(u => u.userId === userId) ?? null
    },
    async findByUsername(username: string): Promise<UserRecord | null> {
      return users.find(u => u.username === username) ?? null
    },
    async findAll() {
      return { items: users, total: users.length, page: 1, pageSize: 100, totalPages: 1 }
    },
    async save() {},
    async delete() {},
    async count() {
      return users.length
    },
    async countByRole(role) {
      return users.filter(u => u.role === role).length
    },
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  const csrfSecret = 'test-csrf-secret-for-hmac'
  const loginMeta: LoginMeta = { ipAddress: '127.0.0.1', userAgent: 'TestAgent/1.0' }

  let sessionStore: ReturnType<typeof createMockSessionStore>
  let logger: ILogger

  beforeEach(() => {
    sessionStore = createMockSessionStore()
    logger = createMockLogger()
  })

  describe('login', () => {
    it('should throw AuthenticationError for non-existent username', async () => {
      const userRepo = createMockUserRepository([])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      await expect(authService.login('nonexistent', 'password123', loginMeta))
        .rejects.toThrow(AuthenticationError)
    })

    it('should throw AuthenticationError for wrong password', async () => {
      // We need a real argon2 hash for this test
      const { hash } = await import('argon2')
      const passwordHash = await hash('correctpassword', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      await expect(authService.login('testuser', 'wrongpassword', loginMeta))
        .rejects.toThrow(AuthenticationError)
    })

    it('should throw AccountSuspendedError for suspended accounts', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash, suspended: true })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      await expect(authService.login('testuser', 'password123', loginMeta))
        .rejects.toThrow(AccountSuspendedError)
    })

    it('should return LoginResult with correct token format on success', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const result = await authService.login('testuser', 'password123', loginMeta)

      // Token is 128 hex chars (64 bytes)
      expect(result.token).toHaveLength(128)
      expect(result.token).toMatch(/^[0-9a-f]+$/)

      // CSRF token is 64 hex chars (32 bytes)
      expect(result.csrfToken).toHaveLength(64)
      expect(result.csrfToken).toMatch(/^[0-9a-f]+$/)

      // Expiry is 24h from now
      const expiresAt = new Date(result.expiresAt).getTime()
      const now = Date.now()
      const diff = expiresAt - now
      // Should be approximately 24 hours (within 5 seconds tolerance)
      expect(diff).toBeGreaterThan(24 * 60 * 60 * 1000 - 5000)
      expect(diff).toBeLessThanOrEqual(24 * 60 * 60 * 1000)

      // User info
      expect(result.user.userId).toBe('user-1')
      expect(result.user.username).toBe('testuser')
      expect(result.user.role).toBe('user')
    })

    it('should create a session in the store on successful login', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      await authService.login('testuser', 'password123', loginMeta)

      expect(sessionStore.sessions).toHaveLength(1)
      const session = sessionStore.sessions[0]!
      expect(session.userId).toBe('user-1')
      expect(session.role).toBe('user')
      expect(session.ipAddress).toBe('127.0.0.1')
      expect(session.userAgent).toBe('TestAgent/1.0')
    })

    it('should not reveal whether username or password was wrong', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      // Wrong username
      const err1 = await authService.login('wronguser', 'password123', loginMeta).catch(e => e)
      // Wrong password
      const err2 = await authService.login('testuser', 'wrongpassword', loginMeta).catch(e => e)

      expect(err1).toBeInstanceOf(AuthenticationError)
      expect(err2).toBeInstanceOf(AuthenticationError)
      expect(err1.code).toBe(err2.code)
      expect(err1.message).toBe(err2.message)
    })
  })

  describe('logout', () => {
    it('should invalidate the session token', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const result = await authService.login('testuser', 'password123', loginMeta)
      await authService.logout(result.token)

      expect(sessionStore.invalidatedTokens).toContain(result.token)
      expect(sessionStore.sessions).toHaveLength(0)
    })
  })

  describe('validateSession', () => {
    it('should return null for invalid token', async () => {
      const userRepo = createMockUserRepository([])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const result = await authService.validateSession('invalid-token')
      expect(result).toBeNull()
    })

    it('should return SessionContext for valid token', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const loginResult = await authService.login('testuser', 'password123', loginMeta)
      const context = await authService.validateSession(loginResult.token)

      expect(context).not.toBeNull()
      expect(context!.userId).toBe('user-1')
      expect(context!.username).toBe('testuser')
      expect(context!.role).toBe('user')
      expect(context!.sessionId).toBeDefined()
    })

    it('should update lastActivity on the session', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const loginResult = await authService.login('testuser', 'password123', loginMeta)
      const originalLastActivity = sessionStore.sessions[0]!.lastActivity

      // Small delay to ensure timestamp differs
      await new Promise(resolve => setTimeout(resolve, 10))

      await authService.validateSession(loginResult.token)
      const updatedLastActivity = sessionStore.sessions[0]!.lastActivity

      expect(new Date(updatedLastActivity).getTime()).toBeGreaterThanOrEqual(
        new Date(originalLastActivity).getTime()
      )
    })

    it('should return null and invalidate session if user was deleted', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const users = [user]
      const userRepo = createMockUserRepository(users)
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const loginResult = await authService.login('testuser', 'password123', loginMeta)

      // Simulate user deletion
      users.length = 0

      const context = await authService.validateSession(loginResult.token)
      expect(context).toBeNull()
      expect(sessionStore.invalidatedTokens).toContain(loginResult.token)
    })
  })

  describe('getSessions', () => {
    it('should return session info without sensitive data', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      await authService.login('testuser', 'password123', loginMeta)
      const sessions = await authService.getSessions('user-1')

      expect(sessions).toHaveLength(1)
      const session = sessions[0]!
      expect(session.sessionId).toBeDefined()
      expect(session.userAgent).toBe('TestAgent/1.0')
      expect(session.ipAddress).toBe('127.0.0.1')
      expect(session.createdAt).toBeDefined()
      expect(session.lastActivity).toBeDefined()
      // Should NOT contain token or csrfToken
      expect((session as unknown as Record<string, unknown>)['token']).toBeUndefined()
      expect((session as unknown as Record<string, unknown>)['csrfToken']).toBeUndefined()
    })
  })

  describe('invalidateSession', () => {
    it('should invalidate a specific session by sessionId', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const result = await authService.login('testuser', 'password123', loginMeta)
      const sessionId = sessionStore.sessions[0]!.sessionId

      await authService.invalidateSession('user-1', sessionId)

      expect(sessionStore.invalidatedTokens).toContain(result.token)
    })

    it('should not invalidate sessions belonging to other users', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      await authService.login('testuser', 'password123', loginMeta)
      const sessionId = sessionStore.sessions[0]!.sessionId

      // Try to invalidate with wrong userId
      await authService.invalidateSession('other-user', sessionId)

      expect(sessionStore.invalidatedTokens).toHaveLength(0)
      expect(sessionStore.sessions).toHaveLength(1)
    })
  })

  describe('invalidateOtherSessions', () => {
    it('should invalidate all sessions except the current one', async () => {
      const { hash } = await import('argon2')
      const passwordHash = await hash('password123', { type: 2, memoryCost: 4096, timeCost: 2, parallelism: 1 })
      const user = createMockUser({ passwordHash })
      const userRepo = createMockUserRepository([user])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      // Create two sessions
      const result1 = await authService.login('testuser', 'password123', loginMeta)
      const result2 = await authService.login('testuser', 'password123', loginMeta)

      await authService.invalidateOtherSessions('user-1', result1.token)

      // First session should remain
      expect(sessionStore.sessions).toHaveLength(1)
      expect(sessionStore.sessions[0]!.token).toBe(result1.token)
      // Second session should be invalidated
      expect(sessionStore.invalidatedTokens).toContain(result2.token)
    })
  })

  describe('generateCsrfToken', () => {
    it('should generate a deterministic token for the same sessionId', () => {
      const userRepo = createMockUserRepository([])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const token1 = authService.generateCsrfToken('session-123')
      const token2 = authService.generateCsrfToken('session-123')

      expect(token1).toBe(token2)
    })

    it('should generate different tokens for different sessionIds', () => {
      const userRepo = createMockUserRepository([])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const token1 = authService.generateCsrfToken('session-123')
      const token2 = authService.generateCsrfToken('session-456')

      expect(token1).not.toBe(token2)
    })

    it('should return a hex string', () => {
      const userRepo = createMockUserRepository([])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const token = authService.generateCsrfToken('session-123')

      expect(token).toMatch(/^[0-9a-f]+$/)
      // SHA-256 HMAC produces 64 hex chars
      expect(token).toHaveLength(64)
    })
  })

  describe('validateCsrfToken', () => {
    it('should return true for a valid CSRF token', () => {
      const userRepo = createMockUserRepository([])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const token = authService.generateCsrfToken('session-123')
      const isValid = authService.validateCsrfToken('session-123', token)

      expect(isValid).toBe(true)
    })

    it('should return false for an invalid CSRF token', () => {
      const userRepo = createMockUserRepository([])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const isValid = authService.validateCsrfToken('session-123', 'invalid-token')

      expect(isValid).toBe(false)
    })

    it('should return false for a token generated with a different sessionId', () => {
      const userRepo = createMockUserRepository([])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const token = authService.generateCsrfToken('session-456')
      const isValid = authService.validateCsrfToken('session-123', token)

      expect(isValid).toBe(false)
    })

    it('should return false for empty token', () => {
      const userRepo = createMockUserRepository([])
      const authService = new AuthService(sessionStore, userRepo, logger, csrfSecret)

      const isValid = authService.validateCsrfToken('session-123', '')

      expect(isValid).toBe(false)
    })
  })
})
