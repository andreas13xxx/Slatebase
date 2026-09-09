// Integration tests for vaultConfigRoutes — GET/PUT /vaults/:vaultId/config

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultConfigService, VaultConfig } from '../vault-config/index.js'
import { DEFAULT_VAULT_CONFIG } from '../vault-config/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError, VaultNotFoundError } from '../business/index.js'
import { createVaultConfigRoutes } from './vaultConfigRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

function createMockVaultConfigService(overrides: Partial<IVaultConfigService> = {}): IVaultConfigService {
  return {
    getConfig: async () => ({ ...DEFAULT_VAULT_CONFIG }),
    saveConfig: async (_vaultId, partial) => ({ ...DEFAULT_VAULT_CONFIG, ...partial }) as VaultConfig,
    getTemplatesDirectory: async () => DEFAULT_VAULT_CONFIG.templatesDirectory,
    getDailyNotesDirectory: async () => DEFAULT_VAULT_CONFIG.dailyNotesDirectory,
    ...overrides,
  }
}

function createMockAccessControl(overrides: Partial<IVaultAccessControl> = {}): IVaultAccessControl {
  return {
    checkReadAccess: async () => {},
    checkWriteAccess: async () => {},
    checkOwnerAccess: async () => {},
    createShare: async () => {},
    revokeShare: async () => {},
    updateSharePermission: async () => {},
    getUsersWithAccess: async () => [],
    ...overrides,
  }
}

function createTestApp(options: {
  vaultConfigService?: IVaultConfigService
  accessControl?: IVaultAccessControl
  session?: SessionContext
} = {}) {
  const logger = createMockLogger()
  const vaultConfigService = options.vaultConfigService ?? createMockVaultConfigService()
  const accessControl = options.accessControl ?? createMockAccessControl()
  const session: SessionContext = options.session ?? { userId: 'owner-1', username: 'owner', role: 'user', sessionId: 'sess-1' }

  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })

  const routes = createVaultConfigRoutes({ vaultConfigService, accessControl, logger })
  app.route('/api/v1', routes)
  return app
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Vault Config Routes', () => {
  describe('GET /vaults/:vaultId/config', () => {
    it('returns the vault config on success', async () => {
      const vaultConfigService = createMockVaultConfigService({
        getConfig: async () => ({ templatesDirectory: 'Templates', dailyNotesDirectory: 'Journal', dailyNoteTemplateName: 'custom-daily.md', attachmentsDirectory: 'Attachments' }),
      })
      const app = createTestApp({ vaultConfigService })

      const res = await app.request('/api/v1/vaults/vault-1/config')
      expect(res.status).toBe(200)
      const body = await res.json() as VaultConfig
      expect(body.dailyNoteTemplateName).toBe('custom-daily.md')
    })

    it('returns 403 when access is denied', async () => {
      const accessControl = createMockAccessControl({
        checkReadAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'owner-1', 'read') },
      })
      const app = createTestApp({ accessControl })

      const res = await app.request('/api/v1/vaults/vault-1/config')
      expect(res.status).toBe(403)
    })
  })

  describe('PUT /vaults/:vaultId/config', () => {
    it('persists dailyNoteTemplateName along with the other fields', async () => {
      let savedPartial: Partial<VaultConfig> | undefined
      const vaultConfigService = createMockVaultConfigService({
        saveConfig: async (_vaultId, partial) => {
          savedPartial = partial
          return { ...DEFAULT_VAULT_CONFIG, ...partial }
        },
      })
      const app = createTestApp({ vaultConfigService })

      const res = await app.request('/api/v1/vaults/vault-1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templatesDirectory: 'Templates',
          dailyNotesDirectory: 'Journal',
          dailyNoteTemplateName: 'my-daily-template.md',
        }),
      })

      expect(res.status).toBe(200)
      const body = await res.json() as VaultConfig
      expect(body.dailyNoteTemplateName).toBe('my-daily-template.md')
      expect(savedPartial?.dailyNoteTemplateName).toBe('my-daily-template.md')
    })

    it('rejects updates from non-owners', async () => {
      const accessControl = createMockAccessControl({
        checkOwnerAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'someone-else', 'owner') },
      })
      const app = createTestApp({
        accessControl,
        session: { userId: 'someone-else', username: 'x', role: 'user', sessionId: 'sess-2' },
      })

      const res = await app.request('/api/v1/vaults/vault-1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyNoteTemplateName: 'daily.md' }),
      })

      expect(res.status).toBe(403)
    })

    it('returns 404 when the vault does not exist', async () => {
      const accessControl = createMockAccessControl({
        checkOwnerAccess: async () => { throw new VaultNotFoundError('vault-1') },
      })
      const app = createTestApp({ accessControl })

      const res = await app.request('/api/v1/vaults/vault-1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyNoteTemplateName: 'daily.md' }),
      })

      expect(res.status).toBe(404)
    })

    it('rejects a template name containing a path separator', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyNoteTemplateName: 'sub/daily.md' }),
      })

      expect(res.status).toBe(400)
    })

    it('persists attachmentsDirectory', async () => {
      let savedPartial: Partial<VaultConfig> | undefined
      const vaultConfigService = createMockVaultConfigService({
        saveConfig: async (_vaultId, partial) => {
          savedPartial = partial
          return { ...DEFAULT_VAULT_CONFIG, ...partial }
        },
      })
      const app = createTestApp({ vaultConfigService })

      const res = await app.request('/api/v1/vaults/vault-1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentsDirectory: 'Attachments' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json() as VaultConfig
      expect(body.attachmentsDirectory).toBe('Attachments')
      expect(savedPartial?.attachmentsDirectory).toBe('Attachments')
    })

    it('rejects an attachments directory with parent traversal', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentsDirectory: '../outside' }),
      })

      expect(res.status).toBe(400)
    })
  })
})
