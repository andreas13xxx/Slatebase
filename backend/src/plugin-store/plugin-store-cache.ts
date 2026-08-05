// ─── Plugin Store Cache ───────────────────────────────────────────────────────

import type { CommunityPluginEntry, IPluginStoreConfig, RemotePluginManifest, UpdateCheckResult, PluginReleaseStats } from './types.js'

/** A cached entry with TTL expiration tracking */
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * In-Memory cache for Plugin Store data with TTL-based expiration.
 * Provides fresh data when within TTL and fallback (stale) data
 * when expired — allowing the service layer to decide refresh behavior.
 */
export interface IPluginStoreCache {
  /** Get the community plugin list if within TTL, otherwise null */
  getPluginList(): CommunityPluginEntry[] | null
  /** Store the community plugin list with configured TTL */
  setPluginList(data: CommunityPluginEntry[]): void
  /** Get a cached remote manifest if within TTL, otherwise null */
  getManifest(repo: string): RemotePluginManifest | null
  /** Store a remote manifest with configured TTL */
  setManifest(repo: string, manifest: RemotePluginManifest): void
  /** Get a cached update check result if within TTL, otherwise null */
  getUpdateCheck(vaultId: string): UpdateCheckResult | null
  /** Store an update check result with configured TTL */
  setUpdateCheck(vaultId: string, result: UpdateCheckResult): void
  /** Invalidate a cached update check result for a specific vault */
  invalidateUpdateCheck(vaultId: string): void
  /** Get the community plugin list even if expired (fallback for errors) */
  getPluginListFallback(): CommunityPluginEntry[] | null
  /** Get a cached remote manifest even if expired (fallback for errors) */
  getManifestFallback(repo: string): RemotePluginManifest | null
  /** Get a cached update check result even if expired (fallback for errors) */
  getUpdateCheckFallback(vaultId: string): UpdateCheckResult | null
  /** Get cached plugin stats if within TTL, otherwise null */
  getPluginStats(): Map<string, PluginReleaseStats> | null
  /** Store plugin stats with configured TTL (same as plugin list TTL) */
  setPluginStats(stats: Map<string, PluginReleaseStats>): void
  /** Get cached plugin stats even if expired (fallback for errors) */
  getPluginStatsFallback(): Map<string, PluginReleaseStats> | null
}

/**
 * In-Memory cache implementation using Map with TTL-based expiration.
 * Stores data with expiration timestamps and provides both fresh and
 * stale (fallback) access patterns for resilient upstream error handling.
 *
 * TTL values are sourced from {@link IPluginStoreConfig}:
 * - Plugin list: `cacheTtlPluginList` (default 1h)
 * - Remote manifests: `cacheTtlManifest` (default 15min)
 * - Update check results: same as manifest TTL (15min)
 */
export class PluginStoreCache implements IPluginStoreCache {
  private pluginList: CacheEntry<CommunityPluginEntry[]> | null = null
  private readonly manifests = new Map<string, CacheEntry<RemotePluginManifest>>()
  private readonly updateChecks = new Map<string, CacheEntry<UpdateCheckResult>>()
  private pluginStats: CacheEntry<Map<string, PluginReleaseStats>> | null = null

  private readonly cacheTtlPluginList: number
  private readonly cacheTtlManifest: number

  constructor(config: IPluginStoreConfig) {
    this.cacheTtlPluginList = config.cacheTtlPluginList
    this.cacheTtlManifest = config.cacheTtlManifest
  }

  /** Get the community plugin list if within TTL, otherwise null */
  getPluginList(): CommunityPluginEntry[] | null {
    if (this.pluginList === null) {
      return null
    }
    if (Date.now() > this.pluginList.expiresAt) {
      return null
    }
    return this.pluginList.data
  }

  /** Store the community plugin list with configured TTL */
  setPluginList(data: CommunityPluginEntry[]): void {
    this.pluginList = {
      data,
      expiresAt: Date.now() + this.cacheTtlPluginList
    }
  }

  /** Get a cached remote manifest if within TTL, otherwise null */
  getManifest(repo: string): RemotePluginManifest | null {
    const entry = this.manifests.get(repo)
    if (entry === undefined) {
      return null
    }
    if (Date.now() > entry.expiresAt) {
      return null
    }
    return entry.data
  }

  /** Store a remote manifest with configured TTL */
  setManifest(repo: string, manifest: RemotePluginManifest): void {
    this.manifests.set(repo, {
      data: manifest,
      expiresAt: Date.now() + this.cacheTtlManifest
    })
  }

  /** Get a cached update check result if within TTL, otherwise null */
  getUpdateCheck(vaultId: string): UpdateCheckResult | null {
    const entry = this.updateChecks.get(vaultId)
    if (entry === undefined) {
      return null
    }
    if (Date.now() > entry.expiresAt) {
      return null
    }
    return entry.data
  }

  /** Store an update check result with configured TTL */
  setUpdateCheck(vaultId: string, result: UpdateCheckResult): void {
    this.updateChecks.set(vaultId, {
      data: result,
      expiresAt: Date.now() + this.cacheTtlManifest
    })
  }

  /** Invalidate a cached update check result for a specific vault */
  invalidateUpdateCheck(vaultId: string): void {
    this.updateChecks.delete(vaultId)
  }

  /** Get the community plugin list even if expired (fallback for errors) */
  getPluginListFallback(): CommunityPluginEntry[] | null {
    if (this.pluginList === null) {
      return null
    }
    return this.pluginList.data
  }

  /** Get a cached remote manifest even if expired (fallback for errors) */
  getManifestFallback(repo: string): RemotePluginManifest | null {
    const entry = this.manifests.get(repo)
    if (entry === undefined) {
      return null
    }
    return entry.data
  }

  /** Get a cached update check result even if expired (fallback for errors) */
  getUpdateCheckFallback(vaultId: string): UpdateCheckResult | null {
    const entry = this.updateChecks.get(vaultId)
    if (entry === undefined) {
      return null
    }
    return entry.data
  }

  /** Get cached plugin stats if within TTL, otherwise null */
  getPluginStats(): Map<string, PluginReleaseStats> | null {
    if (this.pluginStats === null) {
      return null
    }
    if (Date.now() > this.pluginStats.expiresAt) {
      return null
    }
    return this.pluginStats.data
  }

  /** Store plugin stats with configured TTL (same as plugin list TTL) */
  setPluginStats(stats: Map<string, PluginReleaseStats>): void {
    this.pluginStats = {
      data: stats,
      expiresAt: Date.now() + this.cacheTtlPluginList,
    }
  }

  /** Get cached plugin stats even if expired (fallback for errors) */
  getPluginStatsFallback(): Map<string, PluginReleaseStats> | null {
    if (this.pluginStats === null) {
      return null
    }
    return this.pluginStats.data
  }
}
