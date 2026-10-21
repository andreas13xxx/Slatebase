import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import { ThemeStoreCache } from './theme-store-cache.js'
import type { CommunityThemeEntry, IThemeStoreClient } from './types.js'
import { warmThemeStoreCatalog } from './warmup.js'

const ENTRY: CommunityThemeEntry = { name: 'Things', author: 'a', repo: 'o/things', screenshot: '', modes: ['dark'], legacy: false }
const config = { cacheTtlCatalog: 1000, cacheTtlManifest: 500 }

const silent: ILogger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }

let dir: string
let clock: number
const now = () => clock

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-theme-store-'))
  clock = 10_000
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('ThemeStoreCache', () => {
  it('serves the catalog within its TTL, hides it afterwards and keeps it as a stale fallback', () => {
    const cache = new ThemeStoreCache(config, undefined, undefined, now)
    expect(cache.getCatalog()).toBeNull()
    cache.setCatalog([ENTRY])
    expect(cache.getCatalog()).toEqual([ENTRY])
    clock += 1001
    expect(cache.getCatalog()).toBeNull()
    expect(cache.getCatalogStale()).toEqual([ENTRY])
  })

  it('expires manifests and update results with the shorter TTL', () => {
    const cache = new ThemeStoreCache(config, undefined, undefined, now)
    cache.setManifest('o/things', { version: '1.0.0' })
    cache.setUpdateCheck('v1', { updates: [] })
    expect(cache.getManifest('o/things')).toEqual({ version: '1.0.0' })
    expect(cache.getUpdateCheck('v1')).toEqual({ updates: [] })
    clock += 501
    expect(cache.getManifest('o/things')).toBeNull()
    expect(cache.getUpdateCheck('v1')).toBeNull()
  })

  it('invalidates an update result for one vault only', () => {
    const cache = new ThemeStoreCache(config, undefined, undefined, now)
    cache.setUpdateCheck('v1', 'a')
    cache.setUpdateCheck('v2', 'b')
    cache.invalidateUpdateCheck('v1')
    expect(cache.getUpdateCheck('v1')).toBeNull()
    expect(cache.getUpdateCheck('v2')).toBe('b')
  })

  it('persists the catalog so a restart without network still has it', async () => {
    const first = new ThemeStoreCache(config, dir, silent, now)
    first.setCatalog([ENTRY])
    await first.flush()

    const second = new ThemeStoreCache(config, dir, silent, now)
    await second.load()
    expect(second.getCatalog()).toEqual([ENTRY])

    clock += 5000 // expired after the "restart": not fresh, but still available as fallback
    expect(second.getCatalog()).toBeNull()
    expect(second.getCatalogStale()).toEqual([ENTRY])
  })

  it('does not persist manifests or update results', async () => {
    const first = new ThemeStoreCache(config, dir, silent, now)
    first.setManifest('o/things', { version: '1' })
    first.setUpdateCheck('v1', 'x')
    first.setCatalog([ENTRY])
    await first.flush()

    const second = new ThemeStoreCache(config, dir, silent, now)
    await second.load()
    expect(second.getManifest('o/things')).toBeNull()
    expect(second.getUpdateCheck('v1')).toBeNull()
  })

  it('treats an unreadable or foreign cache file as empty instead of failing the start', async () => {
    await fs.writeFile(path.join(dir, 'theme-store-cache.json'), '{ not json')
    const broken = new ThemeStoreCache(config, dir, silent, now)
    await expect(broken.load()).resolves.toBeUndefined()
    expect(broken.getCatalogStale()).toBeNull()

    await fs.writeFile(path.join(dir, 'theme-store-cache.json'), JSON.stringify({ version: 99, catalog: null }))
    const foreign = new ThemeStoreCache(config, dir, silent, now)
    await foreign.load()
    expect(foreign.getCatalogStale()).toBeNull()
  })

  it('drops persisted entries that no longer pass validation', async () => {
    const file = path.join(dir, 'theme-store-cache.json')
    const bad = { name: 'Evil', author: '', repo: '../x', screenshot: '', modes: [], legacy: false }
    await fs.writeFile(file, JSON.stringify({ version: 1, catalog: { data: [ENTRY, bad], expiresAt: clock + 100 } }))
    const cache = new ThemeStoreCache(config, dir, silent, now)
    await cache.load()
    expect(cache.getCatalog()).toEqual([ENTRY])
  })
})

describe('warmThemeStoreCatalog', () => {
  function clientReturning(result: CommunityThemeEntry[] | Error): IThemeStoreClient & { calls: number } {
    return {
      calls: 0,
      async fetchCatalog() {
        this.calls++
        if (result instanceof Error) throw result
        return result
      },
      fetchThemeFiles: () => Promise.reject(new Error('unused')),
      fetchManifest: () => Promise.reject(new Error('unused')),
      fetchScreenshot: () => Promise.resolve(null),
    }
  }

  it('fetches and caches the catalog', async () => {
    const cache = new ThemeStoreCache(config, undefined, undefined, now)
    const client = clientReturning([ENTRY])
    expect(await warmThemeStoreCatalog(client, cache, silent)).toBe(1)
    expect(cache.getCatalog()).toEqual([ENTRY])
  })

  it('skips the request when the catalog is still fresh', async () => {
    const cache = new ThemeStoreCache(config, undefined, undefined, now)
    cache.setCatalog([ENTRY])
    const client = clientReturning([])
    expect(await warmThemeStoreCatalog(client, cache, silent)).toBeNull()
    expect(client.calls).toBe(0)
  })

  it('never rejects when the network fails: logs once, keeps the stale catalog, does not retry', async () => {
    const cache = new ThemeStoreCache(config, undefined, undefined, now)
    cache.setCatalog([ENTRY])
    clock += 5000
    const warnings: string[] = []
    const logger: ILogger = { ...silent, warn: (message) => { warnings.push(message) } }
    const client = clientReturning(new Error('offline'))

    await expect(warmThemeStoreCatalog(client, cache, logger)).resolves.toBeNull()
    expect(warnings).toHaveLength(1)
    expect(client.calls).toBe(1)
    expect(cache.getCatalogStale()).toEqual([ENTRY])
  })

  it('does not hold up its caller: a slow upstream only delays the returned promise', async () => {
    const cache = new ThemeStoreCache(config, undefined, undefined, now)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const client: IThemeStoreClient = {
      async fetchCatalog() { await gate; return [ENTRY] },
      fetchThemeFiles: () => Promise.reject(new Error('unused')),
      fetchManifest: () => Promise.reject(new Error('unused')),
      fetchScreenshot: () => Promise.resolve(null),
    }
    const pending = warmThemeStoreCatalog(client, cache, silent) // deliberately not awaited, as at startup
    expect(cache.getCatalog()).toBeNull()
    release()
    expect(await pending).toBe(1)
  })
})
