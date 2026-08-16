// Integration tests for snippetRoutes — CRUD for /vaults/:vaultId/snippets

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { ISnippetStore, SnippetMeta, SnippetRegistryData } from '../snippets/types.js'
import { SnippetTooLargeError } from '../snippets/errors.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import { createSnippetRoutes } from './snippetRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

function createMockSnippetStore(overrides: Partial<ISnippetStore> = {}): ISnippetStore {
  return {
    saveSnippet: async () => {},
    loadSnippet: async () => null,
    deleteSnippet: async () => {},
    listSnippets: async () => [],
    saveRegistry: async () => {},
    loadRegistry: async () => null,
    deleteAllForVault: async () => {},
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
  snippetStore?: ISnippetStore
  accessControl?: IVaultAccessControl
  entry?: VaultRegistryEntry | null
  session?: SessionContext
} = {}) {
  const logger = createMockLogger()
  const snippetStore = options.snippetStore ?? createMockSnippetStore()
  const accessControl = options.accessControl ?? createMockAccessControl()
  const vaultRegistry = createMockVaultRegistry(options.entry ?? defaultEntry)
  const session: SessionContext = options.session ?? { userId: 'owner-1', username: 'owner', role: 'user', sessionId: 'sess-1' }

  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })

  const routes = createSnippetRoutes({ snippetStore, accessControl, vaultRegistry, logger })
  app.route('/api/v1/vaults/:vaultId/snippets', routes)
  return app
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Snippet Routes', () => {
  describe('GET /vaults/:vaultId/snippets', () => {
    it('returns the snippet list', async () => {
      const meta: SnippetMeta = { id: 'dark-accent', filename: 'dark-accent.css', size: 42, updatedAt: '2026-01-01T00:00:00.000Z' }
      const app = createTestApp({ snippetStore: createMockSnippetStore({ listSnippets: async () => [meta] }) })

      const res = await app.request('/api/v1/vaults/vault-1/snippets')
      expect(res.status).toBe(200)
      const body = await res.json() as { snippets: SnippetMeta[] }
      expect(body.snippets).toEqual([meta])
    })

    it('returns 403 when access is denied', async () => {
      const accessControl = createMockAccessControl({
        checkReadAccess: async () => { throw new VaultAccessDeniedError('vault-1', 'owner-1', 'read') },
      })
      const app = createTestApp({ accessControl })

      const res = await app.request('/api/v1/vaults/vault-1/snippets')
      expect(res.status).toBe(403)
    })
  })

  describe('POST /vaults/:vaultId/snippets', () => {
    it('creates a snippet and returns its metadata', async () => {
      const meta: SnippetMeta = { id: 'my-snippet', filename: 'my-snippet.css', size: 10, updatedAt: '2026-01-01T00:00:00.000Z' }
      const app = createTestApp({
        snippetStore: createMockSnippetStore({ listSnippets: async () => [meta] }),
      })

      const res = await app.request('/api/v1/vaults/vault-1/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'my-snippet.css', content: 'body {}' }),
      })

      expect(res.status).toBe(201)
      const body = await res.json() as SnippetMeta
      expect(body.id).toBe('my-snippet')
    })

    it('rejects a filename that already exists with 409', async () => {
      const app = createTestApp({
        snippetStore: createMockSnippetStore({ loadSnippet: async () => 'existing content' }),
      })

      const res = await app.request('/api/v1/vaults/vault-1/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'dup.css', content: 'body {}' }),
      })

      expect(res.status).toBe(409)
    })

    it('rejects an invalid filename with 400', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: '../evil.css', content: 'body {}' }),
      })

      expect(res.status).toBe(400)
    })

    it('maps SnippetTooLargeError to 413', async () => {
      const app = createTestApp({
        snippetStore: createMockSnippetStore({
          saveSnippet: async () => { throw new SnippetTooLargeError(512 * 1024, 600000) },
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-1/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'huge.css', content: 'x'.repeat(100) }),
      })

      expect(res.status).toBe(413)
    })
  })

  describe('GET /vaults/:vaultId/snippets/:snippetId', () => {
    it('returns the snippet content', async () => {
      const app = createTestApp({ snippetStore: createMockSnippetStore({ loadSnippet: async () => 'body { color: red; }' }) })

      const res = await app.request('/api/v1/vaults/vault-1/snippets/dark-accent')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('body { color: red; }')
    })

    it('returns 404 for a missing snippet', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/snippets/missing')
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /vaults/:vaultId/snippets/:snippetId', () => {
    it('saves updated content and returns 204', async () => {
      let saved: string | undefined
      const app = createTestApp({
        snippetStore: createMockSnippetStore({ saveSnippet: async (_v, _id, content) => { saved = content } }),
      })

      const res = await app.request('/api/v1/vaults/vault-1/snippets/dark-accent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'body { color: blue; }' }),
      })

      expect(res.status).toBe(204)
      expect(saved).toBe('body { color: blue; }')
    })
  })

  describe('DELETE /vaults/:vaultId/snippets/:snippetId', () => {
    it('deletes the snippet and prunes its registry entry', async () => {
      let deletedId: string | undefined
      let savedRegistry: SnippetRegistryData | undefined
      const registry: SnippetRegistryData = {
        version: 1,
        snippets: { 'dark-accent': { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' }, 'other': { enabled: false, updatedAt: '2026-01-01T00:00:00.000Z' } },
      }
      const app = createTestApp({
        snippetStore: createMockSnippetStore({
          loadSnippet: async () => 'body {}',
          deleteSnippet: async (_v, id) => { deletedId = id },
          loadRegistry: async () => registry,
          saveRegistry: async (_v, r) => { savedRegistry = r },
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-1/snippets/dark-accent', { method: 'DELETE' })

      expect(res.status).toBe(204)
      expect(deletedId).toBe('dark-accent')
      expect(savedRegistry?.snippets).toEqual({ other: { enabled: false, updatedAt: '2026-01-01T00:00:00.000Z' } })
    })

    it('returns 404 when the snippet does not exist', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/snippets/missing', { method: 'DELETE' })
      expect(res.status).toBe(404)
    })
  })

  describe('registry routes', () => {
    it('GET /registry returns an empty registry when none is stored', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/snippets/registry')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ version: 1, snippets: {} })
    })

    it('PUT /registry saves the registry and returns 204', async () => {
      let saved: SnippetRegistryData | undefined
      const app = createTestApp({
        snippetStore: createMockSnippetStore({ saveRegistry: async (_v, r) => { saved = r } }),
      })

      const registry: SnippetRegistryData = { version: 1, snippets: { a: { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' } } }
      const res = await app.request('/api/v1/vaults/vault-1/snippets/registry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registry),
      })

      expect(res.status).toBe(204)
      expect(saved).toEqual(registry)
    })

    it('rejects an invalid registry body with 400', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/snippets/registry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 2, snippets: {} }),
      })

      expect(res.status).toBe(400)
    })
  })
})
