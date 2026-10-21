// Integration tests for themeStoreRoutes — /theme-store and /vaults/:vaultId/theme-store

import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus, PublishOptions } from '../realtime/types.js'
import { AppearanceFileInvalidError } from '../themes/index.js'
import type { ThemeMeta } from '../themes/index.js'
import {
  ThemeAlreadyInstalledError,
  ThemeAssetTooLargeError,
  ThemeFilesNotFoundError,
  ThemeManifestMismatchError,
  ThemeNotInCatalogError,
  ThemeStoreFetchError,
} from '../theme-store/index.js'
import type { IThemeStoreService, InstallThemeOptions } from '../theme-store/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import { createThemeStoreRoutes, createVaultThemeStoreRoutes } from './themeStoreRoutes.js'

const logger: ILogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

const meta: ThemeMeta = { id: 'Things', manifest: { name: 'Things' }, size: 12, updatedAt: '2026-10-21T00:00:00.000Z', externalHosts: [] }

function createMockService(overrides: Partial<IThemeStoreService> = {}): IThemeStoreService {
  return {
    listCatalog: async () => ({ themes: [], stale: false }),
    install: async () => meta,
    checkUpdates: async () => ({ updates: [], unknown: [], warnings: [], checked: 0, checkedAt: '2026-10-21T00:00:00.000Z' }),
    getScreenshot: async () => null,
    ...overrides,
  }
}

const vaultEntry: VaultRegistryEntry = {
  id: 'vault-1', name: 'V', storagePath: '/data/vaults/vault-1', createdAt: '2024-01-01T00:00:00.000Z', ownerId: 'owner-1',
}

function createTestApp(options: { service?: IThemeStoreService; entry?: VaultRegistryEntry | null } = {}) {
  const published: PublishOptions[] = []
  const service = options.service ?? createMockService()
  const session: SessionContext = { userId: 'owner-1', username: 'owner', role: 'user', sessionId: 's1' }
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })
  app.route('/api/v1/theme-store', createThemeStoreRoutes({ themeStoreService: service, logger }))
  app.route(
    '/api/v1/vaults/:vaultId/theme-store',
    createVaultThemeStoreRoutes({
      themeStoreService: service,
      accessControl: { getUsersWithAccess: async () => ['owner-1', 'user-2'] } as unknown as IVaultAccessControl,
      vaultRegistry: { findById: () => (options.entry === undefined ? vaultEntry : options.entry) } as unknown as IVaultRegistry,
      eventBus: { publish: (o: PublishOptions) => { published.push(o) } } as unknown as IEventBus,
      logger,
    }),
  )
  return { app, published }
}

const install = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

describe('GET /theme-store/themes', () => {
  it('returns the catalog and the stale flag', async () => {
    const { app } = createTestApp({
      service: createMockService({ listCatalog: async () => ({ themes: [{ name: 'Things', author: 'a', repo: 'o/things', screenshot: '', modes: ['dark'], legacy: false }], stale: true }) }),
    })
    const res = await app.request('/api/v1/theme-store/themes')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ stale: true, themes: [{ name: 'Things' }] })
  })

  it('answers 502 without leaking the upstream URL when GitHub cannot be reached', async () => {
    const { app } = createTestApp({
      service: createMockService({ listCatalog: async () => { throw new ThemeStoreFetchError('https://raw.githubusercontent.com/secret/path', 0, 'timeout') } }),
    })
    const res = await app.request('/api/v1/theme-store/themes')
    expect(res.status).toBe(502)
    const body = await res.json() as { code: string; message: string }
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE')
    expect(JSON.stringify(body)).not.toContain('githubusercontent')
  })
})

describe('GET /theme-store/screenshot', () => {
  it('serves the image with a fixed type, nosniff and a restrictive CSP', async () => {
    const { app } = createTestApp({ service: createMockService({ getScreenshot: async () => ({ contentType: 'image/png', data: PNG }) }) })
    const res = await app.request('/api/v1/theme-store/screenshot?repo=o/things')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'")
    expect(res.headers.get('Cache-Control')).toContain('max-age=86400')
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true)
  })

  it('rejects a missing or malformed repo before touching the service', async () => {
    let called = false
    const { app } = createTestApp({ service: createMockService({ getScreenshot: async () => { called = true; return null } }) })
    for (const repo of ['', 'noslash', '../x', 'a/b/c']) {
      const res = await app.request(`/api/v1/theme-store/screenshot?repo=${encodeURIComponent(repo)}`)
      expect(res.status, repo).toBe(400)
    }
    expect((await app.request('/api/v1/theme-store/screenshot')).status).toBe(400)
    expect(called).toBe(false)
  })

  it('answers 404 when there is no usable screenshot and when the repo is not in the catalog', async () => {
    const none = createTestApp()
    expect((await none.app.request('/api/v1/theme-store/screenshot?repo=o/things')).status).toBe(404)

    const unknown = createTestApp({ service: createMockService({ getScreenshot: async () => { throw new ThemeNotInCatalogError('o/things') } }) })
    const res = await unknown.app.request('/api/v1/theme-store/screenshot?repo=o/things')
    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe('THEME_NOT_IN_CATALOG')
  })
})

describe('GET /vaults/:vaultId/theme-store/updates', () => {
  it('passes the vault id and storage path to the service', async () => {
    let seen: [string, string] | null = null
    const { app } = createTestApp({
      service: createMockService({
        checkUpdates: async (vaultId, vaultPath) => {
          seen = [vaultId, vaultPath]
          return { updates: [{ themeId: 'Things', name: 'Things', repo: 'o/things', installedVersion: '1.0.0', latestVersion: '1.1.0' }], unknown: [], warnings: [], checked: 1, checkedAt: 'x' }
        },
      }),
    })
    const res = await app.request('/api/v1/vaults/vault-1/theme-store/updates')
    expect(res.status).toBe(200)
    expect(seen).toEqual(['vault-1', '/data/vaults/vault-1'])
    expect(((await res.json()) as { updates: unknown[] }).updates).toHaveLength(1)
  })

  it('answers 404 for an unknown vault', async () => {
    const { app } = createTestApp({ entry: null })
    expect((await app.request('/api/v1/vaults/nope/theme-store/updates')).status).toBe(404)
  })
})

describe('POST /vaults/:vaultId/theme-store/install', () => {
  it('installs with the defaults replace=false and activate=false', async () => {
    let options: InstallThemeOptions | null = null
    const { app, published } = createTestApp({
      service: createMockService({ install: async (_path, _repo, o) => { options = o; return meta } }),
    })
    const res = await app.request('/api/v1/vaults/vault-1/theme-store/install', install({ repo: 'o/things' }))
    expect(res.status).toBe(200)
    expect(options).toEqual({ replace: false, activate: false })
    expect(await res.json()).toMatchObject({ id: 'Things' })
    // one change event for the theme file, none for appearance.json (not activated)
    expect(published.map((p) => (p.payload as { path: string }).path)).toEqual(['.obsidian/themes/Things/theme.css'])
    expect(published[0]?.excludeUserId).toBe('owner-1')
  })

  it('publishes the appearance.json change as well when the theme is activated', async () => {
    const { app, published } = createTestApp()
    await app.request('/api/v1/vaults/vault-1/theme-store/install', install({ repo: 'o/things', activate: true, replace: true }))
    expect(published.map((p) => (p.payload as { path: string }).path)).toEqual(['.obsidian/themes/Things/theme.css', '.obsidian/appearance.json'])
  })

  it('validates the body before calling the service', async () => {
    let called = false
    const { app } = createTestApp({ service: createMockService({ install: async () => { called = true; return meta } }) })
    for (const body of ['not json', {}, { repo: '../x' }, { repo: 'o/things', replace: 'yes' }, { repo: 'a/b/c' }]) {
      const res = await app.request('/api/v1/vaults/vault-1/theme-store/install', install(body))
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    expect(called).toBe(false)
  })

  it('answers 404 for an unknown vault', async () => {
    const { app } = createTestApp({ entry: null })
    expect((await app.request('/api/v1/vaults/nope/theme-store/install', install({ repo: 'o/things' }))).status).toBe(404)
  })

  it.each([
    ['not in catalog', () => new ThemeNotInCatalogError('o/x'), 404, 'THEME_NOT_IN_CATALOG'],
    ['already installed', () => new ThemeAlreadyInstalledError('Things'), 409, 'THEME_ALREADY_INSTALLED'],
    ['appearance.json invalid', () => new AppearanceFileInvalidError(), 409, 'APPEARANCE_FILE_INVALID'],
    ['files missing', () => new ThemeFilesNotFoundError('o/x', 'theme.css'), 422, 'THEME_FILES_NOT_FOUND'],
    ['too large', () => new ThemeAssetTooLargeError('o/x', 'theme.css', 3), 422, 'THEME_TOO_LARGE'],
    ['name mismatch', () => new ThemeManifestMismatchError('A', 'B'), 422, 'THEME_INVALID'],
    ['upstream down', () => new ThemeStoreFetchError('u', 503), 502, 'UPSTREAM_UNAVAILABLE'],
    ['unexpected', () => new Error('boom'), 500, 'INTERNAL_ERROR'],
  ])('maps %s to its HTTP status', async (_name, makeError, status, code) => {
    const { app, published } = createTestApp({ service: createMockService({ install: async () => { throw makeError() } }) })
    const res = await app.request('/api/v1/vaults/vault-1/theme-store/install', install({ repo: 'o/things' }))
    expect(res.status).toBe(status)
    expect(((await res.json()) as { code: string }).code).toBe(code)
    expect(published).toEqual([]) // a failed install tells nobody anything changed
  })
})
