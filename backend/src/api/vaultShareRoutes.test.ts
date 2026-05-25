import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { VaultShareRouteModule } from './vaultShareRoutes.js'
import type { IVaultAccessControl, IVaultService } from '../business/index.js'
import {
  VaultNotFoundError,
  ShareLimitError,
  InvalidShareTargetError,
  SharesNotRevokedError,
} from '../business/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'

// --- Mock Factories ---

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as ILogger
}

function createMockVaultRegistry(entries: VaultRegistryEntry[]): IVaultRegistry {
  return {
    load: async () => entries,
    save: async () => {},
    addEntry: async () => {},
    removeEntry: async () => {},
    findById: (vaultId: string) => entries.find((e) => e.id === vaultId) ?? null,
    findByName: (name: string) => entries.find((e) => e.name === name) ?? null,
  } as unknown as IVaultRegistry
}

function createMockAccessControl(overrides?: Partial<IVaultAccessControl>): IVaultAccessControl {
  return {
    checkReadAccess: async () => {},
    checkWriteAccess: async () => {},
    createShare: async () => {},
    revokeShare: async () => {},
    updateSharePermission: async () => {},
    ...overrides,
  }
}

function createMockVaultService(overrides?: Partial<IVaultService>): IVaultService {
  return {
    initializeVaults: async () => {},
    getVaultList: () => [],
    getVaultTree: () => ({ name: '', type: 'directory' as const, path: '', children: [] }),
    getFileContent: async () => ({ path: '', name: '', content: '', isBinary: false, size: 0, encoding: 'utf-8' as const, isTruncated: false, etag: '' }),
    resolveFilePath: () => '',
    saveFile: async () => ({ path: '', name: '', size: 0, etag: '' }),
    createVault: async () => ({ id: '', name: '', path: '', status: 'loaded' as const }),
    deleteVault: async () => {},
    deleteVaultWithChecks: async () => {},
    transferOwnership: async () => {},
    deleteContent: async () => {},
    ...overrides,
  }
}

// --- Test Helpers ---

const OWNER_ID = 'owner-user-id'
const TARGET_USER_ID = 'target-user-id'
const VAULT_ID = 'test-vault-123'

const ownerSession: SessionContext = {
  userId: OWNER_ID,
  username: 'owner',
  role: 'user',
  sessionId: 'session-1',
}

const registryEntry: VaultRegistryEntry = {
  id: VAULT_ID,
  name: 'Test Vault',
  storagePath: '/data/vaults/test-vault-123',
  createdAt: '2025-01-01T00:00:00.000Z',
  ownerId: OWNER_ID,
}

function createApp(options?: {
  accessControl?: IVaultAccessControl
  vaultService?: IVaultService
  registryEntries?: VaultRegistryEntry[]
  session?: SessionContext | null
}): Hono {
  const accessControl = options?.accessControl ?? createMockAccessControl()
  const vaultService = options?.vaultService ?? createMockVaultService()
  const entries = options?.registryEntries ?? [registryEntry]
  const vaultRegistry = createMockVaultRegistry(entries)
  const logger = createMockLogger()
  const session = options?.session !== undefined ? options.session : ownerSession

  const app = new Hono()

  // Simulate auth middleware: set session context
  app.use('*', async (c, next) => {
    if (session !== null) {
      c.set('session' as never, session as never)
    }
    await next()
  })

  const routeModule = new VaultShareRouteModule(accessControl, vaultService, vaultRegistry, logger)
  routeModule.register(app)

  return app
}

// --- Tests ---

describe('VaultShareRouteModule', () => {
  describe('POST /vaults/:vaultId/shares', () => {
    it('creates a share and returns 201', async () => {
      const app = createApp()

      const res = await app.request(`/vaults/${VAULT_ID}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TARGET_USER_ID, permission: 'read' }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body).toEqual({ vaultId: VAULT_ID, userId: TARGET_USER_ID, permission: 'read' })
    })

    it('returns 400 when userId is missing', async () => {
      const app = createApp()

      const res = await app.request(`/vaults/${VAULT_ID}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: 'read' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when permission is invalid', async () => {
      const app = createApp()

      const res = await app.request(`/vaults/${VAULT_ID}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TARGET_USER_ID, permission: 'admin' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 403 when caller is not the owner', async () => {
      const nonOwnerSession: SessionContext = {
        userId: 'other-user',
        username: 'other',
        role: 'user',
        sessionId: 'session-2',
      }
      const app = createApp({ session: nonOwnerSession })

      const res = await app.request(`/vaults/${VAULT_ID}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TARGET_USER_ID, permission: 'read' }),
      })

      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('ACCESS_DENIED')
    })

    it('returns 404 when vault does not exist', async () => {
      const app = createApp({ registryEntries: [] })

      const res = await app.request(`/vaults/${VAULT_ID}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TARGET_USER_ID, permission: 'read' }),
      })

      expect(res.status).toBe(404)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VAULT_NOT_FOUND')
    })

    it('returns 409 when share limit is reached', async () => {
      const accessControl = createMockAccessControl({
        createShare: async () => {
          throw new ShareLimitError(VAULT_ID, 20)
        },
      })
      const app = createApp({ accessControl })

      const res = await app.request(`/vaults/${VAULT_ID}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TARGET_USER_ID, permission: 'read' }),
      })

      expect(res.status).toBe(409)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('SHARE_LIMIT_REACHED')
    })

    it('returns 400 when target user does not exist', async () => {
      const accessControl = createMockAccessControl({
        createShare: async () => {
          throw new InvalidShareTargetError('USER_NOT_FOUND', 'Target user not found: nonexistent')
        },
      })
      const app = createApp({ accessControl })

      const res = await app.request(`/vaults/${VAULT_ID}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'nonexistent', permission: 'read' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_SHARE_TARGET')
    })

    it('returns 400 when sharing with self', async () => {
      const accessControl = createMockAccessControl({
        createShare: async () => {
          throw new InvalidShareTargetError('SELF_SHARE', 'Cannot share a vault with yourself')
        },
      })
      const app = createApp({ accessControl })

      const res = await app.request(`/vaults/${VAULT_ID}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: OWNER_ID, permission: 'read' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_SHARE_TARGET')
    })
  })

  describe('DELETE /vaults/:vaultId/shares/:userId', () => {
    it('revokes a share and returns 204', async () => {
      const app = createApp()

      const res = await app.request(`/vaults/${VAULT_ID}/shares/${TARGET_USER_ID}`, {
        method: 'DELETE',
      })

      expect(res.status).toBe(204)
    })

    it('returns 403 when caller is not the owner', async () => {
      const nonOwnerSession: SessionContext = {
        userId: 'other-user',
        username: 'other',
        role: 'user',
        sessionId: 'session-2',
      }
      const app = createApp({ session: nonOwnerSession })

      const res = await app.request(`/vaults/${VAULT_ID}/shares/${TARGET_USER_ID}`, {
        method: 'DELETE',
      })

      expect(res.status).toBe(403)
    })

    it('returns 404 when vault does not exist', async () => {
      const app = createApp({ registryEntries: [] })

      const res = await app.request(`/vaults/${VAULT_ID}/shares/${TARGET_USER_ID}`, {
        method: 'DELETE',
      })

      expect(res.status).toBe(404)
    })

    it('maps VaultNotFoundError from service to 404', async () => {
      const accessControl = createMockAccessControl({
        revokeShare: async () => {
          throw new VaultNotFoundError(VAULT_ID)
        },
      })
      const app = createApp({ accessControl })

      const res = await app.request(`/vaults/${VAULT_ID}/shares/${TARGET_USER_ID}`, {
        method: 'DELETE',
      })

      expect(res.status).toBe(404)
    })
  })

  describe('PUT /vaults/:vaultId/shares/:userId', () => {
    it('updates permission and returns 200', async () => {
      const app = createApp()

      const res = await app.request(`/vaults/${VAULT_ID}/shares/${TARGET_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: 'write' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ vaultId: VAULT_ID, userId: TARGET_USER_ID, permission: 'write' })
    })

    it('returns 400 when permission is invalid', async () => {
      const app = createApp()

      const res = await app.request(`/vaults/${VAULT_ID}/shares/${TARGET_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: 'execute' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 403 when caller is not the owner', async () => {
      const nonOwnerSession: SessionContext = {
        userId: 'other-user',
        username: 'other',
        role: 'user',
        sessionId: 'session-2',
      }
      const app = createApp({ session: nonOwnerSession })

      const res = await app.request(`/vaults/${VAULT_ID}/shares/${TARGET_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: 'write' }),
      })

      expect(res.status).toBe(403)
    })
  })

  describe('POST /vaults/:vaultId/transfer', () => {
    it('transfers ownership and returns 200', async () => {
      const app = createApp()

      const res = await app.request(`/vaults/${VAULT_ID}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: TARGET_USER_ID }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ vaultId: VAULT_ID, newOwnerId: TARGET_USER_ID })
    })

    it('returns 400 when newOwnerId is missing', async () => {
      const app = createApp()

      const res = await app.request(`/vaults/${VAULT_ID}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 403 when caller is not the owner', async () => {
      const nonOwnerSession: SessionContext = {
        userId: 'other-user',
        username: 'other',
        role: 'user',
        sessionId: 'session-2',
      }
      const app = createApp({ session: nonOwnerSession })

      const res = await app.request(`/vaults/${VAULT_ID}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: TARGET_USER_ID }),
      })

      expect(res.status).toBe(403)
    })

    it('returns 409 when shares are not revoked', async () => {
      const vaultService = createMockVaultService({
        transferOwnership: async () => {
          throw new SharesNotRevokedError(VAULT_ID, [
            { vaultId: VAULT_ID, userId: 'someone', permission: 'read', grantedBy: OWNER_ID, grantedAt: '2025-01-01T00:00:00.000Z' },
          ])
        },
      })
      const app = createApp({ vaultService })

      const res = await app.request(`/vaults/${VAULT_ID}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: TARGET_USER_ID }),
      })

      expect(res.status).toBe(409)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('SHARES_NOT_REVOKED')
    })

    it('returns 404 when vault does not exist', async () => {
      const app = createApp({ registryEntries: [] })

      const res = await app.request(`/vaults/${VAULT_ID}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: TARGET_USER_ID }),
      })

      expect(res.status).toBe(404)
    })
  })

  describe('Error response format', () => {
    it('includes code, message, and timestamp in error responses', async () => {
      const app = createApp({ registryEntries: [] })

      const res = await app.request(`/vaults/${VAULT_ID}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TARGET_USER_ID, permission: 'read' }),
      })

      const body = await res.json() as { code: string; message: string; timestamp: string }
      expect(body).toHaveProperty('code')
      expect(body).toHaveProperty('message')
      expect(body).toHaveProperty('timestamp')
      expect(typeof body.timestamp).toBe('string')
    })
  })
})
