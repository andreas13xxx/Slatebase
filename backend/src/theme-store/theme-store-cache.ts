// ─── Theme Store Cache ────────────────────────────────────────────────────────

import { join } from 'node:path'
import type { ILogger } from '../logger/index.js'
import { JsonFileStore } from '../shared/json-file-store.js'
import type { CommunityThemeEntry, IThemeStoreConfig } from './types.js'
import { communityThemeEntrySchema } from './validation.js'

/** A cached value with its expiry time (epoch ms). */
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/** On-disk shape: only the catalog is persisted, so a restart without network access still has a list to show. */
interface PersistedState {
  version: 1
  catalog: CacheEntry<CommunityThemeEntry[]> | null
}

const CACHE_FILE = 'theme-store-cache.json'
const EMPTY_STATE: PersistedState = { version: 1, catalog: null }

/** Validates what was read from disk; anything unexpected counts as "no cache" rather than crashing the start. */
function parsePersisted(raw: unknown): PersistedState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const state = raw as { version?: unknown; catalog?: unknown }
  if (state.version !== 1) return null
  if (state.catalog === null) return { version: 1, catalog: null }
  const catalog = state.catalog as { data?: unknown; expiresAt?: unknown } | undefined
  if (!catalog || !Array.isArray(catalog.data) || typeof catalog.expiresAt !== 'number') return null
  const entries: CommunityThemeEntry[] = []
  for (const item of catalog.data) {
    const parsed = communityThemeEntrySchema.safeParse(item)
    if (parsed.success) entries.push(parsed.data)
  }
  return { version: 1, catalog: { data: entries, expiresAt: catalog.expiresAt } }
}

/**
 * Cache for theme store data. Every `get*` returns the value only while it is within its TTL; every `get*Stale`
 * returns it regardless, for the case that GitHub cannot be reached ("unknown" must fall back to the last known list,
 * not to an empty one).
 *
 * Catalog (TTL 1 h by default) is also written to `{dataDir}/theme-store-cache.json`. Remote manifests and update-check
 * results (15 min) are memory only: they are cheap to recompute and update results are tied to a vault's current state.
 */
export interface IThemeStoreCache {
  /** Loads the persisted catalog from disk, if present. Call once at startup. */
  load(): Promise<void>
  getCatalog(): CommunityThemeEntry[] | null
  getCatalogStale(): CommunityThemeEntry[] | null
  setCatalog(entries: CommunityThemeEntry[]): void
  getManifest(repo: string): Record<string, unknown> | null
  setManifest(repo: string, manifest: Record<string, unknown>): void
  getUpdateCheck<T>(vaultId: string): T | null
  setUpdateCheck<T>(vaultId: string, result: T): void
  invalidateUpdateCheck(vaultId: string): void
}

/** Memory cache with TTLs and a persisted catalog. `now` is injectable for tests. */
export class ThemeStoreCache implements IThemeStoreCache {
  private catalog: CacheEntry<CommunityThemeEntry[]> | null = null
  private readonly manifests = new Map<string, CacheEntry<Record<string, unknown>>>()
  private readonly updateChecks = new Map<string, CacheEntry<unknown>>()
  private readonly store: JsonFileStore<PersistedState> | null
  /** Resolves once the latest persist has settled (test hook). */
  private lastPersist: Promise<void> = Promise.resolve()

  constructor(
    private readonly config: IThemeStoreConfig,
    dataDir?: string,
    private readonly logger?: ILogger,
    private readonly now: () => number = Date.now,
  ) {
    this.store = dataDir ? new JsonFileStore(join(dataDir, CACHE_FILE), EMPTY_STATE, parsePersisted) : null
  }

  async load(): Promise<void> {
    if (!this.store) return
    const state = await this.store.read()
    this.catalog = state.catalog
    if (this.catalog) this.logger?.info('Theme store catalog loaded from disk', { entries: this.catalog.data.length })
  }

  getCatalog(): CommunityThemeEntry[] | null {
    return this.catalog !== null && this.catalog.expiresAt > this.now() ? this.catalog.data : null
  }

  getCatalogStale(): CommunityThemeEntry[] | null {
    return this.catalog?.data ?? null
  }

  setCatalog(entries: CommunityThemeEntry[]): void {
    this.catalog = { data: entries, expiresAt: this.now() + this.config.cacheTtlCatalog }
    this.persist()
  }

  getManifest(repo: string): Record<string, unknown> | null {
    const entry = this.manifests.get(repo)
    return entry && entry.expiresAt > this.now() ? entry.data : null
  }

  setManifest(repo: string, manifest: Record<string, unknown>): void {
    this.manifests.set(repo, { data: manifest, expiresAt: this.now() + this.config.cacheTtlManifest })
  }

  getUpdateCheck<T>(vaultId: string): T | null {
    const entry = this.updateChecks.get(vaultId)
    return entry && entry.expiresAt > this.now() ? (entry.data as T) : null
  }

  setUpdateCheck<T>(vaultId: string, result: T): void {
    this.updateChecks.set(vaultId, { data: result, expiresAt: this.now() + this.config.cacheTtlManifest })
  }

  invalidateUpdateCheck(vaultId: string): void {
    this.updateChecks.delete(vaultId)
  }

  /** Resolves once the most recent persist has settled. Test hook only. */
  async flush(): Promise<void> {
    await this.lastPersist
  }

  /** Best-effort write: a failed write must never break serving from memory. */
  private persist(): void {
    if (!this.store) return
    const state: PersistedState = { version: 1, catalog: this.catalog }
    this.lastPersist = this.store.write(state).catch((error: unknown) => {
      this.logger?.warn('Failed to persist theme store cache', { error: error instanceof Error ? error.message : String(error) })
    })
  }
}
