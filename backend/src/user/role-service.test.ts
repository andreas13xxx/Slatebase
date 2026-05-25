import { describe, it, expect, beforeEach } from 'vitest'
import { RoleService, UserNotFoundError, LastAdminError } from './index.js'
import type { IUserRepository, UserRecord, UserRole, PaginationOptions, PaginatedResult } from './index.js'
import type { ISessionStore, Session } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

function createTestUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    userId: 'user-1',
    username: 'testuser',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    role: 'user',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: '',
    preferredLanguage: 'en',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createTestSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    token: 'token-abc',
    csrfToken: 'csrf-xyz',
    userId: 'user-1',
    role: 'user',
    userAgent: 'TestAgent/1.0',
    ipAddress: '127.0.0.1',
    createdAt: '2025-01-01T00:00:00.000Z',
    expiresAt: '2025-01-02T00:00:00.000Z',
    lastActivity: '2025-01-01T12:00:00.000Z',
    ...overrides,
  }
}

function createMockUserRepository(users: UserRecord[] = []): IUserRepository & { savedUsers: UserRecord[] } {
  const store = new Map<string, UserRecord>(users.map(u => [u.userId, u]))
  const savedUsers: UserRecord[] = []

  return {
    savedUsers,
    async findById(userId: string): Promise<UserRecord | null> {
      return store.get(userId) ?? null
    },
    async findByUsername(username: string): Promise<UserRecord | null> {
      for (const user of store.values()) {
        if (user.username === username) return user
      }
      return null
    },
    async searchByUsernamePrefix(prefix: string, limit: number = 10): Promise<UserRecord[]> {
      const lowerPrefix = prefix.toLowerCase()
      const results: UserRecord[] = []
      for (const user of store.values()) {
        if (user.username.toLowerCase().startsWith(lowerPrefix)) {
          results.push(user)
          if (results.length >= limit) break
        }
      }
      return results
    },
    async findAll(_options?: PaginationOptions): Promise<PaginatedResult<UserRecord>> {
      const items = Array.from(store.values())
      return { items, total: items.length, page: 1, pageSize: 100, totalPages: 1 }
    },
    async save(user: UserRecord): Promise<void> {
      store.set(user.userId, user)
      savedUsers.push(user)
    },
    async delete(userId: string): Promise<void> {
      store.delete(userId)
    },
    async count(): Promise<number> {
      return store.size
    },
    async countByRole(role: UserRole): Promise<number> {
      let count = 0
      for (const user of store.values()) {
        if (user.role === role) count++
      }
      return count
    },
  }
}

function createMockSessionStore(sessions: Session[] = []): ISessionStore & { updatedSessions: Session[] } {
  const store = new Map<string, Session>(sessions.map(s => [s.sessionId, s]))
  const updatedSessions: Session[] = []

  return {
    updatedSessions,
    async create(session: Session): Promise<void> {
      store.set(session.sessionId, session)
    },
    async findByToken(token: string): Promise<Session | null> {
      for (const session of store.values()) {
        if (session.token === token) return session
      }
      return null
    },
    async findByUserId(userId: string): Promise<Session[]> {
      const result: Session[] = []
      for (const session of store.values()) {
        if (session.userId === userId) result.push(session)
      }
      return result
    },
    async invalidate(token: string): Promise<void> {
      for (const [id, session] of store.entries()) {
        if (session.token === token) {
          store.delete(id)
          break
        }
      }
    },
    async invalidateAllForUser(userId: string, exceptToken?: string): Promise<void> {
      for (const [id, session] of store.entries()) {
        if (session.userId === userId && session.token !== exceptToken) {
          store.delete(id)
        }
      }
    },
    async update(session: Session): Promise<void> {
      store.set(session.sessionId, session)
      updatedSessions.push(session)
    },
    async cleanup(): Promise<number> {
      return 0
    },
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RoleService', () => {
  let userRepo: ReturnType<typeof createMockUserRepository>
  let sessionStore: ReturnType<typeof createMockSessionStore>
  let logger: ILogger
  let roleService: RoleService

  beforeEach(() => {
    userRepo = createMockUserRepository()
    sessionStore = createMockSessionStore()
    logger = createMockLogger()
    roleService = new RoleService(userRepo, sessionStore, logger)
  })

  describe('getRole', () => {
    it('should return the role of an existing user', async () => {
      const user = createTestUser({ userId: 'u1', role: 'admin' })
      userRepo = createMockUserRepository([user])
      roleService = new RoleService(userRepo, sessionStore, logger)

      const role = await roleService.getRole('u1')
      expect(role).toBe('admin')
    })

    it('should throw UserNotFoundError for non-existent user', async () => {
      await expect(roleService.getRole('non-existent')).rejects.toThrow(UserNotFoundError)
    })
  })

  describe('assignRole', () => {
    it('should update the user role in the repository', async () => {
      const user = createTestUser({ userId: 'u1', role: 'user' })
      userRepo = createMockUserRepository([user])
      roleService = new RoleService(userRepo, sessionStore, logger)

      await roleService.assignRole('u1', 'admin')

      const updatedUser = await userRepo.findById('u1')
      expect(updatedUser?.role).toBe('admin')
    })

    it('should update all active sessions with the new role', async () => {
      const user = createTestUser({ userId: 'u1', role: 'user' })
      const session1 = createTestSession({ sessionId: 's1', userId: 'u1', role: 'user', token: 'tok1' })
      const session2 = createTestSession({ sessionId: 's2', userId: 'u1', role: 'user', token: 'tok2' })

      userRepo = createMockUserRepository([user])
      sessionStore = createMockSessionStore([session1, session2])
      roleService = new RoleService(userRepo, sessionStore, logger)

      await roleService.assignRole('u1', 'admin')

      // Both sessions should have been updated
      expect(sessionStore.updatedSessions).toHaveLength(2)
      expect(sessionStore.updatedSessions[0]?.role).toBe('admin')
      expect(sessionStore.updatedSessions[1]?.role).toBe('admin')
    })

    it('should not update sessions of other users', async () => {
      const user1 = createTestUser({ userId: 'u1', role: 'user', username: 'user1' })
      const user2 = createTestUser({ userId: 'u2', role: 'user', username: 'user2' })
      const session1 = createTestSession({ sessionId: 's1', userId: 'u1', role: 'user', token: 'tok1' })
      const session2 = createTestSession({ sessionId: 's2', userId: 'u2', role: 'user', token: 'tok2' })

      userRepo = createMockUserRepository([user1, user2])
      sessionStore = createMockSessionStore([session1, session2])
      roleService = new RoleService(userRepo, sessionStore, logger)

      await roleService.assignRole('u1', 'admin')

      // Only u1's session should be updated
      expect(sessionStore.updatedSessions).toHaveLength(1)
      expect(sessionStore.updatedSessions[0]?.userId).toBe('u1')
    })

    it('should throw UserNotFoundError for non-existent user', async () => {
      await expect(roleService.assignRole('non-existent', 'admin')).rejects.toThrow(UserNotFoundError)
    })

    it('should throw LastAdminError when demoting the last admin', async () => {
      const admin = createTestUser({ userId: 'u1', role: 'admin', username: 'admin1' })
      userRepo = createMockUserRepository([admin])
      roleService = new RoleService(userRepo, sessionStore, logger)

      await expect(roleService.assignRole('u1', 'user')).rejects.toThrow(LastAdminError)
    })

    it('should allow demoting an admin when other admins exist', async () => {
      const admin1 = createTestUser({ userId: 'u1', role: 'admin', username: 'admin1' })
      const admin2 = createTestUser({ userId: 'u2', role: 'admin', username: 'admin2' })
      userRepo = createMockUserRepository([admin1, admin2])
      roleService = new RoleService(userRepo, sessionStore, logger)

      await roleService.assignRole('u1', 'user')

      const updatedUser = await userRepo.findById('u1')
      expect(updatedUser?.role).toBe('user')
    })

    it('should allow promoting a user to admin without restriction', async () => {
      const user = createTestUser({ userId: 'u1', role: 'user' })
      userRepo = createMockUserRepository([user])
      roleService = new RoleService(userRepo, sessionStore, logger)

      await roleService.assignRole('u1', 'admin')

      const updatedUser = await userRepo.findById('u1')
      expect(updatedUser?.role).toBe('admin')
    })

    it('should handle assigning the same role (no-op on role but still updates)', async () => {
      const user = createTestUser({ userId: 'u1', role: 'user' })
      userRepo = createMockUserRepository([user])
      roleService = new RoleService(userRepo, sessionStore, logger)

      await roleService.assignRole('u1', 'user')

      const updatedUser = await userRepo.findById('u1')
      expect(updatedUser?.role).toBe('user')
    })
  })

  describe('canRemoveAdmin', () => {
    it('should return false when user is the last admin', async () => {
      const admin = createTestUser({ userId: 'u1', role: 'admin' })
      userRepo = createMockUserRepository([admin])
      roleService = new RoleService(userRepo, sessionStore, logger)

      const result = await roleService.canRemoveAdmin('u1')
      expect(result).toBe(false)
    })

    it('should return true when other admins exist', async () => {
      const admin1 = createTestUser({ userId: 'u1', role: 'admin', username: 'admin1' })
      const admin2 = createTestUser({ userId: 'u2', role: 'admin', username: 'admin2' })
      userRepo = createMockUserRepository([admin1, admin2])
      roleService = new RoleService(userRepo, sessionStore, logger)

      const result = await roleService.canRemoveAdmin('u1')
      expect(result).toBe(true)
    })

    it('should return true when user is not an admin', async () => {
      const user = createTestUser({ userId: 'u1', role: 'user' })
      userRepo = createMockUserRepository([user])
      roleService = new RoleService(userRepo, sessionStore, logger)

      const result = await roleService.canRemoveAdmin('u1')
      expect(result).toBe(true)
    })

    it('should throw UserNotFoundError for non-existent user', async () => {
      await expect(roleService.canRemoveAdmin('non-existent')).rejects.toThrow(UserNotFoundError)
    })
  })
})
