// Unit tests for trashRoutes — HTTP integration tests

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import type { IEventBus, PublishOptions } from '../realtime/types.js'
import type { ITrashService, TrashEntry } from '../trash/index.js'
import { TrashNotFoundError, TrashRestoreError } from '../trash/index.js'
import { createTrashRoutes } from './trashRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
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

function createMockVaultRegistry(entry: VaultRegistryEntry | null = null): IVaultRegistry {
  return {
    load: async () => entry ? [entry] : [],
    save: async () => {},
    addEntry: async () => {},
    removeEntry: async () => {},
    findById: () => entry,
    findByName: () => entry,
  }
}

function createMockEventBus(): IEventBus & { publishCalls: PublishOptions[] } {
  const publishCalls: PublishOptions[] = []
  return {
    publishCalls,
    publish: (options: PublishOptions) => { publishCalls.push(options) },
    nextEventId: () => '1',
    getEventsSince: () => [],
  }
}

function createMockTrashService(overrides: Partial<ITrashService> = {}): ITrashService {
  return {
    moveToTrash: async () => ({ id: 'entry-1', originalPath: 'notes/test.md', deletedAt: '2024-01-20T14:30:00.000Z', isDirectory: false }),
    listTrash: async () => [],
    restore: async () => ({ restoredPath: 'notes/test.md' }),
    deletePermanently: async () => {},
    purgeExpired: async () => 0,
    deleteImmediately: async () => {},
    ...overrides,
  }
}

const defaultSession: SessionContext = {
  userId: 'user-1',
  username: 'testuser',
  role: 'user',
  sessionId: 'session-1',
}

const defaultVaultEntry: VaultRegistryEntry = {
  id: 'vault-1',
  name: 'Test Vault',
  storagePath: '/tmp/test-vault',
  createdAt: '2024-01-01T00:00:00.000Z',
  ownerId: 'user-1',
}

// ─── Test App Factory ────────────────────────────────────────────────────────

function createTestApp(options: {
  vaultAccessControl?: IVaultAccessControl
  vaultRegistry?: IVaultRegistry
  trashService?: ITrashService
  eventBus?: IEventBus & { publishCalls: PublishOptions[] }
  session?: SessionContext | null
} = {}) {
  const logger = createMockLogger()
  const vaultAccessControl = options.vaultAccessControl ?? createMockVaultAccessControl()
  const vaultRegistry = options.vaultRegistry ?? createMockVaultRegistry(defaultVaultEntry)
  const trashService = options.trashService ?? createMockTrashService()
  const eventBus = options.eventBus ?? createMockEventBus()

  const app = new Hono()

  // Simulate auth middleware setting session context
  if (options.session !== null) {
    const session = options.session ?? defaultSession
    app.use('*', async (c, next) => {
      c.set('session' as never, session as never)
      return next()
    })
  }

  const routes = createTrashRoutes({ trashService, accessControl: vaultAccessControl, vaultRegistry, eventBus, logger })
  app.route('/api/v1', routes)
  return { app, eventBus }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Trash Routes', () => {
  describe('GET /api/v1/vaults/:vaultId/trash', () => {
    it('returns 401 when no session', async () => {
      const { app } = createTestApp({ session: null })
      const res = await app.request('/api/v1/vaults/vault-1/trash')
      expect(res.status).toBe(401)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('returns 404 when vault not found', async () => {
      const { app } = createTestApp({ vaultRegistry: createMockVaultRegistry(null) })
      const res = await app.request('/api/v1/vaults/nonexistent/trash')
      expect(res.status).toBe(404)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VAULT_NOT_FOUND')
    })

    it('returns 403 when user has no read access', async () => {
      const accessControl = createMockVaultAccessControl({
        checkReadAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'user-1', 'read') },
      })
      const { app } = createTestApp({ vaultAccessControl: accessControl })
      const res = await app.request('/api/v1/vaults/vault-1/trash')
      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('FORBIDDEN')
    })

    it('returns 200 with empty entries array', async () => {
      const { app } = createTestApp()
      const res = await app.request('/api/v1/vaults/vault-1/trash')
      expect(res.status).toBe(200)
      const body = await res.json() as { entries: TrashEntry[] }
      expect(body.entries).toEqual([])
    })

    it('returns 200 with trash entries', async () => {
      const entries: TrashEntry[] = [
        { id: 'e1', originalPath: 'notes/a.md', deletedAt: '2024-01-20T14:30:00.000Z', isDirectory: false },
        { id: 'e2', originalPath: 'docs/', deletedAt: '2024-01-19T10:00:00.000Z', isDirectory: true },
      ]
      const trashService = createMockTrashService({ listTrash: async () => entries })
      const { app } = createTestApp({ trashService })
      const res = await app.request('/api/v1/vaults/vault-1/trash')
      expect(res.status).toBe(200)
      const body = await res.json() as { entries: TrashEntry[] }
      expect(body.entries).toHaveLength(2)
      expect(body.entries[0]!.id).toBe('e1')
      expect(body.entries[1]!.id).toBe('e2')
    })
  })

  describe('POST /api/v1/vaults/:vaultId/trash/:entryId/restore', () => {
    it('returns 401 when no session', async () => {
      const { app } = createTestApp({ session: null })
      const res = await app.request('/api/v1/vaults/vault-1/trash/entry-1/restore', { method: 'POST' })
      expect(res.status).toBe(401)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('returns 404 when vault not found', async () => {
      const { app } = createTestApp({ vaultRegistry: createMockVaultRegistry(null) })
      const res = await app.request('/api/v1/vaults/nonexistent/trash/entry-1/restore', { method: 'POST' })
      expect(res.status).toBe(404)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VAULT_NOT_FOUND')
    })

    it('returns 403 when user has no write access', async () => {
      const accessControl = createMockVaultAccessControl({
        checkWriteAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'user-1', 'write') },
      })
      const { app } = createTestApp({ vaultAccessControl: accessControl })
      const res = await app.request('/api/v1/vaults/vault-1/trash/entry-1/restore', { method: 'POST' })
      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('FORBIDDEN')
    })

    it('returns 404 when trash entry not found', async () => {
      const trashService = createMockTrashService({
        restore: async () => { throw new TrashNotFoundError('entry-1') },
      })
      const { app } = createTestApp({ trashService })
      const res = await app.request('/api/v1/vaults/vault-1/trash/entry-1/restore', { method: 'POST' })
      expect(res.status).toBe(404)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('TRASH_NOT_FOUND')
    })

    it('returns 500 when restore fails', async () => {
      const trashService = createMockTrashService({
        restore: async () => { throw new TrashRestoreError('entry-1', 'permission denied') },
      })
      const { app } = createTestApp({ trashService })
      const res = await app.request('/api/v1/vaults/vault-1/trash/entry-1/restore', { method: 'POST' })
      expect(res.status).toBe(500)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('TRASH_RESTORE_FAILED')
    })

    it('returns 200 with restoredPath on success', async () => {
      const trashService = createMockTrashService({
        restore: async () => ({ restoredPath: 'notes/restored-file.md' }),
      })
      const { app } = createTestApp({ trashService })
      const res = await app.request('/api/v1/vaults/vault-1/trash/entry-1/restore', { method: 'POST' })
      expect(res.status).toBe(200)
      const body = await res.json() as { restoredPath: string }
      expect(body.restoredPath).toBe('notes/restored-file.md')
    })

    it('publishes vault:change event on successful restore', async () => {
      const trashService = createMockTrashService({
        restore: async () => ({ restoredPath: 'notes/restored-file.md' }),
      })
      const eventBus = createMockEventBus()
      const { app } = createTestApp({ trashService, eventBus })
      await app.request('/api/v1/vaults/vault-1/trash/entry-1/restore', { method: 'POST' })
      expect(eventBus.publishCalls).toHaveLength(1)
      expect(eventBus.publishCalls[0]!.type).toBe('vault:change')
      expect(eventBus.publishCalls[0]!.payload.vaultId).toBe('vault-1')
      expect(eventBus.publishCalls[0]!.payload.path).toBe('notes/restored-file.md')
    })
  })

  describe('DELETE /api/v1/vaults/:vaultId/trash/:entryId', () => {
    it('returns 401 when no session', async () => {
      const { app } = createTestApp({ session: null })
      const res = await app.request('/api/v1/vaults/vault-1/trash/entry-1', { method: 'DELETE' })
      expect(res.status).toBe(401)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('returns 404 when vault not found', async () => {
      const { app } = createTestApp({ vaultRegistry: createMockVaultRegistry(null) })
      const res = await app.request('/api/v1/vaults/nonexistent/trash/entry-1', { method: 'DELETE' })
      expect(res.status).toBe(404)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VAULT_NOT_FOUND')
    })

    it('returns 403 when user has no write access', async () => {
      const accessControl = createMockVaultAccessControl({
        checkWriteAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'user-1', 'write') },
      })
      const { app } = createTestApp({ vaultAccessControl: accessControl })
      const res = await app.request('/api/v1/vaults/vault-1/trash/entry-1', { method: 'DELETE' })
      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('FORBIDDEN')
    })

    it('returns 404 when trash entry not found', async () => {
      const trashService = createMockTrashService({
        deletePermanently: async () => { throw new TrashNotFoundError('entry-1') },
      })
      const { app } = createTestApp({ trashService })
      const res = await app.request('/api/v1/vaults/vault-1/trash/entry-1', { method: 'DELETE' })
      expect(res.status).toBe(404)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('TRASH_NOT_FOUND')
    })

    it('returns 204 on successful permanent deletion', async () => {
      const { app } = createTestApp()
      const res = await app.request('/api/v1/vaults/vault-1/trash/entry-1', { method: 'DELETE' })
      expect(res.status).toBe(204)
    })
  })
})
