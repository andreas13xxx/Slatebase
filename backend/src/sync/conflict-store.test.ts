import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ConflictStore } from './conflict-store.js'
import type { ConflictEntry } from './types.js'
import type { ILogger } from '../logger/index.js'

// --- Mock Logger ---

function createMockLogger(): ILogger & { warnings: string[]; errors: string[] } {
  const warnings: string[] = []
  const errors: string[] = []
  return {
    warnings,
    errors,
    debug() {},
    info() {},
    warn(msg: string) { warnings.push(msg) },
    error(msg: string) { errors.push(msg) },
  }
}

// --- Test Helpers ---

function makeConflict(overrides?: Partial<ConflictEntry>): ConflictEntry {
  return {
    documentPath: 'notes/hello.md',
    local: {
      modifiedAt: '2025-01-15T10:00:00.000Z',
      size: 1024,
    },
    remote: {
      revision: '3-abc123',
      modifiedAt: '2025-01-15T11:00:00.000Z',
      size: 2048,
    },
    detectedAt: '2025-01-15T12:00:00.000Z',
    ...overrides,
  }
}

// --- Tests ---

describe('ConflictStore', () => {
  let tmpDir: string
  let store: ConflictStore
  let logger: ReturnType<typeof createMockLogger>
  const vaultId = 'abc123def456'

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conflict-store-test-'))
    logger = createMockLogger()
    store = new ConflictStore(tmpDir, logger)
  })

  afterAll(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  describe('getAll', () => {
    it('should return empty array when no conflicts file exists', async () => {
      const result = await store.getAll(vaultId)
      expect(result).toEqual([])
    })

    it('should return empty array when conflicts file is corrupt', async () => {
      const dir = path.join(tmpDir, 'sync', vaultId)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'conflicts.json'), '{invalid json', 'utf-8')

      const result = await store.getAll(vaultId)
      expect(result).toEqual([])
      expect(logger.errors.length).toBe(1)
      expect(logger.errors[0]).toContain('Failed to read conflicts file')
    })

    it('should return empty array when conflicts file is not an array', async () => {
      const dir = path.join(tmpDir, 'sync', vaultId)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'conflicts.json'), JSON.stringify({ not: 'array' }), 'utf-8')

      const result = await store.getAll(vaultId)
      expect(result).toEqual([])
      expect(logger.warnings.length).toBe(1)
      expect(logger.warnings[0]).toContain('not an array')
    })

    it('should return stored conflicts', async () => {
      const conflict = makeConflict()
      await store.add(vaultId, conflict)

      const result = await store.getAll(vaultId)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(conflict)
    })
  })

  describe('add', () => {
    it('should create the sync directory and conflicts file', async () => {
      const conflict = makeConflict()
      await store.add(vaultId, conflict)

      const filePath = path.join(tmpDir, 'sync', vaultId, 'conflicts.json')
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('should persist conflict to disk as JSON', async () => {
      const conflict = makeConflict()
      await store.add(vaultId, conflict)

      const filePath = path.join(tmpDir, 'sync', vaultId, 'conflicts.json')
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed).toEqual([conflict])
    })

    it('should append multiple conflicts', async () => {
      const conflict1 = makeConflict({ documentPath: 'file1.md' })
      const conflict2 = makeConflict({ documentPath: 'file2.md' })

      await store.add(vaultId, conflict1)
      await store.add(vaultId, conflict2)

      const result = await store.getAll(vaultId)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual(conflict1)
      expect(result[1]).toEqual(conflict2)
    })

    it('should replace existing conflict for the same documentPath', async () => {
      const conflict1 = makeConflict({ documentPath: 'notes/same.md', detectedAt: '2025-01-15T10:00:00.000Z' })
      const conflict2 = makeConflict({ documentPath: 'notes/same.md', detectedAt: '2025-01-15T12:00:00.000Z' })

      await store.add(vaultId, conflict1)
      await store.add(vaultId, conflict2)

      const result = await store.getAll(vaultId)
      expect(result).toHaveLength(1)
      expect(result[0]!.detectedAt).toBe('2025-01-15T12:00:00.000Z')
    })

    it('should use atomic writes (no temp files left behind)', async () => {
      const conflict = makeConflict()
      await store.add(vaultId, conflict)

      const dir = path.join(tmpDir, 'sync', vaultId)
      const files = await fs.readdir(dir)
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)
    })
  })

  describe('remove', () => {
    it('should remove a conflict by documentPath', async () => {
      const conflict1 = makeConflict({ documentPath: 'file1.md' })
      const conflict2 = makeConflict({ documentPath: 'file2.md' })

      await store.add(vaultId, conflict1)
      await store.add(vaultId, conflict2)
      await store.remove(vaultId, 'file1.md')

      const result = await store.getAll(vaultId)
      expect(result).toHaveLength(1)
      expect(result[0]!.documentPath).toBe('file2.md')
    })

    it('should handle removing non-existent conflict gracefully', async () => {
      const conflict = makeConflict({ documentPath: 'existing.md' })
      await store.add(vaultId, conflict)

      await store.remove(vaultId, 'nonexistent.md')

      const result = await store.getAll(vaultId)
      expect(result).toHaveLength(1)
    })

    it('should handle removing from empty store gracefully', async () => {
      await store.remove(vaultId, 'anything.md')

      const result = await store.getAll(vaultId)
      expect(result).toEqual([])
    })
  })

  describe('exists', () => {
    it('should return false when no conflicts exist', async () => {
      const result = await store.exists(vaultId, 'notes/hello.md')
      expect(result).toBe(false)
    })

    it('should return true when conflict exists for the path', async () => {
      const conflict = makeConflict({ documentPath: 'notes/hello.md' })
      await store.add(vaultId, conflict)

      const result = await store.exists(vaultId, 'notes/hello.md')
      expect(result).toBe(true)
    })

    it('should return false for a different path', async () => {
      const conflict = makeConflict({ documentPath: 'notes/hello.md' })
      await store.add(vaultId, conflict)

      const result = await store.exists(vaultId, 'notes/other.md')
      expect(result).toBe(false)
    })
  })

  describe('persistence round-trip', () => {
    it('should survive reload from disk with a new store instance', async () => {
      const conflict1 = makeConflict({ documentPath: 'file1.md' })
      const conflict2 = makeConflict({ documentPath: 'folder/file2.md' })

      await store.add(vaultId, conflict1)
      await store.add(vaultId, conflict2)

      // Create a new store instance pointing to the same directory
      const store2 = new ConflictStore(tmpDir, logger)
      const result = await store2.getAll(vaultId)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual(conflict1)
      expect(result[1]).toEqual(conflict2)
    })
  })

  describe('vault isolation', () => {
    it('should store conflicts separately per vault', async () => {
      const vault1 = 'vault1vault1'
      const vault2 = 'vault2vault2'
      const conflict1 = makeConflict({ documentPath: 'shared-name.md', detectedAt: '2025-01-01T00:00:00.000Z' })
      const conflict2 = makeConflict({ documentPath: 'shared-name.md', detectedAt: '2025-02-01T00:00:00.000Z' })

      await store.add(vault1, conflict1)
      await store.add(vault2, conflict2)

      const result1 = await store.getAll(vault1)
      const result2 = await store.getAll(vault2)
      expect(result1).toHaveLength(1)
      expect(result1[0]!.detectedAt).toBe('2025-01-01T00:00:00.000Z')
      expect(result2).toHaveLength(1)
      expect(result2[0]!.detectedAt).toBe('2025-02-01T00:00:00.000Z')
    })
  })
})
