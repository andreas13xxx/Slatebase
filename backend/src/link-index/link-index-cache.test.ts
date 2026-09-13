import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { LinkIndexCache } from './link-index-cache.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createMockLogger(),
  } as unknown as ILogger
}

function createMockVaultRegistry(entries: VaultRegistryEntry[]): IVaultRegistry {
  return {
    load: async () => entries,
    save: async () => {},
    addEntry: async () => {},
    removeEntry: async () => {},
    findById: (vaultId: string) => entries.find((e) => e.id === vaultId) ?? null,
    findByName: (name: string) => entries.find((e) => e.name === name) ?? null,
    updateEntries: async (mutator) => mutator(entries),
  }
}

describe('LinkIndexCache', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'link-index-cache-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function makeVault(id: string, name: string): Promise<VaultRegistryEntry> {
    const storagePath = path.join(tempDir, id)
    await fs.mkdir(storagePath, { recursive: true })
    return { id, name, storagePath, createdAt: new Date().toISOString() }
  }

  describe('get()', () => {
    it('returns undefined for a vault not in the registry', () => {
      const cache = new LinkIndexCache({ vaultRegistry: createMockVaultRegistry([]), logger: createMockLogger() })
      expect(cache.get('nonexistent')).toBeUndefined()
    })

    it('lazily creates and loads an index on first touch, picking up existing files via rebuild', async () => {
      const vault = await makeVault('v1', 'Vault One')
      await fs.writeFile(path.join(vault.storagePath, 'note.md'), '#hello')
      const cache = new LinkIndexCache({ vaultRegistry: createMockVaultRegistry([vault]), logger: createMockLogger() })

      const index = await cache.getAsync('v1')
      expect(index).toBeDefined()
      expect(index!.isReady()).toBe(true)
      expect(index!.getGraphMeta().tags).toContainEqual({ name: 'hello', count: 1 })
    })

    it('shares one entry across repeated get() calls rather than recreating it', async () => {
      const vault = await makeVault('v1', 'Vault One')
      const cache = new LinkIndexCache({ vaultRegistry: createMockVaultRegistry([vault]), logger: createMockLogger() })

      const first = cache.get('v1')!
      const second = cache.get('v1')!
      await first.updateFile('a.md', '#tag-from-first')

      // Mutations through one handle are visible through the other — same
      // underlying LinkIndexService, not two independently-created instances.
      expect(second.getGraphMeta().tags).toContainEqual({ name: 'tag-from-first', count: 1 })
    })
  })

  describe('createFresh()', () => {
    it('registers an empty index without touching disk, for a vault the registry does not even know about yet', () => {
      const cache = new LinkIndexCache({ vaultRegistry: createMockVaultRegistry([]), logger: createMockLogger() })
      const storagePath = path.join(tempDir, 'does-not-exist-yet')

      const index = cache.createFresh('new-vault', storagePath, 'New Vault')

      expect(index.isReady()).toBe(false)
      expect(index.getGraphMeta()).toEqual({ tags: [], propertyKeys: [] })
    })

    it('is idempotent: a second call for the same vaultId returns the same entry, not a fresh empty one', async () => {
      const cache = new LinkIndexCache({ vaultRegistry: createMockVaultRegistry([]), logger: createMockLogger() })
      const storagePath = path.join(tempDir, 'fresh-vault')

      const first = cache.createFresh('v1', storagePath, 'Fresh Vault')
      await first.updateFile('a.md', '#seen-once')

      const second = cache.createFresh('v1', storagePath, 'Fresh Vault')
      expect(second.getGraphMeta().tags).toContainEqual({ name: 'seen-once', count: 1 })
    })
  })

  describe('delete()', () => {
    it('drops the entry so a later get() creates and loads a fresh one', async () => {
      const vault = await makeVault('v1', 'Vault One')
      const cache = new LinkIndexCache({ vaultRegistry: createMockVaultRegistry([vault]), logger: createMockLogger() })

      const before = await cache.getAsync('v1')
      await before!.updateFile('a.md', '#before')
      expect(before!.getGraphMeta().tags).toContainEqual({ name: 'before', count: 1 })

      cache.delete('v1')

      const after = await cache.getAsync('v1')
      // Fresh instance, reloaded from disk (a.md was persisted by the update above).
      expect(after!.getGraphMeta().tags).toContainEqual({ name: 'before', count: 1 })
      expect(after).not.toBe(before)
    })
  })

  describe('LRU eviction', () => {
    it('evicts the least-recently-used vault once the cap is exceeded, forcing a reload on next touch', async () => {
      const vaultA = await makeVault('a', 'Vault A')
      const vaultB = await makeVault('b', 'Vault B')
      // A real file on disk, so the reload-after-eviction's prune pass has
      // something to compare against (an all-empty directory is treated as an
      // unmounted/unreadable vault and left alone — see pruneMissingFiles).
      await fs.writeFile(path.join(vaultA.storagePath, 'real.md'), '#keep')
      const cache = new LinkIndexCache({
        vaultRegistry: createMockVaultRegistry([vaultA, vaultB]),
        logger: createMockLogger(),
        maxLoaded: 1,
      })

      const a1 = await cache.getAsync('a')
      // Indexed in memory (and persisted to the index's own JSON) but never
      // actually written as a vault file.
      await a1!.updateFile('fake.md', '#from-memory-only')
      // Touching b exceeds maxLoaded(1), so a (now the LRU entry) gets evicted.
      await cache.getAsync('b')

      // Reloading vault a from a fresh LinkIndexService re-scans the directory,
      // finds only real.md, and prunes fake.md's entry — proving a genuinely
      // fresh instance was created and reloaded, not the same one reused.
      const a2 = await cache.getAsync('a')
      const tags = a2!.getGraphMeta().tags
      expect(tags).toContainEqual({ name: 'keep', count: 1 })
      expect(tags).not.toContainEqual({ name: 'from-memory-only', count: 1 })
    })

    it('never evicts an entry while one of its mutating calls is still in flight', async () => {
      const vaultA = await makeVault('a', 'Vault A')
      const vaultB = await makeVault('b', 'Vault B')
      const cache = new LinkIndexCache({
        vaultRegistry: createMockVaultRegistry([vaultA, vaultB]),
        logger: createMockLogger(),
        maxLoaded: 1,
      })

      const a = await cache.getAsync('a')
      const writePromise = a!.updateFile('a.md', '#pending')
      // Eviction pressure for a different vault, triggered synchronously (no
      // `await` before it) while a's write is still in flight — this is exactly
      // the window where a non-synchronous pin would have raced the eviction scan.
      cache.get('b')
      await writePromise

      // Had 'a' been wrongly evicted, this get() would create a brand-new,
      // not-yet-loaded entry (isReady() false until its own async load finishes).
      // It wasn't evicted, so the original already-loaded entry is still there.
      expect(cache.get('a')!.isReady()).toBe(true)
    })
  })

  describe('load-vs-write ordering', () => {
    it('serializes an update arriving right after first touch behind the initial load, instead of racing it', async () => {
      const vault = await makeVault('v1', 'Vault One')
      // Pre-existing content that the initial load's rebuild-fallback will pick up.
      await fs.writeFile(path.join(vault.storagePath, 'existing.md'), '#from-disk')
      const cache = new LinkIndexCache({ vaultRegistry: createMockVaultRegistry([vault]), logger: createMockLogger() })

      // get() kicks off the load in the background and returns immediately;
      // call updateFile() on the same (not-yet-ready) handle right away, the
      // way linkIndexHook.onFileSaved does after a real file save.
      const index = cache.get('v1')!
      await index.updateFile('new.md', '#from-update')

      // Both the disk-scanned file and the racing update must be present —
      // if the load's rebuild() had run concurrently with (or after) the
      // update instead of being serialized ahead of it, it would have cleared
      // the maps and dropped the update.
      const tags = index.getGraphMeta().tags
      expect(tags).toContainEqual({ name: 'from-disk', count: 1 })
      expect(tags).toContainEqual({ name: 'from-update', count: 1 })
    })
  })
})
