// Integration tests for propertyRoutes — GET/POST /vaults/:vaultId/properties

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { ILinkIndex, PropertyFilter } from '../link-index/index.js'
import type { IPropertyTypeService } from '../property-type/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import { createPropertyRoutes } from './propertyRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
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

function createMockPropertyTypeService(overrides: Partial<IPropertyTypeService> = {}): IPropertyTypeService {
  return {
    getRegistry: async () => ({ entries: [] }),
    saveRegistry: async (_vaultId, registry) => registry,
    upsertEntry: async (_vaultId, entry) => ({ entries: [entry] }),
    ...overrides,
  }
}

function createMockLinkIndex(overrides: Partial<ILinkIndex> = {}): ILinkIndex {
  return {
    rebuild: async () => {},
    updateFile: async () => {},
    removeFile: async () => {},
    renameFile: async () => {},
    renameDirectory: async () => {},
    getForwardLinks: () => [],
    getBacklinks: () => [],
    getGraph: () => ({ nodes: [], edges: [] }),
    getGraphMeta: () => ({ tags: [], propertyKeys: [] }),
    isReady: () => true,
    getFilesByProperty: () => [],
    getPropertyKeys: () => [],
    getPropertyValues: () => [],
    queryByProperties: () => [],
    ...overrides,
  }
}

function createTestApp(options: {
  linkIndex?: ILinkIndex | undefined
  propertyTypeService?: IPropertyTypeService
  accessControl?: IVaultAccessControl
  session?: SessionContext
} = {}) {
  const logger = createMockLogger()
  const linkIndex = 'linkIndex' in options ? options.linkIndex : createMockLinkIndex()
  const propertyTypeService = options.propertyTypeService ?? createMockPropertyTypeService()
  const accessControl = options.accessControl ?? createMockAccessControl()
  const session: SessionContext = options.session ?? { userId: 'user-1', username: 'testuser', role: 'user', sessionId: 'sess-1' }

  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })

  const routes = createPropertyRoutes({
    linkIndexResolver: () => linkIndex,
    propertyTypeService,
    accessControl,
    logger,
  })
  app.route('/api/v1', routes)
  return app
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property Metadata Routes', () => {
  describe('GET /vaults/:vaultId/properties', () => {
    it('returns property keys with counts and types', async () => {
      const linkIndex = createMockLinkIndex({
        getPropertyKeys: () => [
          { key: 'status', count: 5 },
          { key: 'priority', count: 3 },
        ],
      })
      const propertyTypeService = createMockPropertyTypeService({
        getRegistry: async () => ({
          entries: [{ key: 'status', type: 'text' }],
        }),
      })
      const app = createTestApp({ linkIndex, propertyTypeService })

      const res = await app.request('/api/v1/vaults/vault-1/properties')
      expect(res.status).toBe(200)
      const body = await res.json() as { keys: Array<{ key: string; count: number; type: string | null }> }
      expect(body.keys).toHaveLength(2)
      expect(body.keys[0]).toEqual({ key: 'status', count: 5, type: 'text' })
      expect(body.keys[1]).toEqual({ key: 'priority', count: 3, type: null })
    })

    it('returns 403 when access is denied', async () => {
      const accessControl = createMockAccessControl({
        checkReadAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'user-1', 'read') },
      })
      const app = createTestApp({ accessControl })

      const res = await app.request('/api/v1/vaults/vault-1/properties')
      expect(res.status).toBe(403)
    })

    it('returns 503 when link index is not ready', async () => {
      const linkIndex = createMockLinkIndex({ isReady: () => false })
      const app = createTestApp({ linkIndex })

      const res = await app.request('/api/v1/vaults/vault-1/properties')
      expect(res.status).toBe(503)
    })

    it('returns 503 when link index is undefined', async () => {
      const app = createTestApp({ linkIndex: undefined })

      const res = await app.request('/api/v1/vaults/vault-1/properties')
      expect(res.status).toBe(503)
    })
  })

  describe('GET /vaults/:vaultId/properties/:key/values', () => {
    it('returns values for a key with counts', async () => {
      const linkIndex = createMockLinkIndex({
        getPropertyValues: (key: string) => {
          if (key === 'status') {
            return [
              { value: 'active', count: 3 },
              { value: 'done', count: 2 },
            ]
          }
          return []
        },
      })
      const app = createTestApp({ linkIndex })

      const res = await app.request('/api/v1/vaults/vault-1/properties/status/values')
      expect(res.status).toBe(200)
      const body = await res.json() as { key: string; values: Array<{ value: string; count: number }>; total: number }
      expect(body.key).toBe('status')
      expect(body.values).toHaveLength(2)
      expect(body.total).toBe(2)
    })

    it('supports offset and limit pagination', async () => {
      const linkIndex = createMockLinkIndex({
        getPropertyValues: () => Array.from({ length: 50 }, (_, i) => ({
          value: `value-${i}`,
          count: 50 - i,
        })),
      })
      const app = createTestApp({ linkIndex })

      const res = await app.request('/api/v1/vaults/vault-1/properties/key/values?offset=10&limit=5')
      expect(res.status).toBe(200)
      const body = await res.json() as { key: string; values: Array<{ value: string; count: number }>; total: number }
      expect(body.values).toHaveLength(5)
      expect(body.values[0]!.value).toBe('value-10')
      expect(body.total).toBe(50)
    })

    it('returns 403 when access is denied', async () => {
      const accessControl = createMockAccessControl({
        checkReadAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'user-1', 'read') },
      })
      const app = createTestApp({ accessControl })

      const res = await app.request('/api/v1/vaults/vault-1/properties/key/values')
      expect(res.status).toBe(403)
    })
  })

  describe('POST /vaults/:vaultId/properties/query', () => {
    it('returns matching files for valid filters', async () => {
      const linkIndex = createMockLinkIndex({
        queryByProperties: (filters: PropertyFilter[]) => {
          if (filters[0]?.key === 'status' && filters[0].operator === 'eq') {
            return ['note-1.md', 'note-2.md']
          }
          return []
        },
      })
      const app = createTestApp({ linkIndex })

      const res = await app.request('/api/v1/vaults/vault-1/properties/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: [{ key: 'status', operator: 'eq', value: 'active' }],
        }),
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { files: string[]; total: number }
      expect(body.files).toEqual(['note-1.md', 'note-2.md'])
      expect(body.total).toBe(2)
    })

    it('returns 400 for empty filters array', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/properties/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: [] }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for more than 10 filters', async () => {
      const app = createTestApp()
      const filters = Array.from({ length: 11 }, (_, i) => ({
        key: `key-${i}`,
        operator: 'exists',
      }))

      const res = await app.request('/api/v1/vaults/vault-1/properties/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid operator', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/properties/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: [{ key: 'status', operator: 'invalid_op' }],
        }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid JSON body', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/properties/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      expect(res.status).toBe(400)
    })

    it('returns 403 when access is denied', async () => {
      const accessControl = createMockAccessControl({
        checkReadAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'user-1', 'read') },
      })
      const app = createTestApp({ accessControl })

      const res = await app.request('/api/v1/vaults/vault-1/properties/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: [{ key: 'x', operator: 'exists' }],
        }),
      })
      expect(res.status).toBe(403)
    })
  })
})
