// File Version Routes — Unit tests

import { describe, it, expect } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { createFileVersionRoutes } from './fileVersionRoutes.js'
import type { FileVersionRouteDependencies } from './fileVersionRoutes.js'
import type { IVersionService, VersionEntry } from '../version/types.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IEventBus } from '../realtime/types.js'
import type { ILogger } from '../logger/index.js'
import { VersionNotFoundError } from '../version/errors.js'

// Use a platform-appropriate absolute path for tests
const TEST_VAULT_PATH = path.resolve(os.tmpdir(), 'slatebase-test', 'vaults', 'vault-123')

// --- Mock Factories ---

function createMockVersionService(overrides: Partial<IVersionService> = {}): IVersionService {
  return {
    createVersion: async () => {},
    listVersions: async () => [],
    getVersionContent: async () => Buffer.from('version content'),
    restoreVersion: async () => {},
    pruneVersions: async () => 0,
    moveVersions: async () => {},
    deleteVersions: async () => {},
    ...overrides,
  }
}

function createMockAccessControl(overrides: Partial<IVaultAccessControl> = {}): IVaultAccessControl {
  return {
    checkReadAccess: async () => {},
    checkWriteAccess: async () => {},
    ...overrides,
  } as IVaultAccessControl
}

function createMockVaultRegistry(entries: Record<string, { storagePath: string; ownerId: string }> = {}): IVaultRegistry {
  return {
    findById: (id: string) => {
      const entry = entries[id]
      if (!entry) return null
      return { id, name: 'Test Vault', storagePath: entry.storagePath, ownerId: entry.ownerId, createdAt: new Date().toISOString() }
    },
  } as unknown as IVaultRegistry
}

function createMockEventBus(): IEventBus {
  return {
    publish: () => {},
  } as unknown as IEventBus
}

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as ILogger
}

// --- Test App Setup ---

function createTestApp(deps: Partial<FileVersionRouteDependencies> = {}) {
  const defaultDeps: FileVersionRouteDependencies = {
    versionService: createMockVersionService(),
    accessControl: createMockAccessControl(),
    vaultRegistry: createMockVaultRegistry({ 'vault-123': { storagePath: TEST_VAULT_PATH, ownerId: 'user-1' } }),
    eventBus: createMockEventBus(),
    logger: createMockLogger(),
    ...deps,
  }

  const fileVersionRoutes = createFileVersionRoutes(defaultDeps)

  // Create outer app that sets session context (simulating auth middleware)
  const app = new Hono()
  app.use('*', async (c: Context, next) => {
    c.set('session', { userId: 'user-1', username: 'testuser', role: 'user' })
    await next()
  })
  app.route('/api/v1', fileVersionRoutes)

  return { app, deps: defaultDeps }
}

// --- Tests ---

describe('fileVersionRoutes', () => {
  describe('GET /vaults/:vaultId/versions', () => {
    it('returns 200 with empty versions list when no versions exist', async () => {
      const { app } = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-123/versions?path=notes%2Ftest.md')

      expect(res.status).toBe(200)
      const body = await res.json() as { versions: VersionEntry[] }
      expect(body.versions).toEqual([])
    })

    it('returns 200 with version entries', async () => {
      const versions: VersionEntry[] = [
        { timestamp: '20240120T150000456', sizeBytes: 1024 },
        { timestamp: '20240120T143000123', sizeBytes: 512 },
      ]
      const { app } = createTestApp({
        versionService: createMockVersionService({
          listVersions: async () => versions,
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-123/versions?path=notes%2Ftest.md')

      expect(res.status).toBe(200)
      const body = await res.json() as { versions: VersionEntry[] }
      expect(body.versions).toEqual(versions)
    })

    it('returns 400 when path query param is missing', async () => {
      const { app } = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-123/versions')

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 404 when vault does not exist', async () => {
      const { app } = createTestApp({
        vaultRegistry: createMockVaultRegistry({}),
      })

      const res = await app.request('/api/v1/vaults/unknown/versions?path=test.md')

      expect(res.status).toBe(404)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VAULT_NOT_FOUND')
    })

    it('returns 403 when user lacks read access', async () => {
      const { app } = createTestApp({
        accessControl: createMockAccessControl({
          checkReadAccess: async () => {
            throw new VaultAccessDeniedError('vault-123', 'user-1', 'read')
          },
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-123/versions?path=test.md')

      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('FORBIDDEN')
    })

    it('returns 400 on path traversal attempt', async () => {
      const { app } = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-123/versions?path=..%2F..%2Fetc%2Fpasswd')

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('PATH_TRAVERSAL')
    })
  })

  describe('GET /vaults/:vaultId/versions/content', () => {
    it('returns 200 with version content', async () => {
      const { app } = createTestApp({
        versionService: createMockVersionService({
          getVersionContent: async () => Buffer.from('# Hello World'),
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-123/versions/content?path=notes%2Ftest.md&timestamp=20240120T143000123')

      expect(res.status).toBe(200)
      const json = await res.json() as { content: string }
      expect(json.content).toBe('# Hello World')
    })

    it('returns 400 when path param is missing', async () => {
      const { app } = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-123/versions/content?timestamp=20240120T143000123')

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when timestamp param is missing', async () => {
      const { app } = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-123/versions/content?path=test.md')

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 404 when version is not found', async () => {
      const { app } = createTestApp({
        versionService: createMockVersionService({
          getVersionContent: async () => {
            throw new VersionNotFoundError('notes/test.md', '20240120T143000123')
          },
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-123/versions/content?path=notes%2Ftest.md&timestamp=20240120T143000123')

      expect(res.status).toBe(404)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VERSION_NOT_FOUND')
    })

    it('returns 403 when user lacks read access', async () => {
      const { app } = createTestApp({
        accessControl: createMockAccessControl({
          checkReadAccess: async () => {
            throw new VaultAccessDeniedError('vault-123', 'user-1', 'read')
          },
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-123/versions/content?path=test.md&timestamp=20240120T143000123')

      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('FORBIDDEN')
    })
  })

  describe('POST /vaults/:vaultId/versions/restore', () => {
    it('returns 200 on successful restore', async () => {
      const { app } = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-123/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'notes/test.md', timestamp: '20240120T143000123' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json() as { restored: boolean; path: string; timestamp: string }
      expect(body.restored).toBe(true)
      expect(body.path).toBe('notes/test.md')
      expect(body.timestamp).toBe('20240120T143000123')
    })

    it('returns 400 when body is invalid JSON', async () => {
      const { app } = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-123/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when path is missing from body', async () => {
      const { app } = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-123/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: '20240120T143000123' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when timestamp is missing from body', async () => {
      const { app } = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-123/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'notes/test.md' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 404 when version is not found', async () => {
      const { app } = createTestApp({
        versionService: createMockVersionService({
          restoreVersion: async () => {
            throw new VersionNotFoundError('notes/test.md', '20240120T143000123')
          },
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-123/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'notes/test.md', timestamp: '20240120T143000123' }),
      })

      expect(res.status).toBe(404)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('VERSION_NOT_FOUND')
    })

    it('returns 403 when user lacks write access', async () => {
      const { app } = createTestApp({
        accessControl: createMockAccessControl({
          checkWriteAccess: async () => {
            throw new VaultAccessDeniedError('vault-123', 'user-1', 'write')
          },
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-123/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'notes/test.md', timestamp: '20240120T143000123' }),
      })

      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('FORBIDDEN')
    })

    it('returns 400 on path traversal attempt', async () => {
      const { app } = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-123/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '../../etc/passwd', timestamp: '20240120T143000123' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('PATH_TRAVERSAL')
    })

    it('publishes vault:change event on successful restore', async () => {
      const publishCalls: unknown[] = []
      const { app } = createTestApp({
        eventBus: { publish: (event: unknown) => { publishCalls.push(event) } } as unknown as IEventBus,
      })

      await app.request('/api/v1/vaults/vault-123/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'notes/test.md', timestamp: '20240120T143000123' }),
      })

      expect(publishCalls).toHaveLength(1)
      const event = publishCalls[0] as { type: string; payload: { vaultId: string; action: string; path: string } }
      expect(event.type).toBe('vault:change')
      expect(event.payload.vaultId).toBe('vault-123')
      expect(event.payload.action).toBe('saved')
      expect(event.payload.path).toBe('notes/test.md')
    })
  })
})
