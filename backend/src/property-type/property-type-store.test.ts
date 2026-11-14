// Unit tests for PropertyTypeStore

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { PropertyTypeStore, PropertyTypeReservedKeyError, PropertyTypeMaxEntriesError } from './property-type-store.js'
import type { PropertyTypeEntry, PropertyTypeRegistry } from './types.js'
import type { ILogger } from '../logger/index.js'

// ─── Setup ───────────────────────────────────────────────────────────────────

let tmpDir: string
let store: PropertyTypeStore
const VAULT_ID = 'vault-test-1'

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `property-type-store-test-${crypto.randomBytes(8).toString('hex')}`)
  const vaultPath = path.join(tmpDir, VAULT_ID)
  await fs.mkdir(path.join(vaultPath, '.slatebase'), { recursive: true })

  store = new PropertyTypeStore(
    (vaultId) => vaultId === VAULT_ID ? vaultPath : null,
    createMockLogger(),
  )
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PropertyTypeStore', () => {
  describe('getRegistry', () => {
    it('returns an empty registry for a vault with no file', async () => {
      const registry = await store.getRegistry(VAULT_ID)
      expect(registry).toEqual({ entries: [] })
    })

    it('throws when vault path cannot be resolved', async () => {
      await expect(store.getRegistry('nonexistent-vault')).rejects.toThrow('Vault not found')
    })
  })

  describe('saveRegistry', () => {
    it('saves and retrieves a registry', async () => {
      const registry: PropertyTypeRegistry = {
        entries: [
          { key: 'status', type: 'text' },
          { key: 'priority', type: 'number' },
          { key: 'due-date', type: 'date' },
        ],
      }

      const saved = await store.saveRegistry(VAULT_ID, registry)
      expect(saved.entries).toHaveLength(3)

      const loaded = await store.getRegistry(VAULT_ID)
      expect(loaded.entries).toHaveLength(3)
      expect(loaded.entries[0]).toEqual({ key: 'status', type: 'text' })
    })

    it('enforces reserved key types (tags)', async () => {
      const registry: PropertyTypeRegistry = {
        entries: [
          { key: 'tags', type: 'text' }, // Should be silently corrected to 'tags'
        ],
      }

      const saved = await store.saveRegistry(VAULT_ID, registry)
      expect(saved.entries[0]!.type).toBe('tags')
    })

    it('enforces reserved key types (aliases)', async () => {
      const registry: PropertyTypeRegistry = {
        entries: [
          { key: 'aliases', type: 'list' }, // Should be silently corrected to 'aliases'
        ],
      }

      const saved = await store.saveRegistry(VAULT_ID, registry)
      expect(saved.entries[0]!.type).toBe('aliases')
    })

    it('preserves options', async () => {
      const registry: PropertyTypeRegistry = {
        entries: [
          { key: 'status', type: 'text', options: { allowedValues: ['open', 'closed', 'in-progress'] } },
        ],
      }

      const saved = await store.saveRegistry(VAULT_ID, registry)
      expect(saved.entries[0]!.options?.allowedValues).toEqual(['open', 'closed', 'in-progress'])

      const loaded = await store.getRegistry(VAULT_ID)
      expect(loaded.entries[0]!.options?.allowedValues).toEqual(['open', 'closed', 'in-progress'])
    })

    it('caps entries at 200', async () => {
      const entries: PropertyTypeEntry[] = Array.from({ length: 210 }, (_, i) => ({
        key: `prop-${i}`,
        type: 'text' as const,
      }))

      const saved = await store.saveRegistry(VAULT_ID, { entries })
      expect(saved.entries).toHaveLength(200)
    })
  })

  describe('upsertEntry', () => {
    it('adds a new entry', async () => {
      // Start fresh
      await store.saveRegistry(VAULT_ID, { entries: [] })

      const result = await store.upsertEntry(VAULT_ID, { key: 'author', type: 'text' })
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]).toEqual({ key: 'author', type: 'text' })
    })

    it('updates an existing entry', async () => {
      await store.saveRegistry(VAULT_ID, {
        entries: [{ key: 'priority', type: 'text' }],
      })

      const result = await store.upsertEntry(VAULT_ID, { key: 'priority', type: 'number' })
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]!.type).toBe('number')
    })

    it('throws PropertyTypeReservedKeyError when changing tags type', async () => {
      await expect(
        store.upsertEntry(VAULT_ID, { key: 'tags', type: 'list' }),
      ).rejects.toThrow(PropertyTypeReservedKeyError)
    })

    it('allows upserting tags with the correct type', async () => {
      await store.saveRegistry(VAULT_ID, { entries: [] })
      const result = await store.upsertEntry(VAULT_ID, { key: 'tags', type: 'tags' })
      expect(result.entries[0]!.type).toBe('tags')
    })

    it('throws PropertyTypeMaxEntriesError when registry is full', async () => {
      const entries: PropertyTypeEntry[] = Array.from({ length: 200 }, (_, i) => ({
        key: `full-${i}`,
        type: 'text' as const,
      }))
      await store.saveRegistry(VAULT_ID, { entries })

      await expect(
        store.upsertEntry(VAULT_ID, { key: 'one-more', type: 'text' }),
      ).rejects.toThrow(PropertyTypeMaxEntriesError)
    })

    it('updating an existing entry when at max does not throw', async () => {
      const entries: PropertyTypeEntry[] = Array.from({ length: 200 }, (_, i) => ({
        key: `update-${i}`,
        type: 'text' as const,
      }))
      await store.saveRegistry(VAULT_ID, { entries })

      // Updating an existing entry should succeed (not adding a new one)
      const result = await store.upsertEntry(VAULT_ID, { key: 'update-0', type: 'number' })
      expect(result.entries).toHaveLength(200)
      expect(result.entries[0]!.type).toBe('number')
    })
  })
})

describe('PropertyTypeStore with .obsidian/types.json', () => {
  let dir: string
  let obsidianStore: PropertyTypeStore
  const ID = 'vault-obsidian'

  const typesFile = () => path.join(dir, '.obsidian', 'types.json')
  const optionsFile = () => path.join(dir, '.slatebase', 'property-types.json')
  const writeTypes = async (content: unknown) => {
    await fs.mkdir(path.dirname(typesFile()), { recursive: true })
    await fs.writeFile(typesFile(), JSON.stringify(content))
  }
  const readTypes = async () => JSON.parse(await fs.readFile(typesFile(), 'utf-8')) as Record<string, unknown>

  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `property-type-obsidian-${crypto.randomBytes(8).toString('hex')}`)
    await fs.mkdir(dir, { recursive: true })
    obsidianStore = new PropertyTypeStore((id) => (id === ID ? dir : null), createMockLogger())
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('reads the types of an Obsidian-written file, multitext as list', async () => {
    await writeTypes({
      types: {
        created: 'date',
        Liste: 'multitext',
        'zuletzt Kontakt': 'date',
        aliases: 'aliases',
        tags: 'tags',
        TQ_explain: 'checkbox',
        TQ_extra_instructions: 'text',
        Anzahl: 'number',
        Zeit: 'datetime',
      },
    })

    const registry = await obsidianStore.getRegistry(ID)

    expect(registry.entries).toEqual([
      { key: 'created', type: 'date' },
      { key: 'Liste', type: 'list' },
      { key: 'zuletzt Kontakt', type: 'date' },
      { key: 'aliases', type: 'aliases' },
      { key: 'tags', type: 'tags' },
      { key: 'TQ_explain', type: 'checkbox' },
      { key: 'TQ_extra_instructions', type: 'text' },
      { key: 'Anzahl', type: 'number' },
      { key: 'Zeit', type: 'datetime' },
    ])
  })

  it('skips a type this app does not know but keeps it in the file', async () => {
    await writeTypes({ types: { status: 'text', Zukunft: 'hologram' } })

    expect((await obsidianStore.getRegistry(ID)).entries).toEqual([{ key: 'status', type: 'text' }])

    await obsidianStore.upsertEntry(ID, { key: 'neu', type: 'list' })
    expect((await readTypes()).types).toEqual({ status: 'text', Zukunft: 'hologram', neu: 'multitext' })

    await obsidianStore.saveRegistry(ID, { entries: [{ key: 'neu', type: 'list' }] })
    expect((await readTypes()).types).toEqual({ Zukunft: 'hologram', neu: 'multitext' })
  })

  it('writes list as multitext and keeps other fields of the file', async () => {
    await writeTypes({ types: { created: 'date' }, other: { keep: true } })

    await obsidianStore.upsertEntry(ID, { key: 'Liste', type: 'list' })

    expect(await readTypes()).toEqual({ types: { created: 'date', Liste: 'multitext' }, other: { keep: true } })
  })

  it('keeps options in .slatebase and merges them back by key', async () => {
    await obsidianStore.upsertEntry(ID, { key: 'status', type: 'text', options: { allowedValues: ['a', 'b'] } })

    expect((await readTypes()).types).toEqual({ status: 'text' })
    const registry = await obsidianStore.getRegistry(ID)
    expect(registry.entries).toEqual([{ key: 'status', type: 'text', options: { allowedValues: ['a', 'b'] } }])
  })

  it('a type changed in Obsidian wins over a leftover type in the options file', async () => {
    await obsidianStore.upsertEntry(ID, { key: 'status', type: 'text', options: { allowedValues: ['a'] } })
    await writeTypes({ types: { status: 'number' } })

    expect((await obsidianStore.getRegistry(ID)).entries[0]).toMatchObject({ key: 'status', type: 'number' })
  })

  it('refuses to overwrite a types.json that is not a JSON object and reads it as empty', async () => {
    await fs.mkdir(path.dirname(typesFile()), { recursive: true })
    await fs.writeFile(typesFile(), '<<<<<<< merge conflict')

    expect((await obsidianStore.getRegistry(ID)).entries).toEqual([])
    await expect(obsidianStore.upsertEntry(ID, { key: 'x', type: 'text' })).rejects.toThrow()
    expect(await fs.readFile(typesFile(), 'utf-8')).toBe('<<<<<<< merge conflict')
  })

  it('treats keys named like Object.prototype members as ordinary keys', async () => {
    await obsidianStore.upsertEntry(ID, { key: 'toString', type: 'text' })
    await obsidianStore.upsertEntry(ID, { key: 'valueOf', type: 'number' })

    expect((await readTypes()).types).toEqual({ toString: 'text', valueOf: 'number' })
    expect((await obsidianStore.getRegistry(ID)).entries).toEqual([
      { key: 'toString', type: 'text' },
      { key: 'valueOf', type: 'number' },
    ])
  })

  it('migrates a legacy entry named toString', async () => {
    await fs.mkdir(path.dirname(optionsFile()), { recursive: true })
    await fs.writeFile(optionsFile(), JSON.stringify({ entries: [{ key: 'toString', type: 'date' }] }))

    expect(await obsidianStore.migrateLegacyTypes(ID)).toBe(true)
    expect((await readTypes()).types).toEqual({ toString: 'date' })
  })

  it('rejects prototype keys', async () => {
    await expect(obsidianStore.upsertEntry(ID, { key: '__proto__', type: 'text' })).rejects.toThrow('Invalid property key')
  })

  describe('migrateLegacyTypes', () => {
    const writeLegacy = async (content: unknown) => {
      await fs.mkdir(path.dirname(optionsFile()), { recursive: true })
      await fs.writeFile(optionsFile(), JSON.stringify(content))
    }

    it('moves old registry types into types.json without overriding existing ones, once', async () => {
      await writeTypes({ types: { priority: 'number' } })
      await writeLegacy({
        entries: [
          { key: 'priority', type: 'text' },
          { key: 'status', type: 'text', options: { allowedValues: ['x'] } },
          { key: 'Liste', type: 'list' },
        ],
      })

      expect(await obsidianStore.migrateLegacyTypes(ID)).toBe(true)

      expect((await readTypes()).types).toEqual({ priority: 'number', status: 'text', Liste: 'multitext' })
      expect((await obsidianStore.getRegistry(ID)).entries).toContainEqual({ key: 'status', type: 'text', options: { allowedValues: ['x'] } })

      // A type deleted in Obsidian afterwards must not come back on the next start.
      await writeTypes({ types: { priority: 'number' } })
      expect(await obsidianStore.migrateLegacyTypes(ID)).toBe(false)
      expect((await readTypes()).types).toEqual({ priority: 'number' })
    })

    it('does nothing for a vault without an old registry', async () => {
      expect(await obsidianStore.migrateLegacyTypes(ID)).toBe(false)
      await expect(fs.access(typesFile())).rejects.toThrow()
    })

    it('leaves the old registry untouched when types.json is invalid, so the next start retries', async () => {
      await fs.mkdir(path.dirname(typesFile()), { recursive: true })
      await fs.writeFile(typesFile(), 'nope')
      await writeLegacy({ entries: [{ key: 'status', type: 'text' }] })

      await expect(obsidianStore.migrateLegacyTypes(ID)).rejects.toThrow()
      expect(JSON.parse(await fs.readFile(optionsFile(), 'utf-8')).typesInObsidianFile).toBeUndefined()
    })
  })
})
