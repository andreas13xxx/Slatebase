import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { SyncLogStore } from './sync-log-store.js'
import type { ILogger } from '../logger/index.js'
import type { SyncLogEntry } from './types.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockLogger(): ILogger & {
  warnings: Array<{ message: string; meta: object | undefined }>
  errors: Array<{ message: string; meta: object | undefined }>
} {
  const warnings: Array<{ message: string; meta: object | undefined }> = []
  const errors: Array<{ message: string; meta: object | undefined }> = []
  return {
    warnings,
    errors,
    debug() {},
    info() {},
    warn(message: string, meta?: object) {
      warnings.push({ message, meta })
    },
    error(message: string, meta?: object) {
      errors.push({ message, meta })
    },
  }
}

function createLogEntry(overrides: Partial<SyncLogEntry> = {}): SyncLogEntry {
  return {
    id: crypto.randomBytes(12).toString('hex'),
    timestamp: new Date().toISOString(),
    triggerType: 'manual',
    mode: 'bidirectional',
    status: 'started',
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SyncLogStore', () => {
  let tempDir: string
  let logger: ReturnType<typeof createMockLogger>
  let store: SyncLogStore
  const vaultId = 'aabbccddee11'

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `slatebase-synclog-test-${crypto.randomBytes(8).toString('hex')}`)
    await mkdir(tempDir, { recursive: true })
    logger = createMockLogger()
    store = new SyncLogStore(tempDir, logger)
  })

  afterAll(async () => {
    // Best-effort cleanup of temp directories
    try {
      const entries = await import('node:fs/promises').then(fs => fs.readdir(os.tmpdir()))
      for (const entry of entries) {
        if (entry.startsWith('slatebase-synclog-test-')) {
          await rm(path.join(os.tmpdir(), entry), { recursive: true, force: true }).catch(() => {})
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('append()', () => {
    it('should create a new JSONL file for the first entry', async () => {
      const entry = createLogEntry()
      await store.append(vaultId, entry)

      const filePath = path.join(tempDir, 'sync', vaultId, 'sync-log.jsonl')
      const content = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(content.trim()) as SyncLogEntry

      expect(parsed.id).toBe(entry.id)
      expect(parsed.status).toBe('started')
    })

    it('should append multiple entries to the same file', async () => {
      const entry1 = createLogEntry({ status: 'started', timestamp: '2025-01-15T10:00:00.000Z' })
      const entry2 = createLogEntry({ status: 'success', timestamp: '2025-01-15T10:01:00.000Z' })

      await store.append(vaultId, entry1)
      await store.append(vaultId, entry2)

      const filePath = path.join(tempDir, 'sync', vaultId, 'sync-log.jsonl')
      const content = await readFile(filePath, 'utf-8')
      const lines = content.trim().split('\n')

      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]!)).toMatchObject({ status: 'started' })
      expect(JSON.parse(lines[1]!)).toMatchObject({ status: 'success' })
    })

    it('should auto-create the sync directory for the vault', async () => {
      const entry = createLogEntry()
      await store.append(vaultId, entry)

      const filePath = path.join(tempDir, 'sync', vaultId, 'sync-log.jsonl')
      const content = await readFile(filePath, 'utf-8')
      expect(content.trim()).not.toBe('')
    })

    it('should rotate entries when exceeding 1000', async () => {
      // Write 1000 entries directly to the file
      const dir = path.join(tempDir, 'sync', vaultId)
      await mkdir(dir, { recursive: true })
      const filePath = path.join(dir, 'sync-log.jsonl')

      const entries: string[] = []
      for (let i = 0; i < 1000; i++) {
        const entry = createLogEntry({
          id: `entry-${String(i).padStart(4, '0')}`,
          timestamp: `2025-01-15T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
        })
        entries.push(JSON.stringify(entry))
      }
      await writeFile(filePath, entries.join('\n') + '\n', 'utf-8')

      // Re-create store to clear directory cache
      store = new SyncLogStore(tempDir, logger)

      // Append one more entry (should trigger rotation)
      const newEntry = createLogEntry({
        id: 'entry-new',
        timestamp: '2025-01-15T23:59:00.000Z',
      })
      await store.append(vaultId, newEntry)

      // Read back and verify count is exactly 1000
      const content = await readFile(filePath, 'utf-8')
      const lines = content.trim().split('\n').filter(l => l.trim() !== '')
      expect(lines).toHaveLength(1000)

      // The newest entry should be present
      const lastLine = JSON.parse(lines[lines.length - 1]!) as SyncLogEntry
      expect(lastLine.id).toBe('entry-new')

      // The oldest entry (entry-0000) should have been removed
      const firstLine = JSON.parse(lines[0]!) as SyncLogEntry
      expect(firstLine.id).not.toBe('entry-0000')
    })
  })

  describe('read()', () => {
    it('should return empty paginated response if no file exists', async () => {
      const result = await store.read(vaultId, 1, 50)

      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(50)
      expect(result.totalPages).toBe(0)
    })

    it('should return entries sorted descending by timestamp', async () => {
      const entry1 = createLogEntry({ timestamp: '2025-01-15T10:00:00.000Z', status: 'started' })
      const entry2 = createLogEntry({ timestamp: '2025-01-15T11:00:00.000Z', status: 'success' })
      const entry3 = createLogEntry({ timestamp: '2025-01-15T12:00:00.000Z', status: 'failed' })

      await store.append(vaultId, entry1)
      await store.append(vaultId, entry2)
      await store.append(vaultId, entry3)

      const result = await store.read(vaultId, 1, 50)

      expect(result.items).toHaveLength(3)
      expect(result.items[0]!.status).toBe('failed')
      expect(result.items[1]!.status).toBe('success')
      expect(result.items[2]!.status).toBe('started')
    })

    it('should apply pagination correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await store.append(vaultId, createLogEntry({
          timestamp: `2025-01-15T10:0${i}:00.000Z`,
          status: i % 2 === 0 ? 'started' : 'success',
        }))
      }

      // Page 1, pageSize 2 (descending: entries 4, 3)
      const page1 = await store.read(vaultId, 1, 2)
      expect(page1.items).toHaveLength(2)
      expect(page1.total).toBe(5)
      expect(page1.page).toBe(1)
      expect(page1.pageSize).toBe(2)
      expect(page1.totalPages).toBe(3)

      // Page 2, pageSize 2 (entries 2, 1)
      const page2 = await store.read(vaultId, 2, 2)
      expect(page2.items).toHaveLength(2)

      // Page 3, pageSize 2 (entry 0)
      const page3 = await store.read(vaultId, 3, 2)
      expect(page3.items).toHaveLength(1)
    })

    it('should cap pageSize at 100', async () => {
      for (let i = 0; i < 5; i++) {
        await store.append(vaultId, createLogEntry({
          timestamp: `2025-01-15T10:0${i}:00.000Z`,
        }))
      }

      const result = await store.read(vaultId, 1, 200)
      expect(result.pageSize).toBe(100)
      expect(result.items).toHaveLength(5)
    })

    it('should handle page < 1 gracefully', async () => {
      await store.append(vaultId, createLogEntry())

      const result = await store.read(vaultId, 0, 50)
      expect(result.page).toBe(1)
      expect(result.items).toHaveLength(1)
    })

    it('should skip corrupt lines and log a warning', async () => {
      const dir = path.join(tempDir, 'sync', vaultId)
      await mkdir(dir, { recursive: true })
      const filePath = path.join(dir, 'sync-log.jsonl')

      const validEntry = createLogEntry({ status: 'success' })
      const content = JSON.stringify(validEntry) + '\nthis is not valid json\n'
      await writeFile(filePath, content, 'utf-8')

      store = new SyncLogStore(tempDir, logger)
      const result = await store.read(vaultId, 1, 50)

      expect(result.items).toHaveLength(1)
      expect(result.items[0]!.status).toBe('success')
      expect(logger.warnings).toHaveLength(1)
      expect(logger.warnings[0]!.message).toContain('corrupt')
    })

    it('should return empty response for completely corrupt file', async () => {
      const dir = path.join(tempDir, 'sync', vaultId)
      await mkdir(dir, { recursive: true })
      const filePath = path.join(dir, 'sync-log.jsonl')

      await writeFile(filePath, 'garbage\nnot json\nalso bad\n', 'utf-8')

      store = new SyncLogStore(tempDir, logger)
      const result = await store.read(vaultId, 1, 50)

      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('updateLast()', () => {
    it('should update the last entry with partial data', async () => {
      const entry = createLogEntry({
        timestamp: '2025-01-15T10:00:00.000Z',
        status: 'started',
      })
      await store.append(vaultId, entry)

      await store.updateLast(vaultId, {
        status: 'success',
        pulledCount: 42,
        pushedCount: 7,
        durationMs: 1500,
      })

      const result = await store.read(vaultId, 1, 50)
      expect(result.items).toHaveLength(1)
      expect(result.items[0]!.status).toBe('success')
      expect(result.items[0]!.pulledCount).toBe(42)
      expect(result.items[0]!.pushedCount).toBe(7)
      expect(result.items[0]!.durationMs).toBe(1500)
      // Original fields preserved
      expect(result.items[0]!.id).toBe(entry.id)
      expect(result.items[0]!.triggerType).toBe('manual')
    })

    it('should update the chronologically last entry when multiple exist', async () => {
      const entry1 = createLogEntry({
        id: 'first',
        timestamp: '2025-01-15T10:00:00.000Z',
        status: 'success',
      })
      const entry2 = createLogEntry({
        id: 'second',
        timestamp: '2025-01-15T11:00:00.000Z',
        status: 'started',
      })

      await store.append(vaultId, entry1)
      await store.append(vaultId, entry2)

      await store.updateLast(vaultId, { status: 'failed' })

      const result = await store.read(vaultId, 1, 50)
      // Sorted descending: entry2 (now failed) first, entry1 (success) second
      expect(result.items[0]!.id).toBe('second')
      expect(result.items[0]!.status).toBe('failed')
      expect(result.items[1]!.id).toBe('first')
      expect(result.items[1]!.status).toBe('success')
    })

    it('should be a no-op if no entries exist', async () => {
      // Should not throw
      await store.updateLast(vaultId, { status: 'success' })

      const result = await store.read(vaultId, 1, 50)
      expect(result.items).toEqual([])
    })

    it('should be a no-op if file is corrupt', async () => {
      const dir = path.join(tempDir, 'sync', vaultId)
      await mkdir(dir, { recursive: true })
      const filePath = path.join(dir, 'sync-log.jsonl')
      await writeFile(filePath, 'not json at all\n', 'utf-8')

      store = new SyncLogStore(tempDir, logger)

      // Should not throw
      await store.updateLast(vaultId, { status: 'success' })
    })
  })
})
