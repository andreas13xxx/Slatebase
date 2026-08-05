// Integration tests for pluginStoreRoutes — HTTP route-level tests

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultAccessControl } from '../business/index.js'

import type { IVaultRegistry } from '../vault/registry.js'
import type { IPluginStoreService } from '../plugin-store/plugin-store-service.js'
import type { IUpdateChecker } from '../plugin-store/update-checker.js'
import type { CommunityPluginEntry, UpdateCheckResult, PluginInstallResult, BulkUpdateResult, RemotePluginManifest } from '../plugin-store/types.js'
import {
  GitHubRateLimitError,
  DesktopOnlyPluginError,
  PluginNotInStoreError,
} from '../plugin-store/errors.js'
import { createPluginStoreRoutes, createVaultPluginStoreRoutes } from './pluginStoreRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }
}

function createMockPluginStoreService(overrides: Partial<IPluginStoreService> = {}): IPluginStoreService {
  return {
    getPluginList: vi.fn(async (): Promise<CommunityPluginEntry[]> => []),
    getRemoteManifest: vi.fn(async (): Promise<RemotePluginManifest> => ({
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
    })),
    installFromStore: vi.fn(async (): Promise<PluginInstallResult> => ({
      pluginId: 'test-plugin',
      manifest: { id: 'test-plugin', name: 'Test Plugin', version: '1.0.0' },
      isUpgrade: false,
      warnings: [],
    })),
    checkUpdates: vi.fn(async (): Promise<UpdateCheckResult> => ({
      plugins: [],
      checkedAt: new Date().toISOString(),
      errors: [],
    })),
    updatePlugin: vi.fn(async (): Promise<PluginInstallResult> => ({
      pluginId: 'test-plugin',
      manifest: { id: 'test-plugin', name: 'Test Plugin', version: '2.0.0' },
      isUpgrade: true,
      warnings: [],
    })),
    updateAll: vi.fn(async (): Promise<BulkUpdateResult> => ({
      updated: [],
      failed: [],
    })),
    ...overrides,
  }
}

function createMockUpdateChecker(overrides: Partial<IUpdateChecker> = {}): IUpdateChecker {
  return {
    start: () => {},
    stop: () => {},
    getLastCheckTime: () => null,
    getCachedResults: () => null,
    ...overrides,
  }
}

function createMockVaultAccessControl(overrides: Partial<IVaultAccessControl> = {}): IVaultAccessControl {
  return {
    checkReadAccess: async () => {},
    checkWriteAccess: async () => {},
    createShare: async () => {},
    revokeShare: async () => {},
    updateSharePermission: async () => {},
    ...overrides,
  }
}

function createMockVaultRegistry(overrides: Partial<IVaultRegistry> = {}): IVaultRegistry {
  return {
    load: async () => [],
    save: async () => {},
    addEntry: async () => {},
    removeEntry: async () => {},
    findById: () => ({ id: 'vault-1', name: 'Test Vault', storagePath: '/data/vaults/vault-1', createdAt: '2024-01-01T00:00:00.000Z' }),
    findByName: () => null,
    updateEntries: async (mutator) => mutator([]),
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
  pluginStoreService?: IPluginStoreService
  updateChecker?: IUpdateChecker
  accessControl?: IVaultAccessControl
  vaultRegistry?: IVaultRegistry
  session?: SessionContext | null
} = {}) {
  const logger = createMockLogger()
  const pluginStoreService = options.pluginStoreService ?? createMockPluginStoreService()
  const updateChecker = options.updateChecker ?? createMockUpdateChecker()
  const accessControl = options.accessControl ?? createMockVaultAccessControl()
  const vaultRegistry = options.vaultRegistry ?? createMockVaultRegistry()

  const app = new Hono()

  // Simulate auth middleware setting session context
  if (options.session !== null) {
    const session = options.session ?? defaultSession
    app.use('*', async (c, next) => {
      c.set('session' as never, session as never)
      return next()
    })
  }

  const deps = { pluginStoreService, updateChecker, accessControl, vaultRegistry, logger }
  const storeRoutes = createPluginStoreRoutes(deps)
  const vaultStoreRoutes = createVaultPluginStoreRoutes(deps)

  app.route('/api/v1/plugin-store', storeRoutes)
  app.route('/api/v1/vaults/:vaultId/plugins', vaultStoreRoutes)

  return app
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Plugin Store Routes', () => {
  // ─── Happy Path ──────────────────────────────────────────────────────────

  describe('GET /api/v1/plugin-store/plugins', () => {
    it('returns plugin list with total count', async () => {
      const mockPlugins: CommunityPluginEntry[] = [
        { id: 'calendar', name: 'Calendar', author: 'Liam Cain', description: 'Explore daily notes', repo: 'liamcain/obsidian-calendar-plugin' },
        { id: 'dataview', name: 'Dataview', author: 'Michael Brenan', description: 'Complex data views', repo: 'blacksmithgu/obsidian-dataview' },
      ]
      const pluginStoreService = createMockPluginStoreService({
        getPluginList: async () => mockPlugins,
      })
      const app = createTestApp({ pluginStoreService })

      const res = await app.request('/api/v1/plugin-store/plugins')
      expect(res.status).toBe(200)

      const body = await res.json() as { plugins: CommunityPluginEntry[]; total: number; cachedAt: string }
      expect(body.plugins).toHaveLength(2)
      expect(body.total).toBe(2)
      expect(body.cachedAt).toBeDefined()
      expect(body.plugins[0]?.id).toBe('calendar')
    })
  })

  describe('POST /api/v1/vaults/:vaultId/plugins/store-install', () => {
    it('installs plugin and returns 201', async () => {
      const installResult: PluginInstallResult = {
        pluginId: 'calendar',
        manifest: { id: 'calendar', name: 'Calendar', version: '1.5.1' },
        isUpgrade: false,
        warnings: [],
      }
      const pluginStoreService = createMockPluginStoreService({
        installFromStore: async () => installResult,
      })
      const app = createTestApp({ pluginStoreService })

      const res = await app.request('/api/v1/vaults/vault-1/plugins/store-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: 'calendar', repo: 'liamcain/obsidian-calendar-plugin' }),
      })
      expect(res.status).toBe(201)

      const body = await res.json() as PluginInstallResult
      expect(body.pluginId).toBe('calendar')
      expect(body.manifest.version).toBe('1.5.1')
      expect(body.isUpgrade).toBe(false)
    })
  })

  describe('POST /api/v1/vaults/:vaultId/plugins/check-updates', () => {
    it('returns update results', async () => {
      const updateResult: UpdateCheckResult = {
        plugins: [
          {
            pluginId: 'dataview',
            installedVersion: '0.5.64',
            latestVersion: '0.5.67',
            hasUpdate: true,
            releaseUrl: 'https://github.com/blacksmithgu/obsidian-dataview/releases/latest',
            repo: 'blacksmithgu/obsidian-dataview',
          },
        ],
        checkedAt: '2026-08-01T12:00:00.000Z',
        errors: [],
      }
      const pluginStoreService = createMockPluginStoreService({
        checkUpdates: async () => updateResult,
      })
      const app = createTestApp({ pluginStoreService })

      const res = await app.request('/api/v1/vaults/vault-1/plugins/check-updates', {
        method: 'POST',
      })
      expect(res.status).toBe(200)

      const body = await res.json() as UpdateCheckResult
      expect(body.plugins).toHaveLength(1)
      expect(body.plugins[0]?.pluginId).toBe('dataview')
      expect(body.plugins[0]?.hasUpdate).toBe(true)
      expect(body.checkedAt).toBe('2026-08-01T12:00:00.000Z')
    })
  })

  // ─── Error Path ─────────────────────────────────────────────────────────

  describe('Error: Rate-Limit', () => {
    it('returns 429 with retryAfter when GitHub rate limit exceeded', async () => {
      const pluginStoreService = createMockPluginStoreService({
        getPluginList: async () => { throw new GitHubRateLimitError(3600, 0) },
      })
      const app = createTestApp({ pluginStoreService })

      const res = await app.request('/api/v1/plugin-store/plugins')
      expect(res.status).toBe(429)

      const body = await res.json() as { code: string; retryAfter: number }
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(body.retryAfter).toBe(3600)
    })
  })

  describe('Error: Desktop-Only', () => {
    it('returns 400 with DESKTOP_ONLY_PLUGIN code', async () => {
      const pluginStoreService = createMockPluginStoreService({
        installFromStore: async () => { throw new DesktopOnlyPluginError('obsidian-git') },
      })
      const app = createTestApp({ pluginStoreService })

      const res = await app.request('/api/v1/vaults/vault-1/plugins/store-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: 'obsidian-git', repo: 'denolehov/obsidian-git' }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string; message: string }
      expect(body.code).toBe('DESKTOP_ONLY_PLUGIN')
      expect(body.message).toContain('desktop-only')
    })
  })

  describe('Error: Plugin Not In Store', () => {
    it('returns 404 with PLUGIN_NOT_FOUND code', async () => {
      const pluginStoreService = createMockPluginStoreService({
        installFromStore: async () => { throw new PluginNotInStoreError('nonexistent-plugin') },
      })
      const app = createTestApp({ pluginStoreService })

      const res = await app.request('/api/v1/vaults/vault-1/plugins/store-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: 'nonexistent-plugin', repo: 'user/nonexistent-plugin' }),
      })
      expect(res.status).toBe(404)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('PLUGIN_NOT_FOUND')
    })
  })

  describe('Error: Unauthorized', () => {
    it('returns 401 when no session on plugin-store route', async () => {
      const app = createTestApp({ session: null })

      const res = await app.request('/api/v1/plugin-store/plugins')
      expect(res.status).toBe(401)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('returns 401 when no session on vault route', async () => {
      const app = createTestApp({ session: null })

      const res = await app.request('/api/v1/vaults/vault-1/plugins/store-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: 'calendar', repo: 'liamcain/obsidian-calendar-plugin' }),
      })
      expect(res.status).toBe(401)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })
  })

  describe('Error: Vault Not Found', () => {
    it('returns 404 when vault does not exist', async () => {
      const vaultRegistry = createMockVaultRegistry({
        findById: () => null,
      })
      const app = createTestApp({ vaultRegistry })

      const res = await app.request('/api/v1/vaults/nonexistent-vault/plugins/store-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: 'calendar', repo: 'liamcain/obsidian-calendar-plugin' }),
      })
      expect(res.status).toBe(404)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VAULT_NOT_FOUND')
    })
  })

  describe('Error: Validation', () => {
    it('returns 400 for invalid request body (missing pluginId)', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/plugins/store-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'liamcain/obsidian-calendar-plugin' }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for invalid repo format', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/plugins/store-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: 'calendar', repo: 'invalid-repo-no-slash' }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for non-JSON body', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/plugins/store-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })
  })
})
