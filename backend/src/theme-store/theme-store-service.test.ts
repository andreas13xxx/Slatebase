import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ILogger } from '../logger/index.js'
import { ThemeService } from '../themes/index.js'
import {
  ThemeAlreadyInstalledError,
  ThemeFilesNotFoundError,
  ThemeIdUnderivableError,
  ThemeManifestMismatchError,
  ThemeNotInCatalogError,
  ThemeStoreFetchError,
} from './errors.js'
import { ThemeStoreCache } from './theme-store-cache.js'
import { ThemeStoreService } from './theme-store-service.js'
import type { CommunityThemeEntry, IThemeStoreClient, RemoteThemeFiles, ThemeScreenshot } from './types.js'

const entry = (name: string, repo: string, extra: Partial<CommunityThemeEntry> = {}): CommunityThemeEntry => ({
  name, author: 'a', repo, screenshot: 'screenshot.png', modes: ['dark', 'light'], legacy: false, ...extra,
})

const CATALOG = [
  entry('Things', 'o/things'),
  entry('Minimal', 'o/minimal'),
  entry('Odd', 'o/odd'),
  entry('日本語', 'o/cjk'),
]

/** Hand-written client double: serves fixed files and records every call. */
function createMockClient(overrides: {
  catalog?: () => Promise<CommunityThemeEntry[]>
  files?: Record<string, RemoteThemeFiles | Error>
  manifests?: Record<string, Record<string, unknown> | Error>
  screenshot?: ThemeScreenshot | null
} = {}): IThemeStoreClient & { calls: { catalog: number; files: string[]; manifests: string[]; screenshots: string[] } } {
  const calls = { catalog: 0, files: [] as string[], manifests: [] as string[], screenshots: [] as string[] }
  return {
    calls,
    async fetchCatalog() {
      calls.catalog++
      return overrides.catalog ? overrides.catalog() : CATALOG
    },
    async fetchThemeFiles(repo) {
      calls.files.push(repo)
      const result = overrides.files?.[repo]
      if (result instanceof Error) throw result
      if (!result) throw new ThemeFilesNotFoundError(repo, 'theme.css')
      return result
    },
    async fetchManifest(repo) {
      calls.manifests.push(repo)
      const result = overrides.manifests?.[repo]
      if (result instanceof Error) throw result
      if (!result) throw new ThemeFilesNotFoundError(repo, 'manifest.json')
      return result
    },
    async fetchScreenshot(repo, shotPath) {
      calls.screenshots.push(`${repo}:${shotPath}`)
      return overrides.screenshot ?? null
    },
  }
}

const silent: ILogger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }
const config = { cacheTtlCatalog: 60_000, cacheTtlManifest: 60_000 }
const files = (name: string, version = '1.0.0', css = 'body { --x: 1 }'): RemoteThemeFiles => ({ css, manifest: { name, version, author: 'Someone', unknownField: 1 } })

let vault: string
let themes: ThemeService
let clock: number

beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-theme-store-svc-'))
  themes = new ThemeService()
  clock = 1_000_000
})

afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
})

function createService(client: IThemeStoreClient) {
  const cache = new ThemeStoreCache(config, undefined, undefined, () => clock)
  return { service: new ThemeStoreService(client, cache, themes, silent), cache }
}

describe('listCatalog', () => {
  it('fetches once and serves later calls from the cache', async () => {
    const client = createMockClient()
    const { service } = createService(client)
    expect((await service.listCatalog()).themes).toHaveLength(4)
    expect(await service.listCatalog()).toMatchObject({ stale: false })
    expect(client.calls.catalog).toBe(1)
  })

  it('shares one request between concurrent callers', async () => {
    const client = createMockClient()
    const { service } = createService(client)
    await Promise.all([service.listCatalog(), service.listCatalog(), service.listCatalog()])
    expect(client.calls.catalog).toBe(1)
  })

  it('serves the last known list as stale when GitHub fails after the TTL', async () => {
    let fail = false
    const client = createMockClient({ catalog: async () => { if (fail) throw new ThemeStoreFetchError('u', 0); return CATALOG } })
    const { service } = createService(client)
    await service.listCatalog()
    clock += config.cacheTtlCatalog + 1
    fail = true
    const result = await service.listCatalog()
    expect(result.stale).toBe(true)
    expect(result.themes).toHaveLength(4)
  })

  it('throws when there is nothing cached and GitHub fails: unknown is not "empty"', async () => {
    const client = createMockClient({ catalog: async () => { throw new ThemeStoreFetchError('u', 0) } })
    const { service } = createService(client)
    await expect(service.listCatalog()).rejects.toBeInstanceOf(ThemeStoreFetchError)
  })
})

describe('install', () => {
  it('saves the theme with the manifest fields it knows and drops the rest', async () => {
    const client = createMockClient({ files: { 'o/things': files('Things', '2.2.4') } })
    const { service } = createService(client)

    const meta = await service.install(vault, 'o/things', { replace: false, activate: false })

    expect(meta.id).toBe('Things')
    expect(meta.manifest).toMatchObject({ name: 'Things', version: '2.2.4', author: 'Someone' })
    expect(await fs.readFile(path.join(vault, '.obsidian/themes/Things/theme.css'), 'utf-8')).toBe('body { --x: 1 }')
    const manifest = JSON.parse(await fs.readFile(path.join(vault, '.obsidian/themes/Things/manifest.json'), 'utf-8')) as Record<string, unknown>
    expect(manifest['unknownField']).toBeUndefined()
    expect(await themes.getActiveThemeId(vault)).toBeNull()
  })

  it('activates the theme on request and keeps other appearance.json fields', async () => {
    await fs.mkdir(path.join(vault, '.obsidian'), { recursive: true })
    await fs.writeFile(path.join(vault, '.obsidian/appearance.json'), JSON.stringify({ baseFontSize: 18 }))
    const { service } = createService(createMockClient({ files: { 'o/things': files('Things') } }))

    await service.install(vault, 'o/things', { replace: false, activate: true })

    expect(await themes.getActiveThemeId(vault)).toBe('Things')
    expect(JSON.parse(await fs.readFile(path.join(vault, '.obsidian/appearance.json'), 'utf-8'))).toMatchObject({ baseFontSize: 18, cssTheme: 'Things' })
  })

  it('refuses a repo that is not in the catalog without fetching anything', async () => {
    const client = createMockClient()
    const { service } = createService(client)
    await expect(service.install(vault, 'evil/repo', { replace: false, activate: false })).rejects.toBeInstanceOf(ThemeNotInCatalogError)
    expect(client.calls.files).toEqual([])
  })

  it('refuses a manifest that names a different theme than the catalog', async () => {
    const { service } = createService(createMockClient({ files: { 'o/things': files('Minimal') } }))
    await expect(service.install(vault, 'o/things', { replace: false, activate: false })).rejects.toBeInstanceOf(ThemeManifestMismatchError)
    expect(await themes.listThemes(vault)).toEqual([])
  })

  it('matches the manifest name case-insensitively', async () => {
    const { service } = createService(createMockClient({ files: { 'o/things': files('THINGS') } }))
    const meta = await service.install(vault, 'o/things', { replace: false, activate: false })
    expect(meta.id).toBe('THINGS')
  })

  it('answers an existing theme with ThemeAlreadyInstalledError unless replace is set', async () => {
    await themes.saveTheme(vault, 'Things', 'old{}', { name: 'Things', version: '1.0.0' })
    const { service } = createService(createMockClient({ files: { 'o/things': files('Things', '2.0.0', 'new{}') } }))

    await expect(service.install(vault, 'o/things', { replace: false, activate: false })).rejects.toBeInstanceOf(ThemeAlreadyInstalledError)
    expect((await themes.loadTheme(vault, 'Things'))?.css).toBe('old{}')

    const meta = await service.install(vault, 'o/things', { replace: true, activate: false })
    expect(meta.manifest.version).toBe('2.0.0')
    expect((await themes.loadTheme(vault, 'Things'))?.css).toBe('new{}')
  })

  it('detects an existing theme whose folder differs only in case', async () => {
    await themes.saveTheme(vault, 'things', 'old{}', { name: 'things' })
    const { service } = createService(createMockClient({ files: { 'o/things': files('Things') } }))
    await expect(service.install(vault, 'o/things', { replace: false, activate: false })).rejects.toBeInstanceOf(ThemeAlreadyInstalledError)
  })

  it('writes nothing when the download fails', async () => {
    const { service } = createService(createMockClient({ files: { 'o/things': new ThemeFilesNotFoundError('o/things', 'theme.css') } }))
    await expect(service.install(vault, 'o/things', { replace: false, activate: false })).rejects.toBeInstanceOf(ThemeFilesNotFoundError)
    await expect(fs.stat(path.join(vault, '.obsidian/themes'))).rejects.toThrow()
  })

  it('derives a folder name from the theme name, or fails when none is usable', async () => {
    const { service } = createService(createMockClient({ files: { 'o/odd': files('Odd'), 'o/cjk': files('日本語') } }))
    await expect(service.install(vault, 'o/cjk', { replace: false, activate: false })).rejects.toBeInstanceOf(ThemeIdUnderivableError)
    expect((await service.install(vault, 'o/odd', { replace: false, activate: false })).id).toBe('Odd')
  })
})

describe('checkUpdates', () => {
  async function installLocally(name: string, version?: string): Promise<void> {
    await themes.saveTheme(vault, name, 'a{}', { name, ...(version ? { version } : {}) })
  }

  it('reports a newer remote version and ignores themes without a catalog entry', async () => {
    await installLocally('Things', '2.2.4')
    await installLocally('Minimal', '9.1.4')
    await installLocally('MyOwn', '1.0.0') // self-imported, not in the catalog
    const client = createMockClient({ manifests: { 'o/things': { version: '2.3.0' }, 'o/minimal': { version: '9.1.4' } } })
    const { service } = createService(client)

    const result = await service.checkUpdates('v1', vault)

    expect(result.updates).toEqual([
      { themeId: 'Things', name: 'Things', repo: 'o/things', installedVersion: '2.2.4', latestVersion: '2.3.0' },
    ])
    expect(result.checked).toBe(2)
    expect(client.calls.manifests.sort()).toEqual(['o/minimal', 'o/things'])
    expect(result.warnings).toEqual([])
  })

  it('maps an installed theme to the catalog by manifest name, not by folder name', async () => {
    await themes.saveTheme(vault, 'renamed-folder', 'a{}', { name: 'things', version: '1.0.0' })
    const { service } = createService(createMockClient({ manifests: { 'o/things': { version: '1.1.0' } } }))
    const result = await service.checkUpdates('v1', vault)
    expect(result.updates.map((u) => u.themeId)).toEqual(['renamed-folder'])
  })

  it('puts a failing lookup into warnings, not into "up to date", and does not cache that result', async () => {
    await installLocally('Things', '1.0.0')
    await installLocally('Minimal', '1.0.0')
    const client = createMockClient({ manifests: { 'o/things': { version: '1.5.0' }, 'o/minimal': new ThemeStoreFetchError('u', 503) } })
    const { service } = createService(client)

    const first = await service.checkUpdates('v1', vault)
    expect(first.updates.map((u) => u.name)).toEqual(['Things'])
    expect(first.warnings).toHaveLength(1)
    expect(first.warnings[0]).toContain('Minimal')

    await service.checkUpdates('v1', vault)
    expect(client.calls.manifests.filter((r) => r === 'o/minimal')).toHaveLength(2) // retried: the failed check was not cached
  })

  it('lists themes whose version cannot be compared as unknown instead of up to date', async () => {
    await installLocally('Things') // no version in the local manifest
    await installLocally('Minimal', '1.0.0')
    const { service } = createService(createMockClient({ manifests: { 'o/things': { version: '1.0.0' }, 'o/minimal': { version: 'latest' } } }))
    const result = await service.checkUpdates('v1', vault)
    expect(result.updates).toEqual([])
    expect(result.unknown.sort()).toEqual(['Minimal', 'Things'])
  })

  it('caches a clean result per vault for the TTL', async () => {
    await installLocally('Things', '1.0.0')
    const client = createMockClient({ manifests: { 'o/things': { version: '1.0.0' } } })
    const { service } = createService(client)

    await service.checkUpdates('v1', vault)
    await service.checkUpdates('v1', vault)
    expect(client.calls.manifests).toHaveLength(1)

    clock += config.cacheTtlManifest + 1
    await service.checkUpdates('v1', vault)
    expect(client.calls.manifests).toHaveLength(2)
  })

  it('returns an empty result for a vault without themes', async () => {
    const { service } = createService(createMockClient())
    expect(await service.checkUpdates('v1', vault)).toMatchObject({ updates: [], unknown: [], warnings: [], checked: 0 })
  })
})

describe('getScreenshot', () => {
  it('uses the path from the catalog, never one supplied by the caller', async () => {
    const shot: ThemeScreenshot = { contentType: 'image/png', data: Buffer.from([1]) }
    const client = createMockClient({ screenshot: shot })
    const { service } = createService(client)
    expect(await service.getScreenshot('o/things')).toBe(shot)
    expect(client.calls.screenshots).toEqual(['o/things:screenshot.png'])
  })

  it('refuses a repo that is not in the catalog', async () => {
    const { service } = createService(createMockClient())
    await expect(service.getScreenshot('evil/repo')).rejects.toBeInstanceOf(ThemeNotInCatalogError)
  })
})
