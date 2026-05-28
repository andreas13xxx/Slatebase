import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { CheckpointStore } from './checkpoint-store.js'
import type { ILogger } from '../logger/index.js'
import type { SyncCheckpoint } from './types.js'

// --- Mock Logger ---

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createMockLogger(),
  } as unknown as ILogger
}

// --- Test Setup ---

let tempDir: string
let store: CheckpointStore
let logger: ILogger

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-store-test-'))
  logger = createMockLogger()
  store = new CheckpointStore(tempDir, logger)
})

afterAll(async () => {
  // Cleanup is best-effort; temp dirs are cleaned by OS eventually
  try {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  } catch {
    // Ignore cleanup errors
  }
})

// --- Test Data ---

function createCheckpoint(overrides?: Partial<SyncCheckpoint>): SyncCheckpoint {
  return {
    lastSeq: '42-abc123',
    lastSyncAt: '2024-01-15T10:30:00.000Z',
    localMtimes: {
      'notes/hello.md': 1705312200000,
      'attachments/image.png': 1705312100000,
    },
    ...overrides,
  }
}

// --- Tests ---

describe('CheckpointStore', () => {
  describe('save()', () => {
    it('should save a checkpoint and create the directory structure', async () => {
      const vaultId = 'abc123def456'
      const checkpoint = createCheckpoint()

      await store.save(vaultId, checkpoint)

      const filePath = path.join(tempDir, 'sync', vaultId, 'checkpoint.json')
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw)

      expect(parsed).toEqual(checkpoint)
    })

    it('should overwrite an existing checkpoint atomically', async () => {
      const vaultId = 'abc123def456'
      const first = createCheckpoint({ lastSeq: '10-first' })
      const second = createCheckpoint({ lastSeq: '20-second' })

      await store.save(vaultId, first)
      await store.save(vaultId, second)

      const loaded = await store.load(vaultId)
      expect(loaded).toEqual(second)
    })

    it('should not leave temp files on successful save', async () => {
      const vaultId = 'abc123def456'
      await store.save(vaultId, createCheckpoint())

      const dir = path.join(tempDir, 'sync', vaultId)
      const files = await fs.readdir(dir)
      const tmpFiles = files.filter(f => f.endsWith('.tmp'))

      expect(tmpFiles).toHaveLength(0)
    })
  })

  describe('load()', () => {
    it('should return the saved checkpoint', async () => {
      const vaultId = 'abc123def456'
      const checkpoint = createCheckpoint()

      await store.save(vaultId, checkpoint)
      const loaded = await store.load(vaultId)

      expect(loaded).toEqual(checkpoint)
    })

    it('should return null when no checkpoint exists', async () => {
      const loaded = await store.load('nonexistent123')
      expect(loaded).toBeNull()
    })

    it('should return null for corrupt JSON', async () => {
      const vaultId = 'corrupt12345'
      const dir = path.join(tempDir, 'sync', vaultId)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'checkpoint.json'), 'not valid json{{{', 'utf-8')

      const loaded = await store.load(vaultId)
      expect(loaded).toBeNull()
    })

    it('should return null for invalid checkpoint structure (missing lastSeq)', async () => {
      const vaultId = 'invalid12345'
      const dir = path.join(tempDir, 'sync', vaultId)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'checkpoint.json'),
        JSON.stringify({ lastSyncAt: '2024-01-01T00:00:00Z', localMtimes: {} }),
        'utf-8',
      )

      const loaded = await store.load(vaultId)
      expect(loaded).toBeNull()
    })

    it('should return null for invalid checkpoint structure (missing localMtimes)', async () => {
      const vaultId = 'invalid22345'
      const dir = path.join(tempDir, 'sync', vaultId)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'checkpoint.json'),
        JSON.stringify({ lastSeq: '1-abc', lastSyncAt: '2024-01-01T00:00:00Z' }),
        'utf-8',
      )

      const loaded = await store.load(vaultId)
      expect(loaded).toBeNull()
    })

    it('should return null for non-object JSON (e.g. array)', async () => {
      const vaultId = 'arrayval1234'
      const dir = path.join(tempDir, 'sync', vaultId)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'checkpoint.json'), '[1, 2, 3]', 'utf-8')

      const loaded = await store.load(vaultId)
      expect(loaded).toBeNull()
    })

    it('should handle empty localMtimes map', async () => {
      const vaultId = 'emptymtime12'
      const checkpoint = createCheckpoint({ localMtimes: {} })

      await store.save(vaultId, checkpoint)
      const loaded = await store.load(vaultId)

      expect(loaded).toEqual(checkpoint)
      expect(loaded?.localMtimes).toEqual({})
    })
  })

  describe('remove()', () => {
    it('should remove an existing checkpoint', async () => {
      const vaultId = 'abc123def456'
      await store.save(vaultId, createCheckpoint())

      await store.remove(vaultId)

      const loaded = await store.load(vaultId)
      expect(loaded).toBeNull()
    })

    it('should succeed silently when checkpoint does not exist', async () => {
      await expect(store.remove('nonexistent123')).resolves.toBeUndefined()
    })
  })
})
