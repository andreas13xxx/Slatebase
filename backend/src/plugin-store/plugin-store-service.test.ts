// ─── Plugin Store Service Unit Tests ──────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IGitHubClient } from './github-client.js'
import type { IPluginStoreCache } from './plugin-store-cache.js'
import type { IInstalledPluginStore, PluginManifest } from '../plugin/types.js'
import type { ILogger } from '../logger/index.js'
import type {
  CommunityPluginEntry,
  RemotePluginManifest,
  PluginReleaseAssets,
  UpdateCheckResult,
} from './types.js'
import { PluginStoreService } from './plugin-store-service.js'
import {
  DesktopOnlyPluginError,
  PluginNotInStoreError,
  UpstreamError,
} from './errors.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockGitHubClient(): IGitHubClient {
  return {
    fetchCommunityPlugins: vi.fn(),
    fetchManifest: vi.fn(),
    downloadReleaseAssets: vi.fn(),
    fetchCommunityPluginStats: vi.fn().mockResolvedValue(new Map()),
    getRateLimitRemaining: vi.fn().mockReturnValue(100),
  }
}

function createMockCache(): IPluginStoreCache {
  return {
    getPluginList: vi.fn().mockReturnValue(null),
    setPluginList: vi.fn(),
    getManifest: vi.fn().mockReturnValue(null),
    setManifest: vi.fn(),
    getUpdateCheck: vi.fn().mockReturnValue(null),
    setUpdateCheck: vi.fn(),
    invalidateUpdateCheck: vi.fn(),
    getPluginListFallback: vi.fn().mockReturnValue(null),
    getManifestFallback: vi.fn().mockReturnValue(null),
    getUpdateCheckFallback: vi.fn().mockReturnValue(null),
    getPluginStats: vi.fn().mockReturnValue(null),
    setPluginStats: vi.fn(),
    getPluginStatsFallback: vi.fn().mockReturnValue(null),
    load: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockPluginStore(): IInstalledPluginStore {
  return {
    savePlugin: vi.fn(),
    loadManifest: vi.fn().mockResolvedValue(null),
    loadBundle: vi.fn().mockResolvedValue(null),
    loadStyles: vi.fn().mockResolvedValue(null),
    saveSettings: vi.fn(),
    loadSettings: vi.fn().mockResolvedValue(null),
    listPlugins: vi.fn().mockResolvedValue([]),
    deletePlugin: vi.fn(),
    deleteAllForVault: vi.fn(),
    saveRegistry: vi.fn(),
    loadRegistry: vi.fn().mockResolvedValue(null),
  }
}

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as ILogger
}

// ─── Test Data ───────────────────────────────────────────────────────────────

const samplePluginList: CommunityPluginEntry[] = [
  { id: 'plugin-a', name: 'Plugin A', author: 'Author A', description: 'Desc A', repo: 'owner/plugin-a' },
  { id: 'plugin-b', name: 'Plugin B', author: 'Author B', description: 'Desc B', repo: 'owner/plugin-b' },
]

const sampleManifest: RemotePluginManifest = {
  id: 'plugin-a',
  name: 'Plugin A',
  version: '2.0.0',
  author: 'Author A',
  description: 'Desc A',
}

const sampleAssets: PluginReleaseAssets = {
  manifest: Buffer.from(JSON.stringify(sampleManifest)),
  bundle: Buffer.from('// main.js bundle'),
  styles: Buffer.from('/* styles */'),
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('PluginStoreService', () => {
  let githubClient: IGitHubClient
  let cache: IPluginStoreCache
  let pluginStore: IInstalledPluginStore
  let logger: ILogger
  let service: PluginStoreService

  beforeEach(() => {
    githubClient = createMockGitHubClient()
    cache = createMockCache()
    pluginStore = createMockPluginStore()
    logger = createMockLogger()
    service = new PluginStoreService(githubClient, cache, pluginStore, logger)
  })

  // ─── getPluginList() ─────────────────────────────────────────────────────

  describe('getPluginList()', () => {
    it('returns cached data when cache is fresh', async () => {
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)

      const result = await service.getPluginList()

      expect(result).toBe(samplePluginList)
      expect(githubClient.fetchCommunityPlugins).not.toHaveBeenCalled()
    })

    it('fetches from GitHub when cache is empty and stores in cache', async () => {
      vi.mocked(cache.getPluginList).mockReturnValue(null)
      vi.mocked(githubClient.fetchCommunityPlugins).mockResolvedValue(samplePluginList)

      const result = await service.getPluginList()

      expect(result).toEqual(samplePluginList)
      expect(githubClient.fetchCommunityPlugins).toHaveBeenCalledOnce()
      expect(cache.setPluginList).toHaveBeenCalledWith(samplePluginList)
    })

    it('falls back to stale cache when GitHub fails', async () => {
      vi.mocked(cache.getPluginList).mockReturnValue(null)
      vi.mocked(githubClient.fetchCommunityPlugins).mockRejectedValue(new Error('network'))
      vi.mocked(cache.getPluginListFallback).mockReturnValue(samplePluginList)

      const result = await service.getPluginList()

      expect(result).toBe(samplePluginList)
      expect(cache.getPluginListFallback).toHaveBeenCalledOnce()
    })

    it('throws UpstreamError when no data available at all', async () => {
      vi.mocked(cache.getPluginList).mockReturnValue(null)
      vi.mocked(githubClient.fetchCommunityPlugins).mockRejectedValue(new Error('network'))
      vi.mocked(cache.getPluginListFallback).mockReturnValue(null)

      await expect(service.getPluginList()).rejects.toThrow(UpstreamError)
    })
  })

  // ─── getRemoteManifest() ─────────────────────────────────────────────────

  describe('getRemoteManifest()', () => {
    it('returns cached manifest when fresh', async () => {
      vi.mocked(cache.getManifest).mockReturnValue(sampleManifest)

      const result = await service.getRemoteManifest('owner/plugin-a')

      expect(result).toBe(sampleManifest)
      expect(githubClient.fetchManifest).not.toHaveBeenCalled()
    })

    it('fetches from GitHub when cache is empty', async () => {
      vi.mocked(cache.getManifest).mockReturnValue(null)
      vi.mocked(githubClient.fetchManifest).mockResolvedValue(sampleManifest)

      const result = await service.getRemoteManifest('owner/plugin-a')

      expect(result).toEqual(sampleManifest)
      expect(githubClient.fetchManifest).toHaveBeenCalledWith('owner/plugin-a')
      expect(cache.setManifest).toHaveBeenCalledWith('owner/plugin-a', sampleManifest)
    })

    it('falls back to stale data on error', async () => {
      vi.mocked(cache.getManifest).mockReturnValue(null)
      vi.mocked(githubClient.fetchManifest).mockRejectedValue(new Error('timeout'))
      vi.mocked(cache.getManifestFallback).mockReturnValue(sampleManifest)

      const result = await service.getRemoteManifest('owner/plugin-a')

      expect(result).toBe(sampleManifest)
      expect(cache.getManifestFallback).toHaveBeenCalledWith('owner/plugin-a')
    })
  })

  // ─── installFromStore() — Install Flow ───────────────────────────────────

  describe('installFromStore() — Install Flow', () => {
    beforeEach(() => {
      // Default: cache miss on manifest, so it fetches from GitHub
      vi.mocked(cache.getManifest).mockReturnValue(null)
      vi.mocked(githubClient.fetchManifest).mockResolvedValue(sampleManifest)
      vi.mocked(githubClient.downloadReleaseAssets).mockResolvedValue(sampleAssets)
    })

    it('downloads assets, saves plugin, returns PluginInstallResult', async () => {
      const result = await service.installFromStore('vault1', 'plugin-a', 'owner/plugin-a')

      expect(result.pluginId).toBe('plugin-a')
      expect(result.manifest).toEqual(sampleManifest)
      expect(result.warnings).toEqual([])
      expect(pluginStore.savePlugin).toHaveBeenCalledWith(
        'vault1',
        'plugin-a',
        expect.objectContaining({
          manifest: expect.any(String),
          bundle: expect.any(String),
        }),
      )
    })

    it('sets isUpgrade=true when upgrading existing plugin', async () => {
      const existingManifest: PluginManifest = {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.0.0',
      }
      vi.mocked(pluginStore.loadManifest).mockResolvedValue(existingManifest)

      const result = await service.installFromStore('vault1', 'plugin-a', 'owner/plugin-a')

      expect(result.isUpgrade).toBe(true)
    })

    it('sets isUpgrade=false for fresh install', async () => {
      vi.mocked(pluginStore.loadManifest).mockResolvedValue(null)

      const result = await service.installFromStore('vault1', 'plugin-a', 'owner/plugin-a')

      expect(result.isUpgrade).toBe(false)
    })

    it('preserves existing settings (does not overwrite data.json)', async () => {
      const existingManifest: PluginManifest = {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.0.0',
      }
      vi.mocked(pluginStore.loadManifest).mockResolvedValue(existingManifest)

      await service.installFromStore('vault1', 'plugin-a', 'owner/plugin-a')

      // savePlugin only writes manifest/bundle/styles — never settings
      expect(pluginStore.saveSettings).not.toHaveBeenCalled()
    })
  })

  // ─── installFromStore() — Desktop-Only Rejection ──────────────────────────

  describe('installFromStore() — Desktop-Only Rejection', () => {
    it('throws DesktopOnlyPluginError when manifest has isDesktopOnly=true', async () => {
      const desktopManifest: RemotePluginManifest = {
        ...sampleManifest,
        isDesktopOnly: true,
      }
      vi.mocked(cache.getManifest).mockReturnValue(null)
      vi.mocked(githubClient.fetchManifest).mockResolvedValue(desktopManifest)

      await expect(
        service.installFromStore('vault1', 'plugin-a', 'owner/plugin-a'),
      ).rejects.toThrow(DesktopOnlyPluginError)
    })
  })

  // ─── installFromStore() — Version Check ──────────────────────────────────

  describe('installFromStore() — Version Check', () => {
    it('skips install if remote version is not higher than installed', async () => {
      const existingManifest: PluginManifest = {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '3.0.0',
      }
      const remoteManifest: RemotePluginManifest = {
        ...sampleManifest,
        version: '2.0.0',
      }
      const assets: PluginReleaseAssets = {
        manifest: Buffer.from(JSON.stringify(remoteManifest)),
        bundle: Buffer.from('// bundle'),
        styles: null,
      }
      vi.mocked(cache.getManifest).mockReturnValue(null)
      vi.mocked(githubClient.fetchManifest).mockResolvedValue(remoteManifest)
      vi.mocked(githubClient.downloadReleaseAssets).mockResolvedValue(assets)
      vi.mocked(pluginStore.loadManifest).mockResolvedValue(existingManifest)

      const result = await service.installFromStore('vault1', 'plugin-a', 'owner/plugin-a')

      expect(pluginStore.savePlugin).not.toHaveBeenCalled()
      expect(result.isUpgrade).toBe(false)
    })

    it('returns warning in result when version is equal/lower', async () => {
      const existingManifest: PluginManifest = {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '2.0.0',
      }
      const remoteManifest: RemotePluginManifest = {
        ...sampleManifest,
        version: '2.0.0',
      }
      const assets: PluginReleaseAssets = {
        manifest: Buffer.from(JSON.stringify(remoteManifest)),
        bundle: Buffer.from('// bundle'),
        styles: null,
      }
      vi.mocked(cache.getManifest).mockReturnValue(null)
      vi.mocked(githubClient.fetchManifest).mockResolvedValue(remoteManifest)
      vi.mocked(githubClient.downloadReleaseAssets).mockResolvedValue(assets)
      vi.mocked(pluginStore.loadManifest).mockResolvedValue(existingManifest)

      const result = await service.installFromStore('vault1', 'plugin-a', 'owner/plugin-a')

      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('2.0.0')
    })
  })

  // ─── checkUpdates() ──────────────────────────────────────────────────────

  describe('checkUpdates()', () => {
    it('returns cached result when fresh', async () => {
      const cachedResult: UpdateCheckResult = {
        plugins: [],
        checkedAt: new Date().toISOString(),
        errors: [],
      }
      vi.mocked(cache.getUpdateCheck).mockReturnValue(cachedResult)

      const result = await service.checkUpdates('vault1')

      expect(result).toBe(cachedResult)
      expect(pluginStore.listPlugins).not.toHaveBeenCalled()
    })

    it('checks all installed plugins against remote manifests', async () => {
      const installed: PluginManifest[] = [
        { id: 'plugin-a', name: 'Plugin A', version: '1.0.0' },
        { id: 'plugin-b', name: 'Plugin B', version: '1.0.0' },
      ]
      vi.mocked(pluginStore.listPlugins).mockResolvedValue(installed)
      // getPluginList — cache miss, fetch from GitHub
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      // Remote manifests
      vi.mocked(cache.getManifest)
        .mockReturnValueOnce({ ...sampleManifest, id: 'plugin-a', version: '2.0.0' })
        .mockReturnValueOnce({ ...sampleManifest, id: 'plugin-b', version: '1.0.0' })

      const result = await service.checkUpdates('vault1')

      expect(result.plugins).toHaveLength(2)
      expect(cache.setUpdateCheck).toHaveBeenCalledWith('vault1', expect.any(Object))
    })

    it('identifies plugins with available updates (hasUpdate=true)', async () => {
      const installed: PluginManifest[] = [
        { id: 'plugin-a', name: 'Plugin A', version: '1.0.0' },
      ]
      vi.mocked(pluginStore.listPlugins).mockResolvedValue(installed)
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      vi.mocked(cache.getManifest).mockReturnValue({
        ...sampleManifest,
        id: 'plugin-a',
        version: '2.0.0',
      })

      const result = await service.checkUpdates('vault1')

      expect(result.plugins[0]!.hasUpdate).toBe(true)
      expect(result.plugins[0]!.latestVersion).toBe('2.0.0')
      expect(result.plugins[0]!.installedVersion).toBe('1.0.0')
    })

    it('continues checking remaining plugins when one fails', async () => {
      const installed: PluginManifest[] = [
        { id: 'plugin-a', name: 'Plugin A', version: '1.0.0' },
        { id: 'plugin-b', name: 'Plugin B', version: '1.0.0' },
      ]
      vi.mocked(pluginStore.listPlugins).mockResolvedValue(installed)
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      // First plugin: manifest fetch fails
      vi.mocked(cache.getManifest).mockReturnValue(null)
      vi.mocked(githubClient.fetchManifest)
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ ...sampleManifest, id: 'plugin-b', version: '2.0.0' })
      vi.mocked(cache.getManifestFallback).mockReturnValue(null)

      const result = await service.checkUpdates('vault1')

      // plugin-a failed, plugin-b succeeded
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]!.pluginId).toBe('plugin-a')
      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0]!.pluginId).toBe('plugin-b')
    })

    it('stores errors for failed plugins', async () => {
      const installed: PluginManifest[] = [
        { id: 'plugin-a', name: 'Plugin A', version: '1.0.0' },
      ]
      vi.mocked(pluginStore.listPlugins).mockResolvedValue(installed)
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      vi.mocked(cache.getManifest).mockReturnValue(null)
      vi.mocked(githubClient.fetchManifest).mockRejectedValue(new Error('timeout'))
      vi.mocked(cache.getManifestFallback).mockReturnValue(null)

      const result = await service.checkUpdates('vault1')

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]!.pluginId).toBe('plugin-a')
      expect(result.errors[0]!.reason).toContain('unavailable')
    })
  })

  // ─── updatePlugin() ─────────────────────────────────────────────────────

  describe('updatePlugin()', () => {
    it('finds repo from community list and delegates to installFromStore', async () => {
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      vi.mocked(cache.getManifest).mockReturnValue(null)
      vi.mocked(githubClient.fetchManifest).mockResolvedValue(sampleManifest)
      vi.mocked(githubClient.downloadReleaseAssets).mockResolvedValue(sampleAssets)

      const result = await service.updatePlugin('vault1', 'plugin-a')

      expect(result.pluginId).toBe('plugin-a')
      expect(result.manifest).toEqual(sampleManifest)
    })

    it('throws PluginNotInStoreError when plugin not in community list', async () => {
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)

      await expect(
        service.updatePlugin('vault1', 'unknown-plugin'),
      ).rejects.toThrow(PluginNotInStoreError)
    })
  })

  // ─── updateAll() — Bulk-Update ───────────────────────────────────────────

  describe('updateAll() — Bulk-Update', () => {
    it('updates all plugins with hasUpdate=true', async () => {
      const installed: PluginManifest[] = [
        { id: 'plugin-a', name: 'Plugin A', version: '1.0.0' },
        { id: 'plugin-b', name: 'Plugin B', version: '1.0.0' },
      ]
      vi.mocked(pluginStore.listPlugins).mockResolvedValue(installed)
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      // Both plugins have updates
      vi.mocked(cache.getManifest)
        .mockReturnValueOnce({ ...sampleManifest, id: 'plugin-a', version: '2.0.0' })
        .mockReturnValueOnce({ ...sampleManifest, id: 'plugin-b', version: '2.0.0' })
      // For updatePlugin calls (installFromStore)
      vi.mocked(githubClient.fetchManifest).mockResolvedValue({ ...sampleManifest, version: '2.0.0' })
      vi.mocked(githubClient.downloadReleaseAssets).mockResolvedValue(sampleAssets)

      const result = await service.updateAll('vault1')

      expect(result.updated).toHaveLength(2)
      expect(result.failed).toHaveLength(0)
    })

    it('collects successes and failures independently', async () => {
      const installed: PluginManifest[] = [
        { id: 'plugin-a', name: 'Plugin A', version: '1.0.0' },
        { id: 'plugin-b', name: 'Plugin B', version: '1.0.0' },
      ]
      vi.mocked(pluginStore.listPlugins).mockResolvedValue(installed)
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      // Both have updates
      vi.mocked(cache.getManifest)
        .mockReturnValueOnce({ ...sampleManifest, id: 'plugin-a', version: '2.0.0' })
        .mockReturnValueOnce({ ...sampleManifest, id: 'plugin-b', version: '2.0.0' })

      // updatePlugin: first succeeds, second fails
      // First call to getPluginList (in updatePlugin) returns from cache
      // For plugin-a install: succeed
      // For plugin-b install: fail on downloadReleaseAssets
      vi.mocked(githubClient.fetchManifest).mockResolvedValue({ ...sampleManifest, version: '2.0.0' })
      vi.mocked(githubClient.downloadReleaseAssets)
        .mockResolvedValueOnce(sampleAssets)
        .mockRejectedValueOnce(new Error('download failed'))

      const result = await service.updateAll('vault1')

      expect(result.updated).toHaveLength(1)
      expect(result.updated[0]!.pluginId).toBe('plugin-a')
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0]!.pluginId).toBe('plugin-b')
    })

    it('does not fail entire bulk when individual update fails', async () => {
      const installed: PluginManifest[] = [
        { id: 'plugin-a', name: 'Plugin A', version: '1.0.0' },
      ]
      vi.mocked(pluginStore.listPlugins).mockResolvedValue(installed)
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      vi.mocked(cache.getManifest).mockReturnValue({
        ...sampleManifest,
        id: 'plugin-a',
        version: '2.0.0',
      })
      vi.mocked(githubClient.fetchManifest).mockResolvedValue({ ...sampleManifest, version: '2.0.0' })
      vi.mocked(githubClient.downloadReleaseAssets).mockRejectedValue(new Error('fail'))

      // Should NOT throw
      const result = await service.updateAll('vault1')

      expect(result.failed).toHaveLength(1)
      expect(result.updated).toHaveLength(0)
    })
  })

  // ─── getPluginStats() ────────────────────────────────────────────────────

  describe('getPluginStats()', () => {
    it('returns cached stats without calling GitHub when cache is fresh', async () => {
      const cachedStats = new Map([
        ['plugin-a', { pluginId: 'plugin-a', downloads: 42, updatedAt: '2026-01-01T00:00:00.000Z' }],
      ])
      vi.mocked(cache.getPluginStats).mockReturnValue(cachedStats)

      const result = await service.getPluginStats()

      expect(result.stats).toEqual({
        'plugin-a': { pluginId: 'plugin-a', downloads: 42, updatedAt: '2026-01-01T00:00:00.000Z' },
      })
      expect(githubClient.fetchCommunityPluginStats).not.toHaveBeenCalled()
    })

    it('fetches the single stats file and maps entries by community plugin ID', async () => {
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      vi.mocked(githubClient.fetchCommunityPluginStats).mockResolvedValue(new Map([
        ['plugin-a', { downloads: 100, updatedAt: '2026-02-01T00:00:00.000Z' }],
        ['plugin-not-in-store', { downloads: 999, updatedAt: '2026-02-01T00:00:00.000Z' }],
      ]))

      const result = await service.getPluginStats()

      // Only plugin-a is in samplePluginList; plugin-b has no stats entry;
      // plugin-not-in-store isn't in the community list and must be dropped.
      expect(result.stats).toEqual({
        'plugin-a': { pluginId: 'plugin-a', downloads: 100, updatedAt: '2026-02-01T00:00:00.000Z' },
      })
      expect(githubClient.fetchCommunityPluginStats).toHaveBeenCalledOnce()
      expect(cache.setPluginStats).toHaveBeenCalledOnce()
    })

    it('falls back to stale cache when the stats fetch fails', async () => {
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      vi.mocked(githubClient.fetchCommunityPluginStats).mockRejectedValue(new Error('rate limited'))
      const staleStats = new Map([
        ['plugin-a', { pluginId: 'plugin-a', downloads: 7, updatedAt: '2025-12-01T00:00:00.000Z' }],
      ])
      vi.mocked(cache.getPluginStatsFallback).mockReturnValue(staleStats)

      const result = await service.getPluginStats()

      expect(result.stats).toEqual({
        'plugin-a': { pluginId: 'plugin-a', downloads: 7, updatedAt: '2025-12-01T00:00:00.000Z' },
      })
    })

    it('throws UpstreamError when the fetch fails and no cache fallback exists', async () => {
      vi.mocked(cache.getPluginList).mockReturnValue(samplePluginList)
      vi.mocked(githubClient.fetchCommunityPluginStats).mockRejectedValue(new Error('rate limited'))
      vi.mocked(cache.getPluginStatsFallback).mockReturnValue(null)

      await expect(service.getPluginStats()).rejects.toThrow(UpstreamError)
    })
  })
})
