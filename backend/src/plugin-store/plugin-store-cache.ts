// ─── Plugin Store Cache ───────────────────────────────────────────────────────

import { join } from 'node:path'
import type { CommunityPluginEntry, IPluginStoreConfig, RemotePluginManifest, UpdateCheckResult, PluginReleaseStats } from './types.js'
import type { ILogger } from '../logger/index.js'
import { JsonFileStore } from '../shared/json-file-store.js'

/** A cached entry with TTL expiration tracking */
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * On-disk representation of the community store's cached data (plugin list,
 * manifests, release stats). Persisted so a backend restart doesn't force
 * every browse of the "Available" plugins tab to re-fetch from GitHub —
 * which otherwise burns through GitHub's unauthenticated rate limit again.
 *
 * Per-vault update-check results are intentionally NOT persisted: they're
 * cheap to recompute (derived from the manifest cache + installed plugins,
 * no extra GitHub calls) and inherently tied to a vault's current install
 * state, which is more likely to have moved on across a restart anyway.
 */
interface PersistedCacheState {
  version: 1
  pluginList: CacheEntry<CommunityPluginEntry[]> | null
  manifests: Array<{ repo: string; entry: CacheEntry<RemotePluginManifest> }>
  pluginStats: CacheEntry<Array<[string, PluginReleaseStats]>> | null
}

const CACHE_FILE = 'plugin-store-cache.json'

const EMPTY_PERSISTED_STATE: PersistedCacheState = {
  version: 1,
  pluginList: null,
  manifests: [],
  pluginStats: null,
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
  /** Loads persisted plugin list/manifests/stats from disk, if present. Call once at startup. */
  load(): Promise<void>
}

/**
 * In-Memory cache implementation using Map with TTL-based expiration.
 * Stores data with expiration timestamps and provides both fresh and
 * stale (fallback) access patterns for resilient upstream error handling.
 *
 * The plugin list, manifests, and stats are additionally persisted to
 * `{dataDir}/plugin-store-cache.json` (atomic writes, best-effort) so they
 * survive a backend restart — see {@link PersistedCacheState}.
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
  private readonly store: JsonFileStore<PersistedCacheState> | null
  private readonly logger: ILogger | null
  /** Resolves once the most recently triggered persist() write has settled — test-only hook. */
  private lastPersist: Promise<void> = Promise.resolve()

  constructor(config: IPluginStoreConfig, dataDir?: string, logger?: ILogger) {
    this.cacheTtlPluginList = config.cacheTtlPluginList
    this.cacheTtlManifest = config.cacheTtlManifest
    this.logger = logger ?? null
    this.store = dataDir
      ? new JsonFileStore(join(dataDir, CACHE_FILE), EMPTY_PERSISTED_STATE, (raw) =>
          isValidPersistedState(raw) ? raw : null,
        )
      : null
  }

  /**
   * Loads persisted plugin list/manifests/stats from disk, if present.
   * Call once at startup, before serving any requests. Entries that are
   * already past their TTL are still loaded — get() will treat them as
   * expired, but they remain available via the *Fallback() methods.
   */
  async load(): Promise<void> {
    if (!this.store) return

    const state = await this.store.read()

    this.pluginList = state.pluginList
    this.manifests.clear()
    for (const { repo, entry } of state.manifests) {
      this.manifests.set(repo, entry)
    }
    this.pluginStats = state.pluginStats
      ? { data: new Map(state.pluginStats.data), expiresAt: state.pluginStats.expiresAt }
      : null

    const manifestCount = this.manifests.size
    if (this.pluginList || manifestCount > 0 || this.pluginStats) {
      this.logger?.info('Plugin store cache loaded from disk', {
        hasPluginList: this.pluginList !== null,
        manifestCount,
        hasPluginStats: this.pluginStats !== null,
      })
    }
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
    this.persist()
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
    this.persist()
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
    this.persist()
  }

  /** Get cached plugin stats even if expired (fallback for errors) */
  getPluginStatsFallback(): Map<string, PluginReleaseStats> | null {
    if (this.pluginStats === null) {
      return null
    }
    return this.pluginStats.data
  }

  /**
   * Fire-and-forget write of the current pluginList/manifests/pluginStats to
   * disk. `JsonFileStore.write()` serializes concurrent writes internally, so
   * calls made back-to-back without awaiting still land in the order issued.
   * Best-effort: a failed write only means the next restart re-fetches from
   * GitHub, so it's logged rather than surfaced to the caller.
   */
  private persist(): void {
    if (!this.store) return

    const state: PersistedCacheState = {
      version: 1,
      pluginList: this.pluginList,
      manifests: Array.from(this.manifests, ([repo, entry]) => ({ repo, entry })),
      pluginStats: this.pluginStats
        ? { data: Array.from(this.pluginStats.data), expiresAt: this.pluginStats.expiresAt }
        : null,
    }

    this.lastPersist = this.store.write(state).catch((err: unknown) => {
      this.logger?.error('Failed to persist plugin store cache', { error: String(err) })
    })
  }

  /**
   * Resolves once the most recently triggered persist() write has settled.
   * Test-only: lets tests await the fire-and-forget write instead of racing it.
   */
  async waitForPersist(): Promise<void> {
    await this.lastPersist
  }
}

function isValidPersistedState(data: unknown): data is PersistedCacheState {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  if (obj['version'] !== 1) return false
  if (!Array.isArray(obj['manifests'])) return false
  return true
}
