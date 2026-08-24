// Integration tests for propertyTypeRoutes — GET/PUT /vaults/:vaultId/property-types

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IPropertyTypeService, PropertyTypeRegistry } from '../property-type/index.js'
import { PropertyTypeReservedKeyError, PropertyTypeMaxEntriesError } from '../property-type/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import { createPropertyTypeRoutes } from './propertyTypeRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

function createMockPropertyTypeService(overrides: Partial<IPropertyTypeService> = {}): IPropertyTypeService {
  return {
    getRegistry: async () => ({ entries: [] }),
    saveRegistry: async (_vaultId, registry) => registry,
    upsertEntry: async (_vaultId, entry) => ({ entries: [entry] }),
    ...overrides,
  }
}

function createMockAccessControl(overrides: Partial<IVaultAccessControl> = {}): IVaultAccessControl {
  return {
    checkReadAccess: async () => {},
    checkWriteAccess: async () => {},
    createShare: async () => {},
    revokeShare: async () => {},
    updateSharePermission: async () => {},
    getUsersWithAccess: async () => [],
    ...overrides,
  }
}

function createMockVaultRegistry(entry: VaultRegistryEntry | null): IVaultRegistry {
  return {
    load: async () => [],
    save: async () => {},
    addEntry: async () => {},
    removeEntry: async () => {},
    findById: () => entry,
    findByName: () => null,
    updateEntries: async (mutator) => mutator([]),
  }
}

const defaultEntry: VaultRegistryEntry = {
  id: 'vault-1',
  name: 'Test Vault',
  storagePath: '/data/vaults/vault-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  ownerId: 'owner-1',
}

function createTestApp(options: {
  propertyTypeService?: IPropertyTypeService
  accessControl?: IVaultAccessControl
  entry?: VaultRegistryEntry | null
  session?: SessionContext
} = {}) {
  const logger = createMockLogger()
  const propertyTypeService = options.propertyTypeService ?? createMockPropertyTypeService()
  const accessControl = options.accessControl ?? createMockAccessControl()
  const vaultRegistry = createMockVaultRegistry('entry' in options ? (options.entry as VaultRegistryEntry | null) : defaultEntry)
  const session: SessionContext = options.session ?? { userId: 'owner-1', username: 'owner', role: 'user', sessionId: 'sess-1' }

  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })

  const routes = createPropertyTypeRoutes({ propertyTypeService, accessControl, vaultRegistry, logger })
  app.route('/api/v1', routes)
  return app
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property Type Routes', () => {
  describe('GET /vaults/:vaultId/property-types', () => {
    it('returns the property type registry on success', async () => {
      const propertyTypeService = createMockPropertyTypeService({
        getRegistry: async () => ({
          entries: [
            { key: 'status', type: 'text' },
            { key: 'priority', type: 'number' },
          ],
        }),
      })
      const app = createTestApp({ propertyTypeService })

      const res = await app.request('/api/v1/vaults/vault-1/property-types')
      expect(res.status).toBe(200)
      const body = await res.json() as PropertyTypeRegistry
      expect(body.entries).toHaveLength(2)
      expect(body.entries[0]!.key).toBe('status')
    })

    it('returns 403 when read access is denied', async () => {
      const accessControl = createMockAccessControl({
        checkReadAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'user-1', 'read') },
      })
      const app = createTestApp({ accessControl })

      const res = await app.request('/api/v1/vaults/vault-1/property-types')
      expect(res.status).toBe(403)
    })
  })

  describe('PUT /vaults/:vaultId/property-types', () => {
    it('replaces the entire registry', async () => {
      let savedRegistry: PropertyTypeRegistry | undefined
      const propertyTypeService = createMockPropertyTypeService({
        saveRegistry: async (_vaultId, registry) => {
          savedRegistry = registry
          return registry
        },
      })
      const app = createTestApp({ propertyTypeService })

      const body = { entries: [{ key: 'status', type: 'text' }] }
      const res = await app.request('/api/v1/vaults/vault-1/property-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      expect(res.status).toBe(200)
      expect(savedRegistry?.entries).toHaveLength(1)
    })

    it('returns 404 when vault does not exist', async () => {
      const app = createTestApp({ entry: null })

      const res = await app.request('/api/v1/vaults/vault-1/property-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [] }),
      })

      expect(res.status).toBe(404)
    })

    it('returns 403 when write access is denied', async () => {
      const accessControl = createMockAccessControl({
        checkWriteAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'user-1', 'write') },
      })
      const app = createTestApp({ accessControl })

      const res = await app.request('/api/v1/vaults/vault-1/property-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [] }),
      })

      expect(res.status).toBe(403)
    })

    it('returns 400 for invalid body (invalid type)', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/property-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ key: 'x', type: 'invalid-type' }] }),
      })

      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid body (key too long)', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/property-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ key: 'a'.repeat(101), type: 'text' }] }),
      })

      expect(res.status).toBe(400)
    })

    it('returns 400 for too many entries', async () => {
      const propertyTypeService = createMockPropertyTypeService({
        saveRegistry: async () => { throw new PropertyTypeMaxEntriesError(200) },
      })
      const app = createTestApp({ propertyTypeService })

      const res = await app.request('/api/v1/vaults/vault-1/property-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ key: 'x', type: 'text' }] }),
      })

      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid JSON body', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/property-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })

      expect(res.status).toBe(400)
    })
  })

  describe('PUT /vaults/:vaultId/property-types/:key', () => {
    it('upserts a single entry', async () => {
      const propertyTypeService = createMockPropertyTypeService({
        upsertEntry: async (_vaultId, entry) => ({ entries: [entry] }),
      })
      const app = createTestApp({ propertyTypeService })

      const res = await app.request('/api/v1/vaults/vault-1/property-types/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', options: { allowedValues: ['open', 'closed'] } }),
      })

      expect(res.status).toBe(200)
      const body = await res.json() as PropertyTypeRegistry
      expect(body.entries[0]!.key).toBe('status')
      expect(body.entries[0]!.type).toBe('text')
    })

    it('uses the key from the URL, not the body', async () => {
      let upsertedKey: string | undefined
      const propertyTypeService = createMockPropertyTypeService({
        upsertEntry: async (_vaultId, entry) => {
          upsertedKey = entry.key
          return { entries: [entry] }
        },
      })
      const app = createTestApp({ propertyTypeService })

      const res = await app.request('/api/v1/vaults/vault-1/property-types/url-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'body-key', type: 'number' }),
      })

      expect(res.status).toBe(200)
      expect(upsertedKey).toBe('url-key')
    })

    it('returns 400 for reserved key type mismatch', async () => {
      const propertyTypeService = createMockPropertyTypeService({
        upsertEntry: async () => { throw new PropertyTypeReservedKeyError('tags', 'tags') },
      })
      const app = createTestApp({ propertyTypeService })

      const res = await app.request('/api/v1/vaults/vault-1/property-types/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text' }),
      })

      expect(res.status).toBe(400)
    })

    it('returns 404 when vault does not exist', async () => {
      const app = createTestApp({ entry: null })

      const res = await app.request('/api/v1/vaults/vault-1/property-types/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text' }),
      })

      expect(res.status).toBe(404)
    })

    it('returns 400 for invalid key format in URL', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/property-types/invalid key!', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text' }),
      })

      expect(res.status).toBe(400)
    })
  })
})
