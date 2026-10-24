// Integration tests for snippetRoutes — CRUD for /vaults/:vaultId/snippets

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { ISnippetStore, SnippetMeta, SnippetRegistryData } from '../snippets/types.js'
import { SnippetTooLargeError } from '../snippets/errors.js'
import { AppearanceFileInvalidError } from '../shared/appearance-file.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import type { IEventBus, PublishOptions } from '../realtime/types.js'
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
    loadEnabledIds: async () => [],
    saveEnabledIds: async () => {},
    ...overrides,
  }
}

function createMockEventBus(published: PublishOptions[]): IEventBus {
  return { publish: (options: PublishOptions) => { published.push(options) } } as unknown as IEventBus
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
  published?: PublishOptions[]
} = {}) {
  const logger = createMockLogger()
  const snippetStore = options.snippetStore ?? createMockSnippetStore()
  const accessControl = options.accessControl ?? createMockAccessControl()
  const vaultRegistry = createMockVaultRegistry(options.entry === undefined ? defaultEntry : options.entry)
  const session: SessionContext = options.session ?? { userId: 'owner-1', username: 'owner', role: 'user', sessionId: 'sess-1' }

  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })

  const routes = createSnippetRoutes({ snippetStore, accessControl, vaultRegistry, eventBus: createMockEventBus(options.published ?? []), logger })
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
    it('deletes the snippet in the vault folder', async () => {
      let deleted: { vaultPath: string; id: string } | undefined
      const app = createTestApp({
        snippetStore: createMockSnippetStore({
          loadSnippet: async () => 'body {}',
          deleteSnippet: async (vaultPath, id) => { deleted = { vaultPath, id } },
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-1/snippets/dark-accent', { method: 'DELETE' })

      expect(res.status).toBe(204)
      expect(deleted).toEqual({ vaultPath: '/data/vaults/vault-1', id: 'dark-accent' })
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

    it('GET /registry reports the enabled snippets with their modification time', async () => {
      const meta: SnippetMeta = { id: 'a', filename: 'a.css', size: 1, updatedAt: '2026-01-01T00:00:00.000Z' }
      const app = createTestApp({
        snippetStore: createMockSnippetStore({
          loadEnabledIds: async () => ['a', 'gone'],
          listSnippets: async () => [meta],
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-1/snippets/registry')
      expect(await res.json()).toEqual({
        version: 1,
        snippets: {
          a: { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' },
          gone: { enabled: true, updatedAt: '' },
        },
      })
    })

    it('PUT /registry stores only the enabled snippet ids and returns 204', async () => {
      let saved: string[] | undefined
      const app = createTestApp({
        snippetStore: createMockSnippetStore({ saveEnabledIds: async (_v, ids) => { saved = ids } }),
      })

      const registry: SnippetRegistryData = {
        version: 1,
        snippets: {
          a: { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' },
          off: { enabled: false, updatedAt: '2026-01-01T00:00:00.000Z' },
          'with space': { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' },
        },
      }
      const res = await app.request('/api/v1/vaults/vault-1/snippets/registry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registry),
      })

      expect(res.status).toBe(204)
      expect(saved).toEqual(['a', 'with space'])
    })

    it('PUT /registry keeps enabled ids that Slatebase cannot address', async () => {
      let saved: string[] | undefined
      const app = createTestApp({
        snippetStore: createMockSnippetStore({
          loadEnabledIds: async () => ['a', 'weird:name', '50%'],
          saveEnabledIds: async (_v, ids) => { saved = ids },
        }),
      })

      const res = await app.request('/api/v1/vaults/vault-1/snippets/registry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, snippets: { b: { enabled: true, updatedAt: '' } } }),
      })

      expect(res.status).toBe(204)
      expect(saved).toEqual(['b', 'weird:name', '50%'])
    })

    it('publishes vault:change events for other clients', async () => {
      const published: PublishOptions[] = []
      const app = createTestApp({
        published,
        snippetStore: createMockSnippetStore({ loadSnippet: async (_v, id) => (id === 'dark' ? 'a {}' : null) }),
      })
      const json = { 'Content-Type': 'application/json' }

      await app.request('/api/v1/vaults/vault-1/snippets', { method: 'POST', headers: json, body: JSON.stringify({ filename: 'new one.css', content: 'a {}' }) })
      await app.request('/api/v1/vaults/vault-1/snippets/dark', { method: 'PUT', headers: json, body: JSON.stringify({ content: 'b {}' }) })
      await app.request('/api/v1/vaults/vault-1/snippets/registry', { method: 'PUT', headers: json, body: JSON.stringify({ version: 1, snippets: {} }) })
      await app.request('/api/v1/vaults/vault-1/snippets/dark', { method: 'DELETE' })

      const events = published.map((e) => [(e.payload as { path: string }).path, (e.payload as { action: string }).action])
      expect(events).toEqual([
        ['.obsidian/snippets/new one.css', 'saved'],
        ['.obsidian/snippets/dark.css', 'saved'],
        ['.obsidian/appearance.json', 'saved'],
        ['.obsidian/snippets/dark.css', 'deleted'],
        ['.obsidian/appearance.json', 'saved'],
      ])
      expect(published.every((e) => e.excludeUserId === 'owner-1')).toBe(true)
    })

    it('maps an invalid appearance.json to 409', async () => {
      const app = createTestApp({
        snippetStore: createMockSnippetStore({ saveEnabledIds: async () => { throw new AppearanceFileInvalidError() } }),
      })

      const res = await app.request('/api/v1/vaults/vault-1/snippets/registry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, snippets: {} }),
      })

      expect(res.status).toBe(409)
    })

    it('returns 404 for an unknown vault', async () => {
      const app = createTestApp({ entry: null })

      const res = await app.request('/api/v1/vaults/vault-1/snippets')
      expect(res.status).toBe(404)
    })

    it('accepts snippet ids with spaces (Obsidian-style names)', async () => {
      const app = createTestApp({ snippetStore: createMockSnippetStore({ loadSnippet: async () => 'a {}' }) })

      const res = await app.request('/api/v1/vaults/vault-1/snippets/my%20snippet')
      expect(res.status).toBe(200)
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
