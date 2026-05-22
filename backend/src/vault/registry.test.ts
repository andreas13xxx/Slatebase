import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { VaultRegistry } from './registry.js'
import type { VaultRegistryEntry } from './registry.js'

// Minimal logger for tests
const testLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

describe('VaultRegistry', () => {
  let tempDir: string
  let registry: VaultRegistry

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-registry-test-'))
    registry = new VaultRegistry(tempDir, testLogger)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  function makeEntry(overrides: Partial<VaultRegistryEntry> = {}): VaultRegistryEntry {
    return {
      id: 'a1b2c3d4e5f6',
      name: 'Test Vault',
      storagePath: path.join(tempDir, 'vaults', 'a1b2c3d4e5f6'),
      createdAt: '2025-01-15T10:30:00.000Z',
      ...overrides,
    }
  }

  describe('load()', () => {
    it('returns empty array when registry file does not exist', async () => {
      const entries = await registry.load()
      expect(entries).toEqual([])
    })

    it('creates dataDir and vaults/ directories on first access', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'data')
      const nestedRegistry = new VaultRegistry(nestedDir, testLogger)

      await nestedRegistry.load()

      const dataDirStat = await fs.stat(nestedDir)
      expect(dataDirStat.isDirectory()).toBe(true)

      const vaultsDirStat = await fs.stat(path.join(nestedDir, 'vaults'))
      expect(vaultsDirStat.isDirectory()).toBe(true)
    })

    it('reads and parses existing registry file', async () => {
      const entry = makeEntry()
      const registryData = { version: 1, vaults: [entry] }
      await fs.mkdir(tempDir, { recursive: true })
      await fs.writeFile(
        path.join(tempDir, 'vaults.json'),
        JSON.stringify(registryData),
        'utf-8',
      )

      const entries = await registry.load()
      expect(entries).toEqual([entry])
    })

    it('throws on corrupt JSON', async () => {
      await fs.mkdir(tempDir, { recursive: true })
      await fs.writeFile(path.join(tempDir, 'vaults.json'), 'not valid json', 'utf-8')

      await expect(registry.load()).rejects.toThrow()
    })
  })

  describe('save()', () => {
    it('writes entries to disk in correct format', async () => {
      const entry = makeEntry()
      await registry.save([entry])

      const raw = await fs.readFile(path.join(tempDir, 'vaults.json'), 'utf-8')
      const data = JSON.parse(raw)
      expect(data.version).toBe(1)
      expect(data.vaults).toEqual([entry])
    })

    it('overwrites existing registry file', async () => {
      const entry1 = makeEntry({ id: 'aaa111bbb222', name: 'First' })
      const entry2 = makeEntry({ id: 'ccc333ddd444', name: 'Second' })

      await registry.save([entry1])
      await registry.save([entry2])

      const raw = await fs.readFile(path.join(tempDir, 'vaults.json'), 'utf-8')
      const data = JSON.parse(raw)
      expect(data.vaults).toEqual([entry2])
    })

    it('writes atomically (temp file then rename)', async () => {
      // After save, there should be no .tmp files left
      const entry = makeEntry()
      await registry.save([entry])

      const files = await fs.readdir(tempDir)
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)
    })
  })

  describe('addEntry()', () => {
    it('adds entry and persists to disk', async () => {
      const entry = makeEntry()
      await registry.addEntry(entry)

      // Verify in-memory
      expect(registry.findById(entry.id)).toEqual(entry)

      // Verify on disk
      const raw = await fs.readFile(path.join(tempDir, 'vaults.json'), 'utf-8')
      const data = JSON.parse(raw)
      expect(data.vaults).toEqual([entry])
    })

    it('appends to existing entries', async () => {
      const entry1 = makeEntry({ id: 'aaa111bbb222', name: 'First' })
      const entry2 = makeEntry({ id: 'ccc333ddd444', name: 'Second' })

      await registry.addEntry(entry1)
      await registry.addEntry(entry2)

      const entries = await registry.load()
      expect(entries).toHaveLength(2)
      expect(entries[0]).toEqual(entry1)
      expect(entries[1]).toEqual(entry2)
    })
  })

  describe('removeEntry()', () => {
    it('removes entry by ID and persists', async () => {
      const entry1 = makeEntry({ id: 'aaa111bbb222', name: 'First' })
      const entry2 = makeEntry({ id: 'ccc333ddd444', name: 'Second' })

      await registry.save([entry1, entry2])
      await registry.removeEntry('aaa111bbb222')

      const entries = await registry.load()
      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual(entry2)
    })

    it('does nothing if ID not found', async () => {
      const entry = makeEntry()
      await registry.save([entry])
      await registry.removeEntry('nonexistent1')

      const entries = await registry.load()
      expect(entries).toHaveLength(1)
    })
  })

  describe('findById()', () => {
    it('returns entry when found', async () => {
      const entry = makeEntry()
      await registry.addEntry(entry)

      expect(registry.findById(entry.id)).toEqual(entry)
    })

    it('returns null when not found', async () => {
      await registry.load()
      expect(registry.findById('nonexistent1')).toBeNull()
    })
  })

  describe('findByName()', () => {
    it('returns entry when found (case-sensitive)', async () => {
      const entry = makeEntry({ name: 'My Vault' })
      await registry.addEntry(entry)

      expect(registry.findByName('My Vault')).toEqual(entry)
    })

    it('returns null for different case', async () => {
      const entry = makeEntry({ name: 'My Vault' })
      await registry.addEntry(entry)

      expect(registry.findByName('my vault')).toBeNull()
    })

    it('returns null when not found', async () => {
      await registry.load()
      expect(registry.findByName('Nonexistent')).toBeNull()
    })
  })
})
