import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { CsrfSecretManager } from './csrf-secret.js'
import type { ILogger } from '../logger/index.js'

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

describe('CsrfSecretManager', () => {
  let tempDir: string
  let logger: ILogger

  beforeEach(async () => {
    tempDir = join(tmpdir(), `csrf-secret-test-${randomBytes(8).toString('hex')}`)
    await mkdir(tempDir, { recursive: true })
    logger = createMockLogger()
    // Clear env var before each test
    delete process.env['SLATEBASE_CSRF_SECRET']
  })

  afterAll(async () => {
    // Cleanup
    try {
      const { readdir } = await import('node:fs/promises')
      const entries = await readdir(tmpdir())
      for (const entry of entries) {
        if (entry.startsWith('csrf-secret-test-')) {
          await rm(join(tmpdir(), entry), { recursive: true, force: true }).catch(() => {})
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('loadOrCreate', () => {
    it('returns env var value when SLATEBASE_CSRF_SECRET is set', async () => {
      const envSecret = 'a'.repeat(64)
      process.env['SLATEBASE_CSRF_SECRET'] = envSecret

      const manager = new CsrfSecretManager(tempDir, logger)
      const result = await manager.loadOrCreate()

      expect(result).toBe(envSecret)
    })

    it('prioritizes env var over existing file', async () => {
      const envSecret = 'b'.repeat(64)
      const fileSecret = 'c'.repeat(64)
      process.env['SLATEBASE_CSRF_SECRET'] = envSecret
      await writeFile(join(tempDir, '.csrf-secret'), fileSecret, 'utf-8')

      const manager = new CsrfSecretManager(tempDir, logger)
      const result = await manager.loadOrCreate()

      expect(result).toBe(envSecret)
    })

    it('reads secret from file when env var is not set', async () => {
      const fileSecret = 'd'.repeat(64)
      await writeFile(join(tempDir, '.csrf-secret'), fileSecret, 'utf-8')

      const manager = new CsrfSecretManager(tempDir, logger)
      const result = await manager.loadOrCreate()

      expect(result).toBe(fileSecret)
    })

    it('trims whitespace from file content', async () => {
      const fileSecret = 'e'.repeat(64)
      await writeFile(join(tempDir, '.csrf-secret'), `  ${fileSecret}\n`, 'utf-8')

      const manager = new CsrfSecretManager(tempDir, logger)
      const result = await manager.loadOrCreate()

      expect(result).toBe(fileSecret)
    })

    it('generates and persists a new secret when file does not exist', async () => {
      const manager = new CsrfSecretManager(tempDir, logger)
      const result = await manager.loadOrCreate()

      // Should be a valid 64-char hex string
      expect(result).toMatch(/^[0-9a-f]{64}$/)

      // Should be persisted to disk
      const persisted = await readFile(join(tempDir, '.csrf-secret'), 'utf-8')
      expect(persisted).toBe(result)
    })

    it('returns the same secret on consecutive calls', async () => {
      const manager = new CsrfSecretManager(tempDir, logger)
      const first = await manager.loadOrCreate()
      const second = await manager.loadOrCreate()

      expect(first).toBe(second)
    })

    it('regenerates secret when file contains invalid content', async () => {
      await writeFile(join(tempDir, '.csrf-secret'), 'not-a-valid-hex-secret', 'utf-8')

      const manager = new CsrfSecretManager(tempDir, logger)
      const result = await manager.loadOrCreate()

      // Should be a newly generated valid hex string
      expect(result).toMatch(/^[0-9a-f]{64}$/)
      expect(result).not.toBe('not-a-valid-hex-secret')
    })

    it('regenerates secret when file is empty', async () => {
      await writeFile(join(tempDir, '.csrf-secret'), '', 'utf-8')

      const manager = new CsrfSecretManager(tempDir, logger)
      const result = await manager.loadOrCreate()

      expect(result).toMatch(/^[0-9a-f]{64}$/)
    })

    it('creates dataDir if it does not exist', async () => {
      const nestedDir = join(tempDir, 'nested', 'dir')
      const manager = new CsrfSecretManager(nestedDir, logger)
      const result = await manager.loadOrCreate()

      expect(result).toMatch(/^[0-9a-f]{64}$/)

      const persisted = await readFile(join(nestedDir, '.csrf-secret'), 'utf-8')
      expect(persisted).toBe(result)
    })

    it('does not leave temp files after atomic write', async () => {
      const manager = new CsrfSecretManager(tempDir, logger)
      await manager.loadOrCreate()

      const { readdir } = await import('node:fs/promises')
      const entries = await readdir(tempDir)
      const tmpFiles = entries.filter(e => e.endsWith('.tmp'))

      expect(tmpFiles).toHaveLength(0)
    })

    it('ignores empty env var and falls back to file', async () => {
      process.env['SLATEBASE_CSRF_SECRET'] = ''
      const fileSecret = 'f'.repeat(64)
      await writeFile(join(tempDir, '.csrf-secret'), fileSecret, 'utf-8')

      const manager = new CsrfSecretManager(tempDir, logger)
      const result = await manager.loadOrCreate()

      expect(result).toBe(fileSecret)
    })
  })
})
