// Unit tests for PropertyTypeStore

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
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
