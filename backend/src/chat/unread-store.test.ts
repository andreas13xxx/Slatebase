import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { UnreadStore } from './unread-store.js'
import type { ILogger } from '../logger/index.js'

// --- Mock Logger ---

function createMockLogger(): ILogger & { warnings: string[]; errors: string[]; infos: string[] } {
  const warnings: string[] = []
  const errors: string[] = []
  const infos: string[] = []
  return {
    warnings,
    errors,
    infos,
    debug() {},
    info(msg: string) { infos.push(msg) },
    warn(msg: string) { warnings.push(msg) },
    error(msg: string) { errors.push(msg) },
  }
}

// --- Test Setup ---

let tempDir: string
let logger: ReturnType<typeof createMockLogger>

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unread-store-test-'))
  logger = createMockLogger()
})

afterAll(async () => {
  // Cleanup all temp dirs created during tests
  // Individual tests may have already cleaned up, so ignore errors
})

async function cleanup(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

// --- Tests ---

describe('UnreadStore', () => {
  describe('increment', () => {
    it('should increment unread count from 0 to 1', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')

      const count = await store.getCount('user1', 'conv1')
      expect(count).toBe(1)
      await cleanup(tempDir)
    })

    it('should increment existing count', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv1')

      const count = await store.getCount('user1', 'conv1')
      expect(count).toBe(3)
      await cleanup(tempDir)
    })

    it('should track separate conversations independently', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv2')

      expect(await store.getCount('user1', 'conv1')).toBe(2)
      expect(await store.getCount('user1', 'conv2')).toBe(1)
      await cleanup(tempDir)
    })

    it('should persist to disk', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')

      const filePath = path.join(tempDir, 'chat', 'unread', 'user1.json')
      const raw = await fs.readFile(filePath, 'utf-8')
      const data = JSON.parse(raw)
      expect(data.counts.conv1).toBe(1)
      await cleanup(tempDir)
    })
  })

  describe('reset', () => {
    it('should reset count to 0', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv1')
      await store.reset('user1', 'conv1')

      expect(await store.getCount('user1', 'conv1')).toBe(0)
      await cleanup(tempDir)
    })

    it('should be a no-op for non-existent user', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.reset('nonexistent', 'conv1')

      expect(await store.getCount('nonexistent', 'conv1')).toBe(0)
      await cleanup(tempDir)
    })
  })

  describe('getCount', () => {
    it('should return 0 for unknown user', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      expect(await store.getCount('unknown', 'conv1')).toBe(0)
      await cleanup(tempDir)
    })

    it('should return 0 for unknown conversation', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')

      expect(await store.getCount('user1', 'unknown')).toBe(0)
      await cleanup(tempDir)
    })
  })

  describe('getAllCounts', () => {
    it('should return empty map for unknown user', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      const counts = await store.getAllCounts('unknown')
      expect(counts.size).toBe(0)
      await cleanup(tempDir)
    })

    it('should return all counts for a user', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv2')

      const counts = await store.getAllCounts('user1')
      expect(counts.get('conv1')).toBe(2)
      expect(counts.get('conv2')).toBe(1)
      expect(counts.size).toBe(2)
      await cleanup(tempDir)
    })

    it('should return a copy (not a reference)', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')

      const counts = await store.getAllCounts('user1')
      counts.set('conv1', 999)

      expect(await store.getCount('user1', 'conv1')).toBe(1)
      await cleanup(tempDir)
    })
  })

  describe('getTotal', () => {
    it('should return 0 for unknown user', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      expect(await store.getTotal('unknown')).toBe(0)
      await cleanup(tempDir)
    })

    it('should sum all conversation counts', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv2')
      await store.increment('user1', 'conv3')
      await store.increment('user1', 'conv3')
      await store.increment('user1', 'conv3')

      expect(await store.getTotal('user1')).toBe(6)
      await cleanup(tempDir)
    })
  })

  describe('remove', () => {
    it('should remove a conversation entry', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv1')
      await store.increment('user1', 'conv2')

      await store.remove('user1', 'conv1')

      expect(await store.getCount('user1', 'conv1')).toBe(0)
      expect(await store.getCount('user1', 'conv2')).toBe(1)
      expect(await store.getTotal('user1')).toBe(1)
      await cleanup(tempDir)
    })

    it('should delete file when all entries are removed', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.increment('user1', 'conv1')
      await store.remove('user1', 'conv1')

      const filePath = path.join(tempDir, 'chat', 'unread', 'user1.json')
      await expect(fs.access(filePath)).rejects.toThrow()
      await cleanup(tempDir)
    })

    it('should be a no-op for non-existent user', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      await store.remove('nonexistent', 'conv1')

      expect(await store.getCount('nonexistent', 'conv1')).toBe(0)
      await cleanup(tempDir)
    })
  })

  describe('loadIndex', () => {
    it('should load persisted data from disk', async () => {
      const store1 = new UnreadStore(tempDir, logger)
      await store1.loadIndex()

      await store1.increment('user1', 'conv1')
      await store1.increment('user1', 'conv1')
      await store1.increment('user1', 'conv2')
      await store1.increment('user2', 'conv1')

      // Create a new store instance (simulating server restart)
      const store2 = new UnreadStore(tempDir, logger)
      await store2.loadIndex()

      expect(await store2.getCount('user1', 'conv1')).toBe(2)
      expect(await store2.getCount('user1', 'conv2')).toBe(1)
      expect(await store2.getCount('user2', 'conv1')).toBe(1)
      expect(await store2.getTotal('user1')).toBe(3)
      await cleanup(tempDir)
    })

    it('should skip corrupt JSON files with error logging', async () => {
      const unreadDir = path.join(tempDir, 'chat', 'unread')
      await fs.mkdir(unreadDir, { recursive: true })

      // Write a corrupt file
      await fs.writeFile(path.join(unreadDir, 'corrupt.json'), 'not valid json{{{', 'utf-8')

      // Write a valid file
      await fs.writeFile(
        path.join(unreadDir, 'valid.json'),
        JSON.stringify({ counts: { conv1: 5 } }),
        'utf-8',
      )

      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      expect(await store.getCount('valid', 'conv1')).toBe(5)
      expect(await store.getCount('corrupt', 'conv1')).toBe(0)
      expect(logger.errors.length).toBe(1)
      await cleanup(tempDir)
    })

    it('should skip files with invalid structure', async () => {
      const unreadDir = path.join(tempDir, 'chat', 'unread')
      await fs.mkdir(unreadDir, { recursive: true })

      // Write a file with missing counts field
      await fs.writeFile(
        path.join(unreadDir, 'invalid.json'),
        JSON.stringify({ notCounts: {} }),
        'utf-8',
      )

      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      expect(await store.getCount('invalid', 'conv1')).toBe(0)
      expect(logger.warnings.length).toBe(1)
      await cleanup(tempDir)
    })

    it('should skip non-JSON files', async () => {
      const unreadDir = path.join(tempDir, 'chat', 'unread')
      await fs.mkdir(unreadDir, { recursive: true })

      await fs.writeFile(path.join(unreadDir, 'readme.txt'), 'ignore me', 'utf-8')
      await fs.writeFile(
        path.join(unreadDir, 'user1.json'),
        JSON.stringify({ counts: { conv1: 2 } }),
        'utf-8',
      )

      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      expect(await store.getCount('user1', 'conv1')).toBe(2)
      await cleanup(tempDir)
    })

    it('should handle empty directory', async () => {
      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      expect(await store.getTotal('anyone')).toBe(0)
      await cleanup(tempDir)
    })

    it('should skip entries with negative counts', async () => {
      const unreadDir = path.join(tempDir, 'chat', 'unread')
      await fs.mkdir(unreadDir, { recursive: true })

      await fs.writeFile(
        path.join(unreadDir, 'user1.json'),
        JSON.stringify({ counts: { conv1: 3, conv2: -1 } }),
        'utf-8',
      )

      const store = new UnreadStore(tempDir, logger)
      await store.loadIndex()

      expect(await store.getCount('user1', 'conv1')).toBe(3)
      expect(await store.getCount('user1', 'conv2')).toBe(0)
      await cleanup(tempDir)
    })
  })
})
