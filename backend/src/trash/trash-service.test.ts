// TrashService — Unit tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { TrashService } from './trash-service.js'
import { TrashNotFoundError } from './errors.js'
import type { ILogger } from '../logger/index.js'
import type { TrashIndex } from './types.js'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

describe('TrashService', () => {
  let tmpDir: string
  let vaultDir: string
  let service: TrashService
  let logger: ILogger

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trash-test-'))
    vaultDir = path.join(tmpDir, 'vault')
    await fs.mkdir(vaultDir, { recursive: true })

    logger = createMockLogger()
    service = new TrashService(() => vaultDir, logger)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── Helper to create a file in the vault ─────────────────────────────────

  async function createFile(relativePath: string, content = 'test content'): Promise<void> {
    const filePath = path.join(vaultDir, relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async function createDirectory(relativePath: string): Promise<void> {
    await fs.mkdir(path.join(vaultDir, relativePath), { recursive: true })
  }

  async function readIndex(): Promise<TrashIndex> {
    const indexPath = path.join(vaultDir, '.trash', '_index.json')
    const raw = await fs.readFile(indexPath, 'utf-8')
    return JSON.parse(raw)
  }

  async function fileExists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(path.join(vaultDir, relativePath))
      return true
    } catch {
      return false
    }
  }

  // ─── moveToTrash ────────────────────────────────────────────────────────────

  describe('moveToTrash', () => {
    it('moves a file to .trash/ and records entry in _index.json', async () => {
      await createFile('notes/hello.md', 'hello world')

      const entry = await service.moveToTrash('vault1', 'notes/hello.md')

      // File should no longer exist at original path
      expect(await fileExists('notes/hello.md')).toBe(false)

      // File should exist in .trash/<id>/hello.md
      const trashFilePath = path.join(vaultDir, '.trash', entry.id, 'hello.md')
      const content = await fs.readFile(trashFilePath, 'utf-8')
      expect(content).toBe('hello world')

      // Entry metadata should be correct
      expect(entry.id).toHaveLength(12)
      expect(entry.originalPath).toBe('notes/hello.md')
      expect(entry.isDirectory).toBe(false)
      expect(new Date(entry.deletedAt).getTime()).toBeLessThanOrEqual(Date.now())

      // _index.json should contain the entry
      const index = await readIndex()
      expect(index.entries).toHaveLength(1)
      expect(index.entries[0]!.id).toBe(entry.id)
    })

    it('moves a directory to .trash/', async () => {
      await createDirectory('docs/archive')
      await createFile('docs/archive/file1.md', 'content1')
      await createFile('docs/archive/file2.md', 'content2')

      const entry = await service.moveToTrash('vault1', 'docs/archive')

      expect(entry.isDirectory).toBe(true)
      expect(await fileExists('docs/archive')).toBe(false)

      // Directory contents should be preserved in trash
      const trashFile1 = path.join(vaultDir, '.trash', entry.id, 'archive', 'file1.md')
      expect(await fs.readFile(trashFile1, 'utf-8')).toBe('content1')
    })

    it('generates unique 12-char hex entry IDs', async () => {
      await createFile('file1.md')
      await createFile('file2.md')

      const entry1 = await service.moveToTrash('vault1', 'file1.md')
      const entry2 = await service.moveToTrash('vault1', 'file2.md')

      expect(entry1.id).toHaveLength(12)
      expect(entry2.id).toHaveLength(12)
      expect(entry1.id).not.toBe(entry2.id)
      expect(/^[0-9a-f]{12}$/.test(entry1.id)).toBe(true)
    })

    it('records deletedAt as valid ISO 8601 timestamp', async () => {
      await createFile('note.md')
      const before = Date.now()
      const entry = await service.moveToTrash('vault1', 'note.md')
      const after = Date.now()

      const deletedAt = new Date(entry.deletedAt).getTime()
      expect(deletedAt).toBeGreaterThanOrEqual(before)
      expect(deletedAt).toBeLessThanOrEqual(after)
    })
  })

  // ─── listTrash ──────────────────────────────────────────────────────────────

  describe('listTrash', () => {
    it('returns empty array when no trash entries exist', async () => {
      const entries = await service.listTrash('vault1')
      expect(entries).toEqual([])
    })

    it('returns entries sorted by deletedAt descending', async () => {
      await createFile('a.md')
      await createFile('b.md')
      await createFile('c.md')

      await service.moveToTrash('vault1', 'a.md')
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10))
      await service.moveToTrash('vault1', 'b.md')
      await new Promise((r) => setTimeout(r, 10))
      await service.moveToTrash('vault1', 'c.md')

      const entries = await service.listTrash('vault1')
      expect(entries).toHaveLength(3)
      // Most recently deleted first
      expect(entries[0]!.originalPath).toBe('c.md')
      expect(entries[1]!.originalPath).toBe('b.md')
      expect(entries[2]!.originalPath).toBe('a.md')
    })
  })

  // ─── restore ────────────────────────────────────────────────────────────────

  describe('restore', () => {
    it('restores a file to its original path', async () => {
      await createFile('notes/meeting.md', 'meeting notes')
      const entry = await service.moveToTrash('vault1', 'notes/meeting.md')

      const result = await service.restore('vault1', entry.id)

      expect(result.restoredPath).toBe('notes/meeting.md')
      expect(await fileExists('notes/meeting.md')).toBe(true)
      const content = await fs.readFile(path.join(vaultDir, 'notes/meeting.md'), 'utf-8')
      expect(content).toBe('meeting notes')
    })

    it('creates missing parent directories on restore', async () => {
      await createFile('deep/nested/dir/file.md', 'deep content')
      const entry = await service.moveToTrash('vault1', 'deep/nested/dir/file.md')

      // Remove the parent directories
      await fs.rm(path.join(vaultDir, 'deep'), { recursive: true, force: true })

      const result = await service.restore('vault1', entry.id)
      expect(result.restoredPath).toBe('deep/nested/dir/file.md')
      expect(await fileExists('deep/nested/dir/file.md')).toBe(true)
    })

    it('appends -restored suffix when original path is occupied', async () => {
      await createFile('note.md', 'original')
      const entry = await service.moveToTrash('vault1', 'note.md')

      // Create a new file at the same path
      await createFile('note.md', 'new file')

      const result = await service.restore('vault1', entry.id)
      expect(result.restoredPath).toBe('note-restored.md')
      expect(await fileExists('note-restored.md')).toBe(true)
    })

    it('appends -restored-2, -restored-3 etc. when multiple suffixes are needed', async () => {
      await createFile('note.md', 'v1')
      const entry = await service.moveToTrash('vault1', 'note.md')

      // Occupy original path and -restored suffix
      await createFile('note.md', 'new')
      await createFile('note-restored.md', 'restored1')

      const result = await service.restore('vault1', entry.id)
      expect(result.restoredPath).toBe('note-restored-2.md')
    })

    it('removes the entry from _index.json after restore', async () => {
      await createFile('file.md')
      const entry = await service.moveToTrash('vault1', 'file.md')

      await service.restore('vault1', entry.id)

      const index = await readIndex()
      expect(index.entries).toHaveLength(0)
    })

    it('throws TrashNotFoundError when entry does not exist', async () => {
      await expect(service.restore('vault1', 'nonexistent')).rejects.toThrow(TrashNotFoundError)
    })
  })

  // ─── deletePermanently ──────────────────────────────────────────────────────

  describe('deletePermanently', () => {
    it('removes the entry directory and index entry', async () => {
      await createFile('delete-me.md', 'content')
      const entry = await service.moveToTrash('vault1', 'delete-me.md')

      await service.deletePermanently('vault1', entry.id)

      // Entry directory should not exist
      const entryDir = path.join(vaultDir, '.trash', entry.id)
      expect(await fileExists(path.relative(vaultDir, entryDir))).toBe(false)

      // Index should be empty
      const index = await readIndex()
      expect(index.entries).toHaveLength(0)
    })

    it('throws TrashNotFoundError when entry does not exist', async () => {
      await expect(service.deletePermanently('vault1', 'nonexistent')).rejects.toThrow(TrashNotFoundError)
    })
  })

  // ─── purgeExpired ───────────────────────────────────────────────────────────

  describe('purgeExpired', () => {
    it('returns 0 when no entries exist', async () => {
      const purged = await service.purgeExpired('vault1', 30)
      expect(purged).toBe(0)
    })

    it('removes entries older than retentionDays', async () => {
      await createFile('old.md')
      await service.moveToTrash('vault1', 'old.md')

      // Manually backdate the entry in the index
      const indexPath = path.join(vaultDir, '.trash', '_index.json')
      const index: TrashIndex = JSON.parse(await fs.readFile(indexPath, 'utf-8'))
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      index.entries[0]!.deletedAt = oldDate
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')

      const purged = await service.purgeExpired('vault1', 30)
      expect(purged).toBe(1)

      const updatedIndex = await readIndex()
      expect(updatedIndex.entries).toHaveLength(0)
    })

    it('leaves entries newer than retentionDays untouched', async () => {
      await createFile('recent.md')
      await service.moveToTrash('vault1', 'recent.md')

      const purged = await service.purgeExpired('vault1', 30)
      expect(purged).toBe(0)

      const index = await readIndex()
      expect(index.entries).toHaveLength(1)
    })

    it('purges only expired entries in a mixed set', async () => {
      await createFile('old.md')
      await createFile('recent.md')

      await service.moveToTrash('vault1', 'old.md')
      await service.moveToTrash('vault1', 'recent.md')

      // Backdate only the first entry
      const indexPath = path.join(vaultDir, '.trash', '_index.json')
      const index: TrashIndex = JSON.parse(await fs.readFile(indexPath, 'utf-8'))
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      index.entries[0]!.deletedAt = oldDate
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')

      const purged = await service.purgeExpired('vault1', 30)
      expect(purged).toBe(1)

      const updatedIndex = await readIndex()
      expect(updatedIndex.entries).toHaveLength(1)
      expect(updatedIndex.entries[0]!.originalPath).toBe('recent.md')
    })
  })

  // ─── deleteImmediately ──────────────────────────────────────────────────────

  describe('deleteImmediately', () => {
    it('permanently removes a file without moving to trash', async () => {
      await createFile('ephemeral.md', 'temp content')

      await service.deleteImmediately('vault1', 'ephemeral.md')

      expect(await fileExists('ephemeral.md')).toBe(false)
      // No trash entry should exist
      const entries = await service.listTrash('vault1')
      expect(entries).toHaveLength(0)
    })

    it('permanently removes a directory recursively', async () => {
      await createDirectory('folder')
      await createFile('folder/a.md')
      await createFile('folder/b.md')

      await service.deleteImmediately('vault1', 'folder')

      expect(await fileExists('folder')).toBe(false)
    })
  })

  // ─── Atomic Index Updates ───────────────────────────────────────────────────

  describe('atomic index updates', () => {
    it('_index.json is well-formed after multiple operations', async () => {
      await createFile('a.md')
      await createFile('b.md')
      await createFile('c.md')

      const e1 = await service.moveToTrash('vault1', 'a.md')
      const e2 = await service.moveToTrash('vault1', 'b.md')
      await service.moveToTrash('vault1', 'c.md')

      // Delete one permanently, restore one
      await service.deletePermanently('vault1', e1.id)
      await service.restore('vault1', e2.id)

      const index = await readIndex()
      expect(index.entries).toHaveLength(1)
      expect(index.entries[0]!.originalPath).toBe('c.md')
    })
  })
})
