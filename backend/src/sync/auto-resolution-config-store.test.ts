import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { ILogger } from '../logger/index.js'
import type { AutoResolutionConfig } from './types.js'
import { AutoResolutionConfigStore, autoResolutionConfigSchema } from './auto-resolution-config-store.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createMockLogger(),
  } as unknown as ILogger
}

let tempDir: string

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-auto-res-config-test-'))
})

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true })
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AutoResolutionConfigStore', () => {
  function createStore(subDir?: string): AutoResolutionConfigStore {
    const dataDir = subDir ? path.join(tempDir, subDir) : tempDir
    return new AutoResolutionConfigStore(dataDir, createMockLogger())
  }

  describe('load()', () => {
    it('returns default config when file does not exist', async () => {
      const store = createStore('load-no-file')
      const config = await store.load('abc123def456')

      expect(config).toEqual({ enabled: false, strategies: {} })
    })

    it('loads a valid config from disk', async () => {
      const store = createStore('load-valid')
      const vaultId = 'aabb11223344'
      const expected: AutoResolutionConfig = {
        enabled: true,
        strategies: {
          content_conflict: 'newer_wins',
          local_deleted: 'remote_wins',
        },
      }

      // Write the file manually
      const dir = path.join(tempDir, 'load-valid', 'sync', vaultId)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'auto-resolution.json'),
        JSON.stringify(expected, null, 2),
        'utf-8',
      )

      const config = await store.load(vaultId)
      expect(config).toEqual(expected)
    })

    it('returns default config when file contains invalid JSON', async () => {
      const store = createStore('load-invalid-json')
      const vaultId = 'cc11dd22ee33'

      const dir = path.join(tempDir, 'load-invalid-json', 'sync', vaultId)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'auto-resolution.json'),
        'not valid json {{{',
        'utf-8',
      )

      const config = await store.load(vaultId)
      expect(config).toEqual({ enabled: false, strategies: {} })
    })

    it('returns default config when schema validation fails', async () => {
      const store = createStore('load-invalid-schema')
      const vaultId = 'ff00aa11bb22'

      const dir = path.join(tempDir, 'load-invalid-schema', 'sync', vaultId)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'auto-resolution.json'),
        JSON.stringify({ enabled: 'yes', strategies: 42 }),
        'utf-8',
      )

      const config = await store.load(vaultId)
      expect(config).toEqual({ enabled: false, strategies: {} })
    })

    it('returns default config for invalid strategy values', async () => {
      const store = createStore('load-bad-strategy')
      const vaultId = 'aa11bb22cc33'

      const dir = path.join(tempDir, 'load-bad-strategy', 'sync', vaultId)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'auto-resolution.json'),
        JSON.stringify({ enabled: true, strategies: { content_conflict: 'invalid_strategy' } }),
        'utf-8',
      )

      const config = await store.load(vaultId)
      expect(config).toEqual({ enabled: false, strategies: {} })
    })
  })

  describe('save()', () => {
    it('creates directory and persists config', async () => {
      const store = createStore('save-new')
      const vaultId = '112233445566'
      const config: AutoResolutionConfig = {
        enabled: true,
        strategies: {
          content_conflict: 'newer_wins',
          remote_deleted: 'local_wins',
        },
      }

      await store.save(vaultId, config)

      // Read it back via filesystem to verify
      const filePath = path.join(tempDir, 'save-new', 'sync', vaultId, 'auto-resolution.json')
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed).toEqual(config)
    })

    it('overwrites existing config atomically', async () => {
      const store = createStore('save-overwrite')
      const vaultId = '667788990011'

      const config1: AutoResolutionConfig = {
        enabled: false,
        strategies: { content_conflict: 'remote_wins' },
      }
      const config2: AutoResolutionConfig = {
        enabled: true,
        strategies: { local_deleted: 'local_wins', rename_conflict: 'skip' },
      }

      await store.save(vaultId, config1)
      await store.save(vaultId, config2)

      const loaded = await store.load(vaultId)
      expect(loaded).toEqual(config2)
    })

    it('saves config with empty strategies', async () => {
      const store = createStore('save-empty-strategies')
      const vaultId = 'aabbccddeeff'
      const config: AutoResolutionConfig = {
        enabled: false,
        strategies: {},
      }

      await store.save(vaultId, config)
      const loaded = await store.load(vaultId)
      expect(loaded).toEqual(config)
    })

    it('does not leave temp files on successful write', async () => {
      const store = createStore('save-no-temp')
      const vaultId = '001122334455'
      const config: AutoResolutionConfig = { enabled: true, strategies: {} }

      await store.save(vaultId, config)

      const dir = path.join(tempDir, 'save-no-temp', 'sync', vaultId)
      const files = await fs.readdir(dir)
      expect(files).toEqual(['auto-resolution.json'])
    })
  })

  describe('round-trip (save then load)', () => {
    it('preserves all strategy values', async () => {
      const store = createStore('roundtrip')
      const vaultId = 'aabbcc112233'
      const config: AutoResolutionConfig = {
        enabled: true,
        strategies: {
          content_conflict: 'newer_wins',
          local_deleted: 'remote_wins',
          remote_deleted: 'local_wins',
          rename_conflict: 'skip',
        },
      }

      await store.save(vaultId, config)
      const loaded = await store.load(vaultId)
      expect(loaded).toEqual(config)
    })
  })
})

describe('autoResolutionConfigSchema', () => {
  it('accepts valid config with all strategies', () => {
    const input = {
      enabled: true,
      strategies: {
        content_conflict: 'newer_wins',
        local_deleted: 'remote_wins',
        remote_deleted: 'local_wins',
        rename_conflict: 'skip',
      },
    }
    const result = autoResolutionConfigSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts valid config with empty strategies', () => {
    const input = { enabled: false, strategies: {} }
    const result = autoResolutionConfigSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts config without strategies field (defaults to {})', () => {
    const input = { enabled: false }
    const result = autoResolutionConfigSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.strategies).toEqual({})
    }
  })

  it('rejects config with invalid enabled type', () => {
    const input = { enabled: 'true', strategies: {} }
    const result = autoResolutionConfigSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects config with invalid strategy value', () => {
    const input = { enabled: true, strategies: { content_conflict: 'unknown_strategy' } }
    const result = autoResolutionConfigSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects config with invalid category key', () => {
    const input = { enabled: true, strategies: { invalid_category: 'newer_wins' } }
    const result = autoResolutionConfigSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts partial strategies (not all categories need to be present)', () => {
    const input = { enabled: true, strategies: { content_conflict: 'newer_wins' } }
    const result = autoResolutionConfigSchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})
