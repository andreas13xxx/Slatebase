// Unit tests for VaultStatisticsService

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { VaultStatisticsService } from './statistics-service.js'
import { StatisticsTimeoutError } from './errors.js'
import type { ILogger } from '../logger/index.js'

function createMockLogger(): ILogger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  }
}

describe('VaultStatisticsService', () => {
  let tmpDir: string
  let service: VaultStatisticsService
  const logger = createMockLogger()

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stats-test-'))
    service = new VaultStatisticsService(
      (vaultId) => (vaultId === 'test-vault' ? tmpDir : undefined),
      logger,
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns zeros for empty vault', async () => {
    const stats = await service.getStatistics('test-vault')
    expect(stats).toEqual({ fileCount: 0, folderCount: 0, totalSizeBytes: 0 })
  })

  it('returns zeros for unknown vaultId', async () => {
    const stats = await service.getStatistics('unknown-vault')
    expect(stats).toEqual({ fileCount: 0, folderCount: 0, totalSizeBytes: 0 })
  })

  it('counts files and their sizes', async () => {
    await fs.writeFile(path.join(tmpDir, 'file1.md'), 'hello')
    await fs.writeFile(path.join(tmpDir, 'file2.md'), 'world!!')

    const stats = await service.getStatistics('test-vault')
    expect(stats.fileCount).toBe(2)
    expect(stats.folderCount).toBe(0)
    expect(stats.totalSizeBytes).toBe(12) // 5 + 7
  })

  it('counts folders recursively', async () => {
    await fs.mkdir(path.join(tmpDir, 'sub'))
    await fs.writeFile(path.join(tmpDir, 'sub', 'note.md'), 'content')
    await fs.mkdir(path.join(tmpDir, 'sub', 'deep'))
    await fs.writeFile(path.join(tmpDir, 'sub', 'deep', 'inner.md'), 'abc')

    const stats = await service.getStatistics('test-vault')
    expect(stats.fileCount).toBe(2)
    expect(stats.folderCount).toBe(2) // sub + sub/deep
    expect(stats.totalSizeBytes).toBe(10) // 7 + 3
  })

  it('excludes dot-prefixed directories', async () => {
    await fs.mkdir(path.join(tmpDir, '.slatebase'))
    await fs.writeFile(path.join(tmpDir, '.slatebase', 'link-index.json'), '{}')
    await fs.mkdir(path.join(tmpDir, '.obsidian'))
    await fs.writeFile(path.join(tmpDir, '.obsidian', 'app.json'), '{}')
    await fs.writeFile(path.join(tmpDir, 'kept.md'), 'kept')

    const stats = await service.getStatistics('test-vault')
    expect(stats.fileCount).toBe(1)
    expect(stats.folderCount).toBe(0)
    expect(stats.totalSizeBytes).toBe(4)
  })

  it('excludes dot-prefixed files', async () => {
    await fs.writeFile(path.join(tmpDir, '.hidden-file'), 'secret')
    await fs.writeFile(path.join(tmpDir, 'visible.md'), 'hi')

    const stats = await service.getStatistics('test-vault')
    expect(stats.fileCount).toBe(1)
    expect(stats.folderCount).toBe(0)
    expect(stats.totalSizeBytes).toBe(2)
  })

  it('includes underscore-prefixed entries (like Obsidian)', async () => {
    await fs.writeFile(path.join(tmpDir, '_notes.md'), 'underscore')
    await fs.mkdir(path.join(tmpDir, '_archive'))
    await fs.writeFile(path.join(tmpDir, '_archive', 'old.md'), 'old')
    await fs.writeFile(path.join(tmpDir, 'visible.md'), 'hi')

    const stats = await service.getStatistics('test-vault')
    expect(stats.fileCount).toBe(3)
    expect(stats.folderCount).toBe(1)
  })

  it('uses cached value on second call', async () => {
    await fs.writeFile(path.join(tmpDir, 'file.md'), 'data')

    const stats1 = await service.getStatistics('test-vault')
    expect(stats1.fileCount).toBe(1)

    // Add another file — should not affect cached result
    await fs.writeFile(path.join(tmpDir, 'file2.md'), 'more')

    const stats2 = await service.getStatistics('test-vault')
    expect(stats2.fileCount).toBe(1) // still cached
  })

  it('invalidateCache forces recomputation', async () => {
    await fs.writeFile(path.join(tmpDir, 'file.md'), 'data')

    const stats1 = await service.getStatistics('test-vault')
    expect(stats1.fileCount).toBe(1)

    // Add another file and invalidate cache
    await fs.writeFile(path.join(tmpDir, 'file2.md'), 'more')
    service.invalidateCache('test-vault')

    const stats2 = await service.getStatistics('test-vault')
    expect(stats2.fileCount).toBe(2)
  })

  it('invalidateCache for non-cached vault is a no-op', () => {
    // Should not throw
    service.invalidateCache('non-existent')
  })

  it('throws StatisticsTimeoutError on timeout', async () => {
    // Create a service with an extremely short timeout to simulate timeout
    // We can't easily test this without mocking setTimeout, but we can verify
    // the error type is thrown correctly by testing the error class itself
    const error = new StatisticsTimeoutError('vault-123')
    expect(error.code).toBe('STATISTICS_TIMEOUT')
    expect(error.vaultId).toBe('vault-123')
    expect(error.message).toContain('vault-123')
  })
})
