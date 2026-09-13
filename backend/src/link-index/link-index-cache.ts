// LinkIndexCache — lazy-loading, LRU-bounded cache of per-vault LinkIndexService instances
//
// Historically every vault got a LinkIndexService at server startup, whether or not
// anyone ever opened it — memory grows with the total vault count, not the number in
// active use. This cache creates (and loads) an index only on first access, and evicts
// the least-recently-used ones once more than `maxLoaded` are held, so long-idle vaults
// stop costing memory.
//
// Two access patterns are exposed:
// - `get()` — synchronous, mirrors the old `Map.get()` behavior every existing caller
//   already handles (an index that exists but isn't `isReady()` yet). Creates the entry
//   on first touch and kicks off its load in the background; never awaits.
// - `getAsync()` — for callers that can tolerate awaiting: creates the entry if needed
//   and waits for its initial load (or rebuild fallback) to finish before returning.
//
// `createFresh()` is the third path, for a vault that has no persisted index worth
// loading yet (newly created) — it registers an empty index without touching disk,
// leaving the caller to either rebuild() it (a welcome vault, pre-populated with
// template files) or let incremental updateFile() calls populate it (a bare new vault).

import type { ILogger } from '../logger/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { KeyedMutex } from '../shared/async-mutex.js'
import { LinkIndexService } from './link-index-service.js'
import type {
  ILinkIndex,
  GraphData,
  GraphMeta,
  GraphQueryOptions,
  PropertyFilter,
} from './types.js'

/** Default cap on simultaneously loaded vault indexes; override via `SLATEBASE_LINK_INDEX_MAX_LOADED`. */
export const DEFAULT_LINK_INDEX_MAX_LOADED = 20

export interface LinkIndexCacheDependencies {
  vaultRegistry: IVaultRegistry
  logger: ILogger
  /** Max vaults kept loaded at once; least-recently-used ones are evicted beyond this. */
  maxLoaded?: number
}

interface CacheEntry {
  service: LinkIndexService
  loadPromise: Promise<void>
  /** Count of in-flight mutating calls; an entry with writesInFlight > 0 is never evicted. */
  writesInFlight: number
  lastAccess: number
}

/**
 * Delegates every ILinkIndex method to the wrapped LinkIndexService. Mutating calls run
 * through the cache's per-vault `opLock`, which serializes them against each other *and*
 * against the entry's initial `loadFromDisk()` — without that, a save arriving moments
 * after first touching an idle vault could run concurrently with the load that just
 * kicked off, and `loadFromDisk()`/`rebuild()` clearing+repopulating the maps from the
 * (stale) on-disk snapshot could silently undo the save. Serializing them means the load
 * — always kicked off first, before the caller can call anything on the returned wrapper
 * — finishes and leaves the index in a clean, ready state before the save runs on top of
 * it. The same `writesInFlight` counter this produces also guards eviction: every
 * mutating method already `await`s its own `persist()` before resolving (verified in
 * link-index-service.ts), so once a wrapped call resolves the change is durably on disk —
 * eviction only needs to be blocked while a call is actually in flight, never after.
 */
class PinningLinkIndex implements ILinkIndex {
  constructor(
    private readonly vaultId: string,
    private readonly service: LinkIndexService,
    private readonly entry: CacheEntry,
    private readonly opLock: KeyedMutex,
  ) {}

  private pinned<T>(fn: () => Promise<T>): Promise<T> {
    // Increment synchronously, before `runExclusive` — not inside its callback.
    // `AsyncMutex.runExclusive` always awaits the previous queue entry before
    // running `fn`, even when the mutex is free, so incrementing inside that
    // callback would leave a window (until the first microtask tick) where a
    // synchronously-reachable eviction check wouldn't see the pin yet.
    this.entry.writesInFlight++
    return this.opLock.runExclusive(this.vaultId, fn).finally(() => {
      this.entry.writesInFlight--
    })
  }

  rebuild(): Promise<void> {
    return this.pinned(() => this.service.rebuild())
  }

  updateFile(filePath: string, content: string): Promise<void> {
    return this.pinned(() => this.service.updateFile(filePath, content))
  }

  removeFile(filePath: string): Promise<void> {
    return this.pinned(() => this.service.removeFile(filePath))
  }

  renameFile(oldPath: string, newPath: string, content: string): Promise<void> {
    return this.pinned(() => this.service.renameFile(oldPath, newPath, content))
  }

  renameDirectory(oldPath: string, newPath: string): Promise<void> {
    return this.pinned(() => this.service.renameDirectory(oldPath, newPath))
  }

  getForwardLinks(filePath: string): string[] {
    return this.service.getForwardLinks(filePath)
  }

  getBacklinks(filePath: string): string[] {
    return this.service.getBacklinks(filePath)
  }

  getGraph(options?: GraphQueryOptions): GraphData {
    return this.service.getGraph(options)
  }

  getGraphMeta(): GraphMeta {
    return this.service.getGraphMeta()
  }

  isReady(): boolean {
    return this.service.isReady()
  }

  getFilesByProperty(key: string, value?: string): string[] {
    return this.service.getFilesByProperty(key, value)
  }

  getPropertyKeys(): Array<{ key: string; count: number }> {
    return this.service.getPropertyKeys()
  }

  getPropertyValues(key: string, limit?: number): Array<{ value: string; count: number }> {
    return this.service.getPropertyValues(key, limit)
  }

  queryByProperties(filters: PropertyFilter[]): string[] {
    return this.service.queryByProperties(filters)
  }
}

export class LinkIndexCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly opLock = new KeyedMutex()
  private readonly vaultRegistry: IVaultRegistry
  private readonly logger: ILogger
  private readonly maxLoaded: number

  constructor(deps: LinkIndexCacheDependencies) {
    this.vaultRegistry = deps.vaultRegistry
    this.logger = deps.logger
    this.maxLoaded = deps.maxLoaded ?? DEFAULT_LINK_INDEX_MAX_LOADED
  }

  /**
   * Synchronous lookup. Returns undefined only if the vault doesn't exist in the
   * registry. Otherwise ensures an entry exists — creating and kicking off its
   * background load on first touch — and returns it immediately, possibly not yet
   * `isReady()`. This has no `await` anywhere in it, so it's atomic with respect to
   * the event loop: two calls for the same never-before-seen vaultId cannot both
   * decide to create an entry, whether they come from the same synchronous caller or
   * from two "concurrent" async ones — one of them always runs to completion (map
   * insert included) before the other can observe the miss.
   */
  get(vaultId: string): ILinkIndex | undefined {
    const existing = this.entries.get(vaultId)
    if (existing) {
      existing.lastAccess = Date.now()
      return new PinningLinkIndex(vaultId, existing.service, existing, this.opLock)
    }

    const vaultEntry = this.vaultRegistry.findById(vaultId)
    if (vaultEntry === null) return undefined

    const entry = this.register(vaultId, vaultEntry.storagePath, vaultEntry.name)
    // Route the initial load through the same per-vault opLock every mutating call
    // uses (see PinningLinkIndex) — see its comment for why an unserialized load
    // could otherwise race (and lose) a save arriving right behind it. Pin
    // synchronously for the same reason PinningLinkIndex.pinned() does.
    entry.writesInFlight++
    entry.loadPromise = this.opLock.runExclusive(vaultId, () => entry.service.loadFromDisk())
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error('Failed to lazily load link index', { vaultId, error: message })
      })
      .finally(() => {
        entry.writesInFlight--
      })
    return new PinningLinkIndex(vaultId, entry.service, entry, this.opLock)
  }

  /**
   * Like `get()`, but waits for the initial load (or its rebuild fallback) to finish
   * before returning, for callers that can tolerate awaiting instead of polling
   * `isReady()` themselves.
   */
  async getAsync(vaultId: string): Promise<ILinkIndex | undefined> {
    const wrapper = this.get(vaultId)
    if (wrapper === undefined) return undefined
    await this.entries.get(vaultId)?.loadPromise
    return wrapper
  }

  /**
   * Registers a brand-new, empty index for a vault with nothing worth loading from
   * disk yet — does not touch the filesystem. The caller decides what happens next:
   * call `.rebuild()` (a pre-populated welcome vault) or just start sending it
   * `.updateFile()` calls as files are saved (a bare new vault). Either way that call
   * goes through the same wrapper and opLock as every other mutation.
   */
  createFresh(vaultId: string, vaultPath: string, vaultName: string): ILinkIndex {
    const existing = this.entries.get(vaultId)
    if (existing) {
      existing.lastAccess = Date.now()
      return new PinningLinkIndex(vaultId, existing.service, existing, this.opLock)
    }
    const entry = this.register(vaultId, vaultPath, vaultName)
    return new PinningLinkIndex(vaultId, entry.service, entry, this.opLock)
  }

  /** Drops a vault's index entirely — called when the vault itself is deleted. */
  delete(vaultId: string): void {
    this.entries.delete(vaultId)
  }

  private register(vaultId: string, vaultPath: string, vaultName: string): CacheEntry {
    const service = new LinkIndexService(vaultPath, vaultId, vaultName, this.logger)
    const entry: CacheEntry = {
      service,
      loadPromise: Promise.resolve(),
      writesInFlight: 0,
      lastAccess: Date.now(),
    }
    this.entries.set(vaultId, entry)
    this.evictIfNeeded()
    return entry
  }

  /** Evicts least-recently-used entries (skipping any with a write in flight) until at or under the cap. */
  private evictIfNeeded(): void {
    while (this.entries.size > this.maxLoaded) {
      let victimId: string | undefined
      let oldestAccess = Infinity
      for (const [id, entry] of this.entries) {
        if (entry.writesInFlight > 0) continue
        if (entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess
          victimId = id
        }
      }
      if (victimId === undefined) {
        // Everything currently loaded is mid-write; try again once one finishes.
        break
      }
      this.entries.delete(victimId)
      this.logger.debug('Evicted idle link index from cache', { vaultId: victimId, loadedCount: this.entries.size })
    }
  }
}
