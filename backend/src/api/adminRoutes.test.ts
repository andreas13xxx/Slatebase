// Unit tests for adminRoutes — Input validation (400 responses)

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { IAuthService } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IUserService, IRoleService, PaginatedResult } from '../user/index.js'
import type { IAuditService } from '../audit/index.js'
import type { IConfigService } from '../config/index.js'
import type { PublicUserInfo } from '../user/index.js'
import { createAdminRoutes } from './adminRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

function createMockUserService(overrides: Partial<IUserService> = {}): IUserService {
  return {
    createUser: async () => ({ userId: 'u1', username: 'test', displayName: 'Test', email: '', avatarUrl: '', role: 'user' as const, preferredLanguage: 'en' as const, colorScheme: 'system' as const, suspended: false, mustChangePassword: false, createdAt: '2025-01-01T00:00:00.000Z' }),
    deleteUser: async () => {},
    updateProfile: async () => ({ userId: 'u1', username: 'test', displayName: 'Test', email: '', avatarUrl: '', role: 'user' as const, preferredLanguage: 'en' as const, colorScheme: 'system' as const, suspended: false, mustChangePassword: false, createdAt: '2025-01-01T00:00:00.000Z' }),
    changePassword: async () => {},
    resetPassword: async () => 'temp-pass',
    getUser: async () => ({ userId: 'admin-1', username: 'admin', displayName: 'Admin', email: '', avatarUrl: '', role: 'admin' as const, preferredLanguage: 'en' as const, colorScheme: 'system' as const, suspended: false, mustChangePassword: false, createdAt: '2025-01-01T00:00:00.000Z' }),
    listUsers: async (): Promise<PaginatedResult<PublicUserInfo>> => ({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    searchUsers: async () => [],
    suspendUser: async () => {},
    unsuspendUser: async () => {},
    deleteSelf: async () => {},
    ...overrides,
  }
}

function createMockRoleService(overrides: Partial<IRoleService> = {}): IRoleService {
  return {
    assignRole: async () => {},
    getRole: async () => 'user' as const,
    canRemoveAdmin: async () => true,
    ...overrides,
  }
}

function createMockAuthService(overrides: Partial<IAuthService> = {}): IAuthService {
  return {
    login: async () => ({ token: '', csrfToken: '', user: {} as PublicUserInfo, expiresAt: '' }),
    logout: async () => {},
    validateSession: async () => null,
    getSessions: async () => [],
    invalidateSession: async () => {},
    invalidateOtherSessions: async () => {},
    generateCsrfToken: () => '',
    validateCsrfToken: () => true,
    ...overrides,
  }
}

function createMockAuditService(): IAuditService {
  return {
    log: async () => {},
    query: async () => ({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
  }
}

function createMockConfigService(): IConfigService {
  return {
    getServerConfig: () => ({}) as ReturnType<IConfigService['getServerConfig']>,
    getVaultConfigs: () => [],
    getFeaturesConfig: () => ({}),
    getSseConfig: () => ({}) as ReturnType<IConfigService['getSseConfig']>,
    getTranscriptionConfig: () => ({}) as ReturnType<IConfigService['getTranscriptionConfig']>,
    getTrashConfig: () => ({}) as ReturnType<IConfigService['getTrashConfig']>,
    getVersionsConfig: () => ({}) as ReturnType<IConfigService['getVersionsConfig']>,
    getCleanupConfig: () => ({}) as ReturnType<IConfigService['getCleanupConfig']>,
    getTemplatesConfig: () => ({}) as ReturnType<IConfigService['getTemplatesConfig']>,
    getUploadConfig: () => ({}) as ReturnType<IConfigService['getUploadConfig']>,
    getProxyConfig: () => ({ allowedOrigins: [] }) as ReturnType<IConfigService['getProxyConfig']>,
    getWelcomeVaultConfig: () => ({}) as ReturnType<IConfigService['getWelcomeVaultConfig']>,
    getOverrides: () => ({}),
    updateOverrides: async () => [],
  }
}

// ─── Test App Factory ────────────────────────────────────────────────────────

const adminSession: SessionContext = {
  userId: 'admin-1',
  username: 'admin',
  role: 'admin',
  sessionId: 'session-1',
}

function createTestApp(options: {
  session?: SessionContext | null
  userService?: IUserService
  roleService?: IRoleService
} = {}) {
  const logger = createMockLogger()
  const userService = options.userService ?? createMockUserService()
  const roleService = options.roleService ?? createMockRoleService()
  const authService = createMockAuthService()
  const auditService = createMockAuditService()
  const configService = createMockConfigService()

  const app = new Hono()

  // Simulate auth middleware setting session context
  const session = options.session !== undefined ? options.session : adminSession
  if (session !== null) {
    app.use('*', async (c, next) => {
      c.set('session' as never, session as never)
      return next()
    })
  }

  const routes = createAdminRoutes({
    userService,
    roleService,
    authService,
    auditService,
    configService,
    logger,
  })
  app.route('/admin', routes)
  return app
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Admin Routes — Input Validation', () => {
  describe('GET /admin/users', () => {
    it('returns 400 when page query param is not a valid number', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/users?page=abc')
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string; message: string; timestamp: string }
      expect(body.code).toBe('VALIDATION_ERROR')
      expect(body).toHaveProperty('timestamp')
    })

    it('returns 400 when page is zero', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/users?page=0')
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when pageSize exceeds maximum (100)', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/users?pageSize=999')
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 200 with valid pagination params', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/users?page=1&pageSize=10')
      expect(res.status).toBe(200)
    })
  })

  describe('PUT /admin/users/:userId/role', () => {
    it('returns 400 when role is invalid', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/users/user-1/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'superadmin' }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string; message: string; timestamp: string }
      expect(body.code).toBe('VALIDATION_ERROR')
      expect(body).toHaveProperty('timestamp')
    })

    it('returns 400 when role field is missing', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/users/user-1/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 200 with valid role', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/users/user-1/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      })
      expect(res.status).toBe(200)
    })
  })

  describe('PUT /admin/config — proxy', () => {
    const baseConfig = {
      port: 3000,
      host: '127.0.0.1',
      logLevel: 'info',
      maxFileSize: 5242880,
      allowedOrigins: ['http://localhost:5173'],
    }

    it('returns 400 when a proxy origin carries a scheme', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseConfig,
          proxy: { allowedOrigins: ['https://api.github.com'] },
        }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when a proxy origin contains a path', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseConfig,
          proxy: { allowedOrigins: ['api.github.com/repos'] },
        }),
      })
      expect(res.status).toBe(400)
    })

    it('accepts a bare hostname and a "*." wildcard proxy origin', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseConfig,
          proxy: { allowedOrigins: ['api.github.com', '*.githubusercontent.com'] },
        }),
      })
      expect(res.status).toBe(200)
    })

    it('accepts a single-label host (e.g. a Docker-network CouchDB)', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseConfig,
          proxy: { allowedOrigins: ['couchdb'] },
        }),
      })
      expect(res.status).toBe(200)
    })
  })

  describe('PUT /admin/config — session & SSE', () => {
    const baseConfig = {
      port: 3000,
      host: '127.0.0.1',
      logLevel: 'info',
      maxFileSize: 5242880,
      allowedOrigins: ['http://localhost:5173'],
    }

    it('accepts valid session and SSE overrides', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseConfig,
          sessionDurationHours: 12,
          sessionMaxLifetimeDays: 14,
          sse: { maxConnections: 500, maxPerUser: 5 },
        }),
      })
      expect(res.status).toBe(200)
    })

    it('rejects a session duration that exceeds the absolute max lifetime', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseConfig,
          // 48h sliding window against a 1-day (24h) absolute cap is contradictory.
          sessionDurationHours: 48,
          sessionMaxLifetimeDays: 1,
        }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects an SSE maxPerUser above the cap', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseConfig,
          sse: { maxConnections: 500, maxPerUser: 5000 },
        }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /admin/users', () => {
    it('returns 400 when username is missing', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'ValidPass1!', role: 'user' }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when role is invalid', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'newuser', password: 'ValidPass1!', role: 'moderator' }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('403 for non-admin users', () => {
    it('returns 403 when a non-admin user tries to list users', async () => {
      const nonAdminSession: SessionContext = {
        userId: 'user-2',
        username: 'regular',
        role: 'user',
        sessionId: 'session-2',
      }
      const app = createTestApp({ session: nonAdminSession })

      const res = await app.request('/admin/users')
      expect(res.status).toBe(403)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('FORBIDDEN')
    })
  })
})
