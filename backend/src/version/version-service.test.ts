// Unit tests for VersionService

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { VersionService } from './version-service.js'
import { VersionNotFoundError } from './errors.js'
import type { ILogger } from '../logger/index.js'

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

describe('VersionService', () => {
  let tempDir: string
  let vaultPath: string
  let service: VersionService
  const logger = createMockLogger()

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'version-test-'))
    vaultPath = path.join(tempDir, 'vault')
    await fs.mkdir(vaultPath, { recursive: true })

    const resolver = (vaultId: string) => vaultId === 'test-vault' ? vaultPath : null
    service = new VersionService(resolver, 20, logger)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('createVersion', () => {
    it('should save previous content under .versions directory', async () => {
      const content = Buffer.from('hello world')
      await service.createVersion('test-vault', 'notes/test.md', content)

      const versionDir = path.join(vaultPath, '.versions', 'notes/test.md')
      const entries = await fs.readdir(versionDir)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatch(/^\d{8}T\d{9}\.md$/)

      const savedContent = await fs.readFile(path.join(versionDir, entries[0]!))
      expect(savedContent.toString()).toBe('hello world')
    })

    it('should use correct timestamp format YYYYMMDDTHHmmssSSS', async () => {
      await service.createVersion('test-vault', 'file.txt', Buffer.from('data'))

      const versionDir = path.join(vaultPath, '.versions', 'file.txt')
      const entries = await fs.readdir(versionDir)
      const filename = entries[0]!
      // Pattern: 20240120T143000123.txt
      expect(filename).toMatch(/^\d{4}\d{2}\d{2}T\d{2}\d{2}\d{2}\d{3}\.txt$/)
    })

    it('should no-op when maxPerFile is 0', async () => {
      const resolver = (vaultId: string) => vaultId === 'test-vault' ? vaultPath : null
      const disabledService = new VersionService(resolver, 0, logger)

      await disabledService.createVersion('test-vault', 'file.md', Buffer.from('data'))

      const versionDir = path.join(vaultPath, '.versions', 'file.md')
      await expect(fs.access(versionDir)).rejects.toThrow()
    })

    it('should prune excess versions after creation', async () => {
      const resolver = (vaultId: string) => vaultId === 'test-vault' ? vaultPath : null
      const smallLimitService = new VersionService(resolver, 3, logger)

      // Create 5 versions with slight delay for unique timestamps
      for (let i = 0; i < 5; i++) {
        await smallLimitService.createVersion('test-vault', 'file.md', Buffer.from(`version ${i}`))
        // Small delay to ensure unique timestamps
        await new Promise(resolve => setTimeout(resolve, 5))
      }

      const versions = await smallLimitService.listVersions('test-vault', 'file.md')
      expect(versions.length).toBeLessThanOrEqual(3)
    })
  })

  describe('listVersions', () => {
    it('should return empty array for non-existent version dir', async () => {
      const versions = await service.listVersions('test-vault', 'nonexistent.md')
      expect(versions).toEqual([])
    })

    it('should return versions sorted descending by timestamp', async () => {
      const versionDir = path.join(vaultPath, '.versions', 'test.md')
      await fs.mkdir(versionDir, { recursive: true })

      // Create version files with known timestamps
      await fs.writeFile(path.join(versionDir, '20240101T100000000.md'), 'v1')
      await fs.writeFile(path.join(versionDir, '20240102T100000000.md'), 'v2')
      await fs.writeFile(path.join(versionDir, '20240103T100000000.md'), 'v3')

      const versions = await service.listVersions('test-vault', 'test.md')

      expect(versions).toHaveLength(3)
      expect(versions[0]!.timestamp).toBe('20240103T100000000')
      expect(versions[1]!.timestamp).toBe('20240102T100000000')
      expect(versions[2]!.timestamp).toBe('20240101T100000000')
    })

    it('should include sizeBytes for each version', async () => {
      const versionDir = path.join(vaultPath, '.versions', 'test.md')
      await fs.mkdir(versionDir, { recursive: true })

      const content = 'hello world'
      await fs.writeFile(path.join(versionDir, '20240101T100000000.md'), content)

      const versions = await service.listVersions('test-vault', 'test.md')
      expect(versions[0]!.sizeBytes).toBe(Buffer.byteLength(content))
    })

    it('should ignore files that do not match the timestamp pattern', async () => {
      const versionDir = path.join(vaultPath, '.versions', 'test.md')
      await fs.mkdir(versionDir, { recursive: true })

      await fs.writeFile(path.join(versionDir, '20240101T100000000.md'), 'valid')
      await fs.writeFile(path.join(versionDir, 'random-file.md'), 'invalid')
      await fs.writeFile(path.join(versionDir, '.tmp'), 'temp')

      const versions = await service.listVersions('test-vault', 'test.md')
      expect(versions).toHaveLength(1)
      expect(versions[0]!.timestamp).toBe('20240101T100000000')
    })
  })

  describe('getVersionContent', () => {
    it('should return content of a specific version', async () => {
      const versionDir = path.join(vaultPath, '.versions', 'test.md')
      await fs.mkdir(versionDir, { recursive: true })
      await fs.writeFile(path.join(versionDir, '20240101T100000000.md'), 'version content')

      const content = await service.getVersionContent('test-vault', 'test.md', '20240101T100000000')
      expect(content.toString()).toBe('version content')
    })

    it('should throw VersionNotFoundError for non-existent version', async () => {
      await expect(
        service.getVersionContent('test-vault', 'test.md', '20240101T100000000')
      ).rejects.toThrow(VersionNotFoundError)
    })
  })

  describe('restoreVersion', () => {
    it('should save current file as new version then overwrite with selected version', async () => {
      // Setup: create a file and a version
      const filePath = path.join(vaultPath, 'test.md')
      await fs.writeFile(filePath, 'current content')

      const versionDir = path.join(vaultPath, '.versions', 'test.md')
      await fs.mkdir(versionDir, { recursive: true })
      await fs.writeFile(path.join(versionDir, '20240101T100000000.md'), 'old version')

      await service.restoreVersion('test-vault', 'test.md', '20240101T100000000')

      // The file should now contain the old version's content
      const restoredContent = await fs.readFile(filePath, 'utf-8')
      expect(restoredContent).toBe('old version')

      // A new version should have been created with the previous "current content"
      const versions = await service.listVersions('test-vault', 'test.md')
      // Should have 2 versions: the original + the one saved before restore
      expect(versions.length).toBeGreaterThanOrEqual(2)
    })

    it('should throw VersionNotFoundError for invalid vault', async () => {
      await expect(
        service.restoreVersion('nonexistent-vault', 'test.md', '20240101T100000000')
      ).rejects.toThrow(VersionNotFoundError)
    })
  })

  describe('pruneVersions', () => {
    it('should delete oldest versions exceeding maxVersions', async () => {
      const versionDir = path.join(vaultPath, '.versions', 'test.md')
      await fs.mkdir(versionDir, { recursive: true })

      await fs.writeFile(path.join(versionDir, '20240101T100000000.md'), 'v1')
      await fs.writeFile(path.join(versionDir, '20240102T100000000.md'), 'v2')
      await fs.writeFile(path.join(versionDir, '20240103T100000000.md'), 'v3')
      await fs.writeFile(path.join(versionDir, '20240104T100000000.md'), 'v4')
      await fs.writeFile(path.join(versionDir, '20240105T100000000.md'), 'v5')

      const pruned = await service.pruneVersions('test-vault', 'test.md', 3)

      expect(pruned).toBe(2)

      const remaining = await service.listVersions('test-vault', 'test.md')
      expect(remaining).toHaveLength(3)
      // Newest 3 should remain
      expect(remaining[0]!.timestamp).toBe('20240105T100000000')
      expect(remaining[1]!.timestamp).toBe('20240104T100000000')
      expect(remaining[2]!.timestamp).toBe('20240103T100000000')
    })

    it('should return 0 when versions are within limit', async () => {
      const versionDir = path.join(vaultPath, '.versions', 'test.md')
      await fs.mkdir(versionDir, { recursive: true })

      await fs.writeFile(path.join(versionDir, '20240101T100000000.md'), 'v1')

      const pruned = await service.pruneVersions('test-vault', 'test.md', 5)
      expect(pruned).toBe(0)
    })

    it('should return 0 for non-existent version directory', async () => {
      const pruned = await service.pruneVersions('test-vault', 'nonexistent.md', 5)
      expect(pruned).toBe(0)
    })
  })

  describe('moveVersions', () => {
    it('should rename version directory from old path to new path', async () => {
      const oldVersionDir = path.join(vaultPath, '.versions', 'old/path.md')
      await fs.mkdir(oldVersionDir, { recursive: true })
      await fs.writeFile(path.join(oldVersionDir, '20240101T100000000.md'), 'v1')

      await service.moveVersions('test-vault', 'old/path.md', 'new/path.md')

      // Old dir should not exist
      await expect(fs.access(oldVersionDir)).rejects.toThrow()

      // New dir should exist with the version
      const newVersionDir = path.join(vaultPath, '.versions', 'new/path.md')
      const entries = await fs.readdir(newVersionDir)
      expect(entries).toContain('20240101T100000000.md')
    })

    it('should no-op if old version directory does not exist', async () => {
      // Should not throw
      await service.moveVersions('test-vault', 'nonexistent.md', 'new.md')
    })

    it('should no-op for invalid vault', async () => {
      // Should not throw
      await service.moveVersions('nonexistent-vault', 'old.md', 'new.md')
    })
  })

  describe('deleteVersions', () => {
    it('should remove all versions for a file', async () => {
      const versionDir = path.join(vaultPath, '.versions', 'test.md')
      await fs.mkdir(versionDir, { recursive: true })
      await fs.writeFile(path.join(versionDir, '20240101T100000000.md'), 'v1')
      await fs.writeFile(path.join(versionDir, '20240102T100000000.md'), 'v2')

      await service.deleteVersions('test-vault', 'test.md')

      await expect(fs.access(versionDir)).rejects.toThrow()
    })

    it('should not throw for non-existent version directory', async () => {
      await service.deleteVersions('test-vault', 'nonexistent.md')
    })
  })
})
