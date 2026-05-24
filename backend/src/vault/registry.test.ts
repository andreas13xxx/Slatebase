import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { VaultRegistry, VaultShareRegistry } from './registry.js'
import type { VaultRegistryEntry, VaultShareEntry } from './registry.js'

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


describe('VaultShareRegistry', () => {
  let tempDir: string
  let shareRegistry: VaultShareRegistry

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-share-registry-test-'))
    shareRegistry = new VaultShareRegistry(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  function makeShare(overrides: Partial<VaultShareEntry> = {}): VaultShareEntry {
    return {
      vaultId: 'vault-abc123',
      userId: 'user-def456',
      permission: 'read',
      grantedBy: 'owner-ghi789',
      grantedAt: '2025-01-15T10:30:00.000Z',
      ...overrides,
    }
  }

  describe('getSharesForVault()', () => {
    it('returns empty array when no shares exist', async () => {
      const shares = await shareRegistry.getSharesForVault('vault-abc123')
      expect(shares).toEqual([])
    })

    it('returns only shares for the specified vault', async () => {
      const share1 = makeShare({ vaultId: 'vault-1', userId: 'user-a' })
      const share2 = makeShare({ vaultId: 'vault-1', userId: 'user-b' })
      const share3 = makeShare({ vaultId: 'vault-2', userId: 'user-a' })

      await shareRegistry.addShare(share1)
      await shareRegistry.addShare(share2)
      await shareRegistry.addShare(share3)

      const shares = await shareRegistry.getSharesForVault('vault-1')
      expect(shares).toHaveLength(2)
      expect(shares).toEqual([share1, share2])
    })
  })

  describe('getSharesForUser()', () => {
    it('returns empty array when no shares exist for user', async () => {
      const shares = await shareRegistry.getSharesForUser('user-nonexistent')
      expect(shares).toEqual([])
    })

    it('returns only shares for the specified user', async () => {
      const share1 = makeShare({ vaultId: 'vault-1', userId: 'user-a' })
      const share2 = makeShare({ vaultId: 'vault-2', userId: 'user-a' })
      const share3 = makeShare({ vaultId: 'vault-1', userId: 'user-b' })

      await shareRegistry.addShare(share1)
      await shareRegistry.addShare(share2)
      await shareRegistry.addShare(share3)

      const shares = await shareRegistry.getSharesForUser('user-a')
      expect(shares).toHaveLength(2)
      expect(shares).toEqual([share1, share2])
    })
  })

  describe('addShare()', () => {
    it('adds a share and persists to disk', async () => {
      const share = makeShare()
      await shareRegistry.addShare(share)

      const raw = await fs.readFile(path.join(tempDir, 'shares.json'), 'utf-8')
      const data = JSON.parse(raw)
      expect(data).toEqual([share])
    })

    it('appends to existing shares', async () => {
      const share1 = makeShare({ userId: 'user-a' })
      const share2 = makeShare({ userId: 'user-b' })

      await shareRegistry.addShare(share1)
      await shareRegistry.addShare(share2)

      const raw = await fs.readFile(path.join(tempDir, 'shares.json'), 'utf-8')
      const data = JSON.parse(raw)
      expect(data).toHaveLength(2)
    })

    it('creates data directory if it does not exist', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'data')
      const nestedRegistry = new VaultShareRegistry(nestedDir)

      await nestedRegistry.addShare(makeShare())

      const stat = await fs.stat(nestedDir)
      expect(stat.isDirectory()).toBe(true)
    })
  })

  describe('removeShare()', () => {
    it('removes a specific share by vaultId and userId', async () => {
      const share1 = makeShare({ vaultId: 'vault-1', userId: 'user-a' })
      const share2 = makeShare({ vaultId: 'vault-1', userId: 'user-b' })

      await shareRegistry.addShare(share1)
      await shareRegistry.addShare(share2)
      await shareRegistry.removeShare('vault-1', 'user-a')

      const shares = await shareRegistry.getSharesForVault('vault-1')
      expect(shares).toHaveLength(1)
      expect(shares[0]).toEqual(share2)
    })

    it('does nothing if share does not exist', async () => {
      const share = makeShare()
      await shareRegistry.addShare(share)
      await shareRegistry.removeShare('vault-nonexistent', 'user-nonexistent')

      const shares = await shareRegistry.getSharesForVault(share.vaultId)
      expect(shares).toHaveLength(1)
    })
  })

  describe('removeAllSharesForVault()', () => {
    it('removes all shares for a vault', async () => {
      const share1 = makeShare({ vaultId: 'vault-1', userId: 'user-a' })
      const share2 = makeShare({ vaultId: 'vault-1', userId: 'user-b' })
      const share3 = makeShare({ vaultId: 'vault-2', userId: 'user-a' })

      await shareRegistry.addShare(share1)
      await shareRegistry.addShare(share2)
      await shareRegistry.addShare(share3)
      await shareRegistry.removeAllSharesForVault('vault-1')

      const vault1Shares = await shareRegistry.getSharesForVault('vault-1')
      expect(vault1Shares).toHaveLength(0)

      const vault2Shares = await shareRegistry.getSharesForVault('vault-2')
      expect(vault2Shares).toHaveLength(1)
    })

    it('does nothing if vault has no shares', async () => {
      await shareRegistry.removeAllSharesForVault('vault-nonexistent')
      // Should not throw
    })
  })

  describe('updatePermission()', () => {
    it('updates permission from read to write', async () => {
      const share = makeShare({ permission: 'read' })
      await shareRegistry.addShare(share)
      await shareRegistry.updatePermission(share.vaultId, share.userId, 'write')

      const shares = await shareRegistry.getSharesForVault(share.vaultId)
      expect(shares[0]!.permission).toBe('write')
    })

    it('updates permission from write to read', async () => {
      const share = makeShare({ permission: 'write' })
      await shareRegistry.addShare(share)
      await shareRegistry.updatePermission(share.vaultId, share.userId, 'read')

      const shares = await shareRegistry.getSharesForVault(share.vaultId)
      expect(shares[0]!.permission).toBe('read')
    })

    it('does nothing if share does not exist', async () => {
      await shareRegistry.updatePermission('vault-nonexistent', 'user-nonexistent', 'write')
      // Should not throw
    })

    it('persists the updated permission to disk', async () => {
      const share = makeShare({ permission: 'read' })
      await shareRegistry.addShare(share)
      await shareRegistry.updatePermission(share.vaultId, share.userId, 'write')

      // Read directly from disk with a fresh instance
      const freshRegistry = new VaultShareRegistry(tempDir)
      const shares = await freshRegistry.getSharesForVault(share.vaultId)
      expect(shares[0]!.permission).toBe('write')
    })
  })

  describe('atomic writes', () => {
    it('leaves no temp files after save', async () => {
      await shareRegistry.addShare(makeShare())

      const files = await fs.readdir(tempDir)
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)
    })
  })
})
