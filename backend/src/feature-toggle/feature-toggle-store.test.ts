import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FeatureToggleStore } from './feature-toggle-store.js'
import type { ILogger } from '../logger/index.js'

// ─── Mock Logger ─────────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createMockLogger(),
    setLogStore: () => {},
  } as unknown as ILogger
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FeatureToggleStore', () => {
  let tempDir: string
  const logger = createMockLogger()

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'feature-store-test-'))
  })

  afterAll(async () => {
    // Cleanup happens per test via tempDir being unique
  })

  describe('load()', () => {
    it('should return empty record when file does not exist', async () => {
      const store = new FeatureToggleStore(tempDir, logger)
      const result = await store.load()
      expect(result).toEqual({})
    })

    it('should load valid persisted state from disk', async () => {
      const data = {
        version: 1,
        updatedAt: '2024-01-01T00:00:00.000Z',
        toggles: { chat: false, 'vault-sync': true },
      }
      await writeFile(join(tempDir, 'features.json'), JSON.stringify(data), 'utf-8')

      const store = new FeatureToggleStore(tempDir, logger)
      const result = await store.load()
      expect(result).toEqual({ chat: false, 'vault-sync': true })
    })

    it('should return empty record for invalid JSON', async () => {
      await writeFile(join(tempDir, 'features.json'), 'not valid json', 'utf-8')

      const store = new FeatureToggleStore(tempDir, logger)
      const result = await store.load()
      expect(result).toEqual({})
    })

    it('should return empty record for wrong version', async () => {
      const data = {
        version: 99,
        updatedAt: '2024-01-01T00:00:00.000Z',
        toggles: { chat: false },
      }
      await writeFile(join(tempDir, 'features.json'), JSON.stringify(data), 'utf-8')

      const store = new FeatureToggleStore(tempDir, logger)
      const result = await store.load()
      expect(result).toEqual({})
    })

    it('should return empty record when toggles contains non-boolean values', async () => {
      const data = {
        version: 1,
        updatedAt: '2024-01-01T00:00:00.000Z',
        toggles: { chat: 'yes' },
      }
      await writeFile(join(tempDir, 'features.json'), JSON.stringify(data), 'utf-8')

      const store = new FeatureToggleStore(tempDir, logger)
      const result = await store.load()
      expect(result).toEqual({})
    })

    it('should return empty record when toggles is missing', async () => {
      const data = { version: 1, updatedAt: '2024-01-01T00:00:00.000Z' }
      await writeFile(join(tempDir, 'features.json'), JSON.stringify(data), 'utf-8')

      const store = new FeatureToggleStore(tempDir, logger)
      const result = await store.load()
      expect(result).toEqual({})
    })
  })

  describe('save()', () => {
    it('should persist toggle state to disk', async () => {
      const store = new FeatureToggleStore(tempDir, logger)
      await store.save({ chat: false, mcp: true })

      const raw = await readFile(join(tempDir, 'features.json'), 'utf-8')
      const data = JSON.parse(raw)
      expect(data.version).toBe(1)
      expect(data.toggles).toEqual({ chat: false, mcp: true })
      expect(data.updatedAt).toBeDefined()
    })

    it('should create data directory if it does not exist', async () => {
      const nestedDir = join(tempDir, 'nested', 'dir')
      const store = new FeatureToggleStore(nestedDir, logger)
      await store.save({ chat: true })

      const raw = await readFile(join(nestedDir, 'features.json'), 'utf-8')
      const data = JSON.parse(raw)
      expect(data.toggles).toEqual({ chat: true })
    })

    it('should overwrite existing file', async () => {
      const store = new FeatureToggleStore(tempDir, logger)
      await store.save({ chat: false })
      await store.save({ chat: true, mcp: false })

      const raw = await readFile(join(tempDir, 'features.json'), 'utf-8')
      const data = JSON.parse(raw)
      expect(data.toggles).toEqual({ chat: true, mcp: false })
    })

    it('should persist empty toggles', async () => {
      const store = new FeatureToggleStore(tempDir, logger)
      await store.save({})

      const raw = await readFile(join(tempDir, 'features.json'), 'utf-8')
      const data = JSON.parse(raw)
      expect(data.toggles).toEqual({})
    })
  })

  describe('round-trip', () => {
    it('should correctly round-trip save and load', async () => {
      const store = new FeatureToggleStore(tempDir, logger)
      const toggles = { chat: false, 'vault-sync': true, mcp: false }

      await store.save(toggles)
      const loaded = await store.load()

      expect(loaded).toEqual(toggles)
    })
  })
})
