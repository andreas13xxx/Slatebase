// Integration tests for welcomeVaultRoutes — HTTP integration tests + unit tests for deduplicateVaultName

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IWelcomeVaultService, WelcomeVaultResult } from '../welcome-vault/index.js'
import type { IUserService, PublicUserInfo } from '../user/index.js'
import type { IVaultService } from '../business/index.js'
import type { VaultInfo } from '../vault/index.js'
import type { IFeatureToggleService } from '../feature-toggle/types.js'
import type { IConfigService } from '../config/index.js'
import { LinkIndexService } from '../link-index/index.js'
import { createWelcomeVaultRoutes, deduplicateVaultName } from './welcomeVaultRoutes.js'
import type { WelcomeVaultRouteDependencies } from './welcomeVaultRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }
}

function createMockWelcomeVaultService(overrides: Partial<IWelcomeVaultService> = {}): IWelcomeVaultService {
  return {
    createWelcomeVault: async (): Promise<WelcomeVaultResult | undefined> => ({
      vaultId: 'vault-123',
      storagePath: '/data/vaults/vault-123',
      vaultName: 'Willkommen',
    }),
    ...overrides,
  }
}

function createMockUserService(overrides: Partial<IUserService> = {}): IUserService {
  return {
    createUser: async () => ({} as PublicUserInfo),
    deleteUser: async () => {},
    updateProfile: async () => ({} as PublicUserInfo),
    changePassword: async () => {},
    resetPassword: async () => 'temp-password',
    getUser: async (): Promise<PublicUserInfo> => ({
      userId: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      email: '',
      avatarUrl: '',
      role: 'user',
      preferredLanguage: 'de',
      colorScheme: 'system',
      suspended: false,
      mustChangePassword: false,
      createdAt: '2024-01-01T00:00:00.000Z',
    }),
    listUsers: async () => ({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    searchUsers: async () => [],
    suspendUser: async () => {},
    unsuspendUser: async () => {},
    deleteSelf: async () => {},
    ...overrides,
  }
}

function createMockVaultService(overrides: Partial<IVaultService> = {}): IVaultService {
  return {
    initializeVaults: async () => {},
    getVaultList: async (): Promise<VaultInfo[]> => [],
    getVaultTree: async () => ({ name: '/', type: 'directory' as const, children: [] }),
    getFileContent: async () => ({ content: '', lastModified: new Date() }),
    createFile: async () => {},
    updateFile: async () => {},
    deleteFile: async () => {},
    createDirectory: async () => {},
    deleteDirectory: async () => {},
    renameFile: async () => {},
    moveFile: async () => {},
    createVault: async () => ({ id: 'vault-123', name: 'Test', path: '/data/vaults/vault-123', status: 'loaded' as const }),
    deleteVault: async () => {},
    ...overrides,
  } as unknown as IVaultService
}

function createMockFeatureToggleService(overrides: Partial<IFeatureToggleService> = {}): IFeatureToggleService {
  return {
    isEnabled: () => true,
    setEnabled: () => ({ name: '', enabled: true, restartRequired: false }),
    getAll: () => [],
    get: () => undefined,
    onChange: () => {},
    ...overrides,
  }
}

function createMockConfigService(overrides: Partial<IConfigService> = {}): IConfigService {
  return {
    getServerConfig: () => ({} as ReturnType<IConfigService['getServerConfig']>),
    getVaultConfigs: () => [],
    getFeaturesConfig: () => ({}),
    getSseConfig: () => ({} as ReturnType<IConfigService['getSseConfig']>),
    getTrashConfig: () => ({} as ReturnType<IConfigService['getTrashConfig']>),
    getVersionsConfig: () => ({} as ReturnType<IConfigService['getVersionsConfig']>),
    getCleanupConfig: () => ({} as ReturnType<IConfigService['getCleanupConfig']>),
    getTemplatesConfig: () => ({} as ReturnType<IConfigService['getTemplatesConfig']>),
    getUploadConfig: () => ({} as ReturnType<IConfigService['getUploadConfig']>),
    getWelcomeVaultConfig: () => ({
      name: { de: 'Willkommen', en: 'Welcome' },
    }),
    ...overrides,
  }
}

// ─── Test App Factory ────────────────────────────────────────────────────────

const defaultSession: SessionContext = {
  userId: 'user-1',
  username: 'testuser',
  role: 'user',
  sessionId: 'session-1',
}

function createTestApp(options: {
  welcomeVaultService?: IWelcomeVaultService
  userService?: IUserService
  vaultService?: IVaultService
  featureToggleService?: IFeatureToggleService
  configService?: IConfigService
  session?: SessionContext | null
  csrfValid?: boolean
} = {}) {
  const logger = createMockLogger()
  const welcomeVaultService = options.welcomeVaultService ?? createMockWelcomeVaultService()
  const userService = options.userService ?? createMockUserService()
  const vaultService = options.vaultService ?? createMockVaultService()
  const featureToggleService = options.featureToggleService ?? createMockFeatureToggleService()
  const configService = options.configService ?? createMockConfigService()
  const linkIndexMap = new Map<string, InstanceType<typeof LinkIndexService>>()

  const deps: WelcomeVaultRouteDependencies = {
    welcomeVaultService,
    userService,
    vaultService,
    featureToggleService,
    configService,
    linkIndexMap,
    logger,
  }

  const app = new Hono()

  // Simulate auth middleware setting session context
  if (options.session !== null) {
    const session = options.session ?? defaultSession
    app.use('*', async (c, next) => {
      c.set('session' as never, session as never)
      return next()
    })
  }

  const routes = createWelcomeVaultRoutes(deps)
  app.route('/api/v1', routes)
  return app
}

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Welcome Vault Routes', () => {
  describe('POST /welcome-vault', () => {
    it('returns 201 with vaultId and vaultName on success', async () => {
      const session: SessionContext = { userId: 'user-201', username: 'user201', role: 'user', sessionId: 'sess-201' }
      const app = createTestApp({ session })

      const res = await app.request('/api/v1/welcome-vault', { method: 'POST' })
      expect(res.status).toBe(201)

      const body = await res.json() as { vaultId: string; vaultName: string }
      expect(body.vaultId).toBe('vault-123')
      expect(body.vaultName).toBe('Willkommen')
    })

    it('returns 403 when feature toggle is disabled', async () => {
      const session: SessionContext = { userId: 'user-403', username: 'user403', role: 'user', sessionId: 'sess-403' }
      const featureToggleService = createMockFeatureToggleService({
        isEnabled: (name) => name !== 'welcome-vault',
      })
      const app = createTestApp({ featureToggleService, session })

      const res = await app.request('/api/v1/welcome-vault', { method: 'POST' })
      expect(res.status).toBe(403)

      const body = await res.json() as { code: string; message: string; timestamp: string }
      expect(body.code).toBe('FEATURE_DISABLED')
      expect(body.timestamp).toBeDefined()
    })

    it('deduplicates vault name when base name already exists', async () => {
      const session: SessionContext = { userId: 'user-dedup', username: 'userdedup', role: 'user', sessionId: 'sess-dedup' }
      let capturedName: string | undefined
      const welcomeVaultService = createMockWelcomeVaultService({
        createWelcomeVault: async (_userId, _lang, overrideName): Promise<WelcomeVaultResult | undefined> => {
          capturedName = overrideName
          return {
            vaultId: 'vault-456',
            storagePath: '/data/vaults/vault-456',
            vaultName: overrideName ?? 'Willkommen',
          }
        },
      })
      const vaultService = createMockVaultService({
        getVaultList: async (): Promise<VaultInfo[]> => [
          { id: 'v1', name: 'Willkommen', path: '/vaults/v1', status: 'loaded' },
        ],
      })
      const app = createTestApp({ welcomeVaultService, vaultService, session })

      const res = await app.request('/api/v1/welcome-vault', { method: 'POST' })
      expect(res.status).toBe(201)

      const body = await res.json() as { vaultId: string; vaultName: string }
      expect(body.vaultName).toBe('Willkommen (2)')
      expect(capturedName).toBe('Willkommen (2)')
    })

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp({ session: null })

      const res = await app.request('/api/v1/welcome-vault', { method: 'POST' })
      expect(res.status).toBe(401)

      const body = await res.json() as { code: string; message: string; timestamp: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('returns 429 when rate limit is exceeded', async () => {
      const session: SessionContext = { userId: 'user-ratelimit', username: 'ratelimit', role: 'user', sessionId: 'sess-rl' }
      // Create app with same user session — hit it more than 3 times
      const app = createTestApp({ session })

      // First 3 requests should succeed (rate limit is 3 per hour)
      await app.request('/api/v1/welcome-vault', { method: 'POST' })
      await app.request('/api/v1/welcome-vault', { method: 'POST' })
      await app.request('/api/v1/welcome-vault', { method: 'POST' })

      // Fourth request should be rate-limited
      const res = await app.request('/api/v1/welcome-vault', { method: 'POST' })
      expect(res.status).toBe(429)

      const body = await res.json() as { code: string; message: string; timestamp: string }
      expect(body.code).toBe('RATE_LIMITED')
      expect(res.headers.get('Retry-After')).toBeDefined()
    })

    it('returns 500 when welcome vault service returns undefined', async () => {
      const session: SessionContext = { userId: 'user-500a', username: 'user500a', role: 'user', sessionId: 'sess-500a' }
      const welcomeVaultService = createMockWelcomeVaultService({
        createWelcomeVault: async () => undefined,
      })
      const app = createTestApp({ welcomeVaultService, session })

      const res = await app.request('/api/v1/welcome-vault', { method: 'POST' })
      expect(res.status).toBe(500)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('INTERNAL_ERROR')
    })

    it('returns 500 when an internal error occurs', async () => {
      const session: SessionContext = { userId: 'user-500b', username: 'user500b', role: 'user', sessionId: 'sess-500b' }
      const userService = createMockUserService({
        getUser: async () => { throw new Error('DB connection lost') },
      })
      const app = createTestApp({ userService, session })

      const res = await app.request('/api/v1/welcome-vault', { method: 'POST' })
      expect(res.status).toBe(500)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('INTERNAL_ERROR')
    })
  })
})

// ─── Unit Tests: deduplicateVaultName ────────────────────────────────────────

describe('deduplicateVaultName', () => {
  it('returns base name when no conflict exists', () => {
    const result = deduplicateVaultName('Willkommen', [])
    expect(result).toBe('Willkommen')
  })

  it('returns base name when existing names do not match', () => {
    const result = deduplicateVaultName('Willkommen', ['Notes', 'Personal'])
    expect(result).toBe('Willkommen')
  })

  it('appends (2) when base name already exists', () => {
    const result = deduplicateVaultName('Willkommen', ['Willkommen'])
    expect(result).toBe('Willkommen (2)')
  })

  it('appends (3) when base name and (2) both exist', () => {
    const result = deduplicateVaultName('Willkommen', ['Willkommen', 'Willkommen (2)'])
    expect(result).toBe('Willkommen (3)')
  })

  it('skips to next available number', () => {
    const existing = ['Willkommen', 'Willkommen (2)', 'Willkommen (3)', 'Willkommen (4)']
    const result = deduplicateVaultName('Willkommen', existing)
    expect(result).toBe('Willkommen (5)')
  })

  it('falls back to timestamp when all suffixes (2)-(99) are taken', () => {
    const existing = ['Willkommen']
    for (let i = 2; i <= 99; i++) {
      existing.push(`Willkommen (${String(i)})`)
    }
    const result = deduplicateVaultName('Willkommen', existing)
    // Should contain a timestamp (numeric suffix > 99)
    expect(result).toMatch(/^Willkommen \(\d+\)$/)
    expect(result).not.toBe('Willkommen (100)')
  })
})
