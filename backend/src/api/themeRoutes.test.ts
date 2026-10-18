// Integration tests for themeRoutes — /vaults/:vaultId/themes

import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus, PublishOptions } from '../realtime/types.js'
import { AppearanceFileInvalidError, ThemeTooLargeError } from '../themes/errors.js'
import type { IThemeService, ThemeMeta } from '../themes/types.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import { createThemeRoutes } from './themeRoutes.js'

function createMockLogger(): ILogger {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as ILogger
}

const meta: ThemeMeta = {
  id: 'Things',
  manifest: { name: 'Things' },
  size: 12,
  updatedAt: '2026-10-17T00:00:00.000Z',
  externalHosts: [],
}

function createMockThemeService(overrides: Partial<IThemeService> = {}): IThemeService {
  return {
    listThemes: async () => [],
    loadTheme: async () => null,
    saveTheme: async () => meta,
    deleteTheme: async () => {},
    getActiveThemeId: async () => null,
    setActiveThemeId: async () => {},
    ...overrides,
  }
}

function createMockEventBus(published: PublishOptions[]): IEventBus {
  return { publish: (options: PublishOptions) => { published.push(options) } } as unknown as IEventBus
}

const entry: VaultRegistryEntry = {
  id: 'vault-1',
  name: 'Test Vault',
  storagePath: '/data/vaults/vault-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  ownerId: 'owner-1',
}

function createTestApp(options: { themeService?: IThemeService; entry?: VaultRegistryEntry | null } = {}) {
  const published: PublishOptions[] = []
  const accessControl = {
    getUsersWithAccess: async () => ['owner-1', 'user-2'],
  } as unknown as IVaultAccessControl
  const vaultRegistry = { findById: () => (options.entry === undefined ? entry : options.entry) } as unknown as IVaultRegistry
  const session: SessionContext = { userId: 'owner-1', username: 'owner', role: 'user', sessionId: 's1' }

  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })
  app.route(
    '/api/v1/vaults/:vaultId/themes',
    createThemeRoutes({
      themeService: options.themeService ?? createMockThemeService(),
      accessControl,
      vaultRegistry,
      eventBus: createMockEventBus(published),
      logger: createMockLogger(),
    }),
  )
  return { app, published }
}

const base = '/api/v1/vaults/vault-1/themes'
const json = (body: unknown): RequestInit => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('themeRoutes', () => {
  it('GET / returns themes and the active selection, using the vault storage path', async () => {
    let seenPath = ''
    const { app } = createTestApp({
      themeService: createMockThemeService({
        listThemes: async (p) => { seenPath = p; return [meta] },
        getActiveThemeId: async () => 'Things',
      }),
    })
    const res = await app.request(base)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ themes: [meta], activeThemeId: 'Things' })
    expect(seenPath).toBe('/data/vaults/vault-1')
  })

  it('returns 404 when the vault is unknown', async () => {
    const { app } = createTestApp({ entry: null })
    expect((await app.request(base)).status).toBe(404)
  })

  it('GET /:themeId returns css + meta, 404 when missing, 400 for unsafe ids', async () => {
    const { app } = createTestApp({
      themeService: createMockThemeService({
        loadTheme: async (_p, id) => (id === 'Things' ? { css: 'a{}', meta } : null),
      }),
    })
    const ok = await app.request(`${base}/Things`)
    expect(await ok.json()).toEqual({ css: 'a{}', meta })
    expect((await app.request(`${base}/Missing`)).status).toBe(404)
    expect((await app.request(`${base}/.hidden`)).status).toBe(400)
  })

  it('GET /active is not shadowed by /:themeId', async () => {
    const { app } = createTestApp({ themeService: createMockThemeService({ getActiveThemeId: async () => 'Things' }) })
    const res = await app.request(`${base}/active`)
    expect(await res.json()).toEqual({ themeId: 'Things' })
  })

  it('PUT /active selects a theme, publishes vault:change to other users, and rejects bad bodies', async () => {
    let selected: string | null | undefined
    const { app, published } = createTestApp({
      themeService: createMockThemeService({ setActiveThemeId: async (_p, id) => { selected = id } }),
    })
    const res = await app.request(`${base}/active`, json({ themeId: 'Things' }))
    expect(res.status).toBe(200)
    expect(selected).toBe('Things')
    expect(published).toHaveLength(1)
    expect(published[0]).toMatchObject({
      type: 'vault:change',
      payload: { vaultId: 'vault-1', action: 'saved', path: '.obsidian/appearance.json' },
      target: { kind: 'users', userIds: ['owner-1', 'user-2'] },
      excludeUserId: 'owner-1',
    })

    expect((await app.request(`${base}/active`, json({ themeId: null }))).status).toBe(200)
    expect(selected).toBeNull()
    expect((await app.request(`${base}/active`, json({ themeId: '../x' }))).status).toBe(400)
    expect((await app.request(`${base}/active`, { method: 'PUT', body: '{' })).status).toBe(400)
  })

  it('PUT /:themeId saves, validates the body and maps errors', async () => {
    const { app, published } = createTestApp({
      themeService: createMockThemeService({
        saveTheme: async (_p, id) => {
          if (id === 'Big') throw new ThemeTooLargeError(1, 2)
          return meta
        },
      }),
    })
    const ok = await app.request(`${base}/Things`, json({ css: 'a{}', manifest: { name: 'Things' } }))
    expect(ok.status).toBe(200)
    expect(published[0]?.payload).toMatchObject({ path: '.obsidian/themes/Things/theme.css', action: 'saved' })
    expect((await app.request(`${base}/Things`, json({ manifest: {} }))).status).toBe(400)
    expect((await app.request(`${base}/Big`, json({ css: 'x' }))).status).toBe(413)
  })

  it('maps an invalid appearance.json to 409 and unexpected errors to 500', async () => {
    const invalid = createTestApp({
      themeService: createMockThemeService({ setActiveThemeId: async () => { throw new AppearanceFileInvalidError() } }),
    })
    expect((await invalid.app.request(`${base}/active`, json({ themeId: null }))).status).toBe(409)

    const broken = createTestApp({ themeService: createMockThemeService({ listThemes: async () => { throw new Error('boom') } }) })
    expect((await broken.app.request(base)).status).toBe(500)
  })

  it('DELETE /:themeId removes the theme (204), 404 when missing, and announces both changes', async () => {
    let deleted = ''
    const { app, published } = createTestApp({
      themeService: createMockThemeService({
        loadTheme: async (_p, id) => (id === 'Things' ? { css: 'a{}', meta } : null),
        deleteTheme: async (_p, id) => { deleted = id },
      }),
    })
    expect((await app.request(`${base}/Things`, { method: 'DELETE' })).status).toBe(204)
    expect(deleted).toBe('Things')
    expect(published.map((p) => (p.payload as { path: string }).path)).toEqual([
      '.obsidian/themes/Things/theme.css',
      '.obsidian/appearance.json',
    ])
    expect((await app.request(`${base}/Nope`, { method: 'DELETE' })).status).toBe(404)
  })
})
