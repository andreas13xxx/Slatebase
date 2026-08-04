import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PluginStoreCache } from './plugin-store-cache.js'
import type { CommunityPluginEntry, IPluginStoreConfig, RemotePluginManifest, UpdateCheckResult } from './types.js'

function createTestConfig(overrides?: Partial<IPluginStoreConfig>): IPluginStoreConfig {
  return {
    cacheTtlPluginList: 3600000, // 1h
    cacheTtlManifest: 900000,    // 15min
    maxAssetSize: 10 * 1024 * 1024,
    maxTotalDownloadSize: 15 * 1024 * 1024,
    autoCheckInterval: 86400000,
    ...overrides
  }
}

function createTestPlugin(id: string): CommunityPluginEntry {
  return { id, name: `Plugin ${id}`, author: 'Author', description: 'A plugin', repo: `owner/${id}` }
}

function createTestManifest(id: string): RemotePluginManifest {
  return { id, name: `Plugin ${id}`, version: '1.0.0', author: 'Author' }
}

function createTestUpdateCheck(): UpdateCheckResult {
  return {
    plugins: [{ pluginId: 'test', installedVersion: '1.0.0', latestVersion: '1.1.0', hasUpdate: true, releaseUrl: 'https://github.com/owner/test/releases/latest', repo: 'owner/test' }],
    checkedAt: new Date().toISOString(),
    errors: []
  }
}

describe('PluginStoreCache', () => {
  let cache: PluginStoreCache

  beforeEach(() => {
    vi.useFakeTimers()
    cache = new PluginStoreCache(createTestConfig())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('pluginList', () => {
    it('returns null when never set', () => {
      expect(cache.getPluginList()).toBeNull()
    })

    it('returns data when within TTL', () => {
      const plugins = [createTestPlugin('calendar'), createTestPlugin('dataview')]
      cache.setPluginList(plugins)

      expect(cache.getPluginList()).toEqual(plugins)
    })

    it('returns null when TTL has expired', () => {
      const plugins = [createTestPlugin('calendar')]
      cache.setPluginList(plugins)

      // Advance past 1h TTL
      vi.advanceTimersByTime(3600001)

      expect(cache.getPluginList()).toBeNull()
    })

    it('returns data right at TTL boundary', () => {
      const plugins = [createTestPlugin('calendar')]
      cache.setPluginList(plugins)

      // Advance exactly to TTL (not past it)
      vi.advanceTimersByTime(3600000)

      expect(cache.getPluginList()).toEqual(plugins)
    })

    it('overwrites previous data on subsequent set', () => {
      const plugins1 = [createTestPlugin('calendar')]
      const plugins2 = [createTestPlugin('dataview')]

      cache.setPluginList(plugins1)
      cache.setPluginList(plugins2)

      expect(cache.getPluginList()).toEqual(plugins2)
    })
  })

  describe('pluginList fallback', () => {
    it('returns null when never set', () => {
      expect(cache.getPluginListFallback()).toBeNull()
    })

    it('returns data even when TTL has expired', () => {
      const plugins = [createTestPlugin('calendar')]
      cache.setPluginList(plugins)

      vi.advanceTimersByTime(7200000) // 2h past expiration

      expect(cache.getPluginListFallback()).toEqual(plugins)
    })

    it('returns fresh data when within TTL', () => {
      const plugins = [createTestPlugin('calendar')]
      cache.setPluginList(plugins)

      expect(cache.getPluginListFallback()).toEqual(plugins)
    })
  })

  describe('manifest', () => {
    it('returns null when repo never cached', () => {
      expect(cache.getManifest('owner/unknown')).toBeNull()
    })

    it('returns manifest when within TTL', () => {
      const manifest = createTestManifest('calendar')
      cache.setManifest('owner/calendar', manifest)

      expect(cache.getManifest('owner/calendar')).toEqual(manifest)
    })

    it('returns null when TTL has expired', () => {
      const manifest = createTestManifest('calendar')
      cache.setManifest('owner/calendar', manifest)

      vi.advanceTimersByTime(900001) // 15min + 1ms

      expect(cache.getManifest('owner/calendar')).toBeNull()
    })

    it('stores manifests per repo independently', () => {
      const manifest1 = createTestManifest('calendar')
      const manifest2 = createTestManifest('dataview')

      cache.setManifest('owner/calendar', manifest1)
      cache.setManifest('owner/dataview', manifest2)

      expect(cache.getManifest('owner/calendar')).toEqual(manifest1)
      expect(cache.getManifest('owner/dataview')).toEqual(manifest2)
    })
  })

  describe('manifest fallback', () => {
    it('returns null when repo never cached', () => {
      expect(cache.getManifestFallback('owner/unknown')).toBeNull()
    })

    it('returns manifest even when expired', () => {
      const manifest = createTestManifest('calendar')
      cache.setManifest('owner/calendar', manifest)

      vi.advanceTimersByTime(1800000) // 30min past expiration

      expect(cache.getManifestFallback('owner/calendar')).toEqual(manifest)
    })
  })

  describe('updateCheck', () => {
    it('returns null when vault never checked', () => {
      expect(cache.getUpdateCheck('vault-abc')).toBeNull()
    })

    it('returns result when within TTL', () => {
      const result = createTestUpdateCheck()
      cache.setUpdateCheck('vault-abc', result)

      expect(cache.getUpdateCheck('vault-abc')).toEqual(result)
    })

    it('returns null when TTL has expired', () => {
      const result = createTestUpdateCheck()
      cache.setUpdateCheck('vault-abc', result)

      vi.advanceTimersByTime(900001) // 15min + 1ms

      expect(cache.getUpdateCheck('vault-abc')).toBeNull()
    })

    it('uses manifest TTL for update checks', () => {
      const config = createTestConfig({ cacheTtlManifest: 60000 }) // 1min
      const customCache = new PluginStoreCache(config)
      const result = createTestUpdateCheck()

      customCache.setUpdateCheck('vault-abc', result)

      vi.advanceTimersByTime(60000) // exactly 1min
      expect(customCache.getUpdateCheck('vault-abc')).toEqual(result)

      vi.advanceTimersByTime(1) // 1ms past
      expect(customCache.getUpdateCheck('vault-abc')).toBeNull()
    })

    it('stores update checks per vault independently', () => {
      const result1 = createTestUpdateCheck()
      const result2: UpdateCheckResult = { plugins: [], checkedAt: new Date().toISOString(), errors: [] }

      cache.setUpdateCheck('vault-1', result1)
      cache.setUpdateCheck('vault-2', result2)

      expect(cache.getUpdateCheck('vault-1')).toEqual(result1)
      expect(cache.getUpdateCheck('vault-2')).toEqual(result2)
    })
  })

  describe('invalidateUpdateCheck', () => {
    it('removes cached update check for a vault', () => {
      const result = createTestUpdateCheck()
      cache.setUpdateCheck('vault-abc', result)

      cache.invalidateUpdateCheck('vault-abc')

      expect(cache.getUpdateCheck('vault-abc')).toBeNull()
    })

    it('also removes fallback data after invalidation', () => {
      const result = createTestUpdateCheck()
      cache.setUpdateCheck('vault-abc', result)

      cache.invalidateUpdateCheck('vault-abc')

      expect(cache.getUpdateCheckFallback('vault-abc')).toBeNull()
    })

    it('does not throw when invalidating non-existent entry', () => {
      expect(() => cache.invalidateUpdateCheck('non-existent')).not.toThrow()
    })

    it('does not affect other vaults', () => {
      const result1 = createTestUpdateCheck()
      const result2: UpdateCheckResult = { plugins: [], checkedAt: new Date().toISOString(), errors: [] }

      cache.setUpdateCheck('vault-1', result1)
      cache.setUpdateCheck('vault-2', result2)

      cache.invalidateUpdateCheck('vault-1')

      expect(cache.getUpdateCheck('vault-1')).toBeNull()
      expect(cache.getUpdateCheck('vault-2')).toEqual(result2)
    })
  })

  describe('updateCheck fallback', () => {
    it('returns null when vault never checked', () => {
      expect(cache.getUpdateCheckFallback('vault-abc')).toBeNull()
    })

    it('returns result even when expired', () => {
      const result = createTestUpdateCheck()
      cache.setUpdateCheck('vault-abc', result)

      vi.advanceTimersByTime(1800000) // 30min past expiration

      expect(cache.getUpdateCheckFallback('vault-abc')).toEqual(result)
    })
  })

  describe('TTL configuration', () => {
    it('respects custom plugin list TTL', () => {
      const config = createTestConfig({ cacheTtlPluginList: 5000 }) // 5s
      const customCache = new PluginStoreCache(config)
      const plugins = [createTestPlugin('calendar')]

      customCache.setPluginList(plugins)

      vi.advanceTimersByTime(5000)
      expect(customCache.getPluginList()).toEqual(plugins)

      vi.advanceTimersByTime(1)
      expect(customCache.getPluginList()).toBeNull()
    })

    it('respects custom manifest TTL', () => {
      const config = createTestConfig({ cacheTtlManifest: 2000 }) // 2s
      const customCache = new PluginStoreCache(config)
      const manifest = createTestManifest('calendar')

      customCache.setManifest('owner/calendar', manifest)

      vi.advanceTimersByTime(2000)
      expect(customCache.getManifest('owner/calendar')).toEqual(manifest)

      vi.advanceTimersByTime(1)
      expect(customCache.getManifest('owner/calendar')).toBeNull()
    })
  })
})
