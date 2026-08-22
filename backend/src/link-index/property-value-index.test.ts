// Unit tests for the inverse property-value-index and query methods on LinkIndexService.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { LinkIndexService } from './link-index-service.js'
import type { PropertyFilter } from './types.js'
import type { ILogger } from '../logger/index.js'

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createMockLogger(),
  } as unknown as ILogger
}

describe('Property Value Index', () => {
  let tempDir: string
  let service: LinkIndexService
  const logger = createMockLogger()

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prop-value-idx-'))
    service = new LinkIndexService(tempDir, 'test-vault', 'Test Vault', logger)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  // ─── Setup Helper ──────────────────────────────────────────────────────────

  async function setupVault(): Promise<void> {
    await fs.writeFile(path.join(tempDir, 'project-a.md'), '---\nstatus: active\npriority: 1\ntags: [work, urgent]\n---\n# Project A')
    await fs.writeFile(path.join(tempDir, 'project-b.md'), '---\nstatus: done\npriority: 2\ntags: [work]\n---\n# Project B')
    await fs.writeFile(path.join(tempDir, 'note.md'), '---\nstatus: active\nauthor: Alice\n---\n# Note')
    await fs.writeFile(path.join(tempDir, 'empty.md'), '# No frontmatter')
    await service.rebuild()
  }

  // ─── getFilesByProperty ────────────────────────────────────────────────────

  describe('getFilesByProperty', () => {
    it('returns files with a given property key (no value filter)', async () => {
      await setupVault()
      const files = service.getFilesByProperty('status')
      expect(files.sort()).toEqual(['note.md', 'project-a.md', 'project-b.md'])
    })

    it('returns files with a specific key=value (case-insensitive)', async () => {
      await setupVault()
      const files = service.getFilesByProperty('status', 'Active')
      expect(files.sort()).toEqual(['note.md', 'project-a.md'])
    })

    it('returns empty array when key does not exist', async () => {
      await setupVault()
      expect(service.getFilesByProperty('nonexistent')).toEqual([])
    })

    it('returns empty array when value does not match', async () => {
      await setupVault()
      expect(service.getFilesByProperty('status', 'cancelled')).toEqual([])
    })

    it('is case-insensitive for key lookup', async () => {
      await setupVault()
      const files = service.getFilesByProperty('STATUS')
      expect(files.sort()).toEqual(['note.md', 'project-a.md', 'project-b.md'])
    })
  })

  // ─── getPropertyKeys ───────────────────────────────────────────────────────

  describe('getPropertyKeys', () => {
    it('returns all property keys sorted by count descending', async () => {
      await setupVault()
      const keys = service.getPropertyKeys()
      // status: 3 files, priority: 2 files, tags: 2 files, author: 1 file
      expect(keys[0]!.key).toBe('status')
      expect(keys[0]!.count).toBe(3)
      expect(keys.find(k => k.key === 'author')!.count).toBe(1)
    })

    it('returns empty array for empty vault', async () => {
      await service.rebuild()
      expect(service.getPropertyKeys()).toEqual([])
    })
  })

  // ─── getPropertyValues ─────────────────────────────────────────────────────

  describe('getPropertyValues', () => {
    it('returns values for a key sorted by count descending', async () => {
      await setupVault()
      const values = service.getPropertyValues('status')
      expect(values[0]).toEqual({ value: 'active', count: 2 })
      expect(values[1]).toEqual({ value: 'done', count: 1 })
    })

    it('returns empty array for unknown key', async () => {
      await setupVault()
      expect(service.getPropertyValues('nonexistent')).toEqual([])
    })

    it('respects the limit parameter', async () => {
      await setupVault()
      const values = service.getPropertyValues('status', 1)
      expect(values).toHaveLength(1)
      expect(values[0]!.value).toBe('active')
    })

    it('is case-insensitive for key', async () => {
      await setupVault()
      const values = service.getPropertyValues('STATUS')
      expect(values).toHaveLength(2)
    })
  })

  // ─── queryByProperties ─────────────────────────────────────────────────────

  describe('queryByProperties', () => {
    it('returns empty array for empty filters', async () => {
      await setupVault()
      expect(service.queryByProperties([])).toEqual([])
    })

    it('filters by eq operator', async () => {
      await setupVault()
      const filters: PropertyFilter[] = [{ key: 'status', operator: 'eq', value: 'done' }]
      const result = service.queryByProperties(filters)
      expect(result).toEqual(['project-b.md'])
    })

    it('filters by exists operator', async () => {
      await setupVault()
      const filters: PropertyFilter[] = [{ key: 'author', operator: 'exists' }]
      const result = service.queryByProperties(filters)
      expect(result).toEqual(['note.md'])
    })

    it('filters by not_exists operator', async () => {
      await setupVault()
      const filters: PropertyFilter[] = [{ key: 'author', operator: 'not_exists' }]
      const result = service.queryByProperties(filters)
      // All files with properties that DON'T have 'author': project-a.md, project-b.md
      expect(result.sort()).toEqual(['project-a.md', 'project-b.md'])
    })

    it('filters by neq operator', async () => {
      await setupVault()
      const filters: PropertyFilter[] = [{ key: 'status', operator: 'neq', value: 'active' }]
      const result = service.queryByProperties(filters)
      // Files with status key but value != 'active': project-b.md (status=done)
      expect(result).toEqual(['project-b.md'])
    })

    it('filters by contains operator', async () => {
      await setupVault()
      const filters: PropertyFilter[] = [{ key: 'status', operator: 'contains', value: 'act' }]
      const result = service.queryByProperties(filters)
      expect(result.sort()).toEqual(['note.md', 'project-a.md'])
    })

    it('combines multiple filters with AND', async () => {
      await setupVault()
      const filters: PropertyFilter[] = [
        { key: 'status', operator: 'eq', value: 'active' },
        { key: 'priority', operator: 'exists' },
      ]
      const result = service.queryByProperties(filters)
      // status=active AND has priority: only project-a.md
      expect(result).toEqual(['project-a.md'])
    })

    it('returns empty when AND filters have no intersection', async () => {
      await setupVault()
      const filters: PropertyFilter[] = [
        { key: 'status', operator: 'eq', value: 'done' },
        { key: 'author', operator: 'exists' },
      ]
      const result = service.queryByProperties(filters)
      expect(result).toEqual([])
    })

    // Explicit timeout: rebuild() has to read and parse every file, so this is
    // the one genuinely heavy case in the file. Under `test:coverage` with the
    // other workers running it lands just over vitest's 5s default (~5.3s), so
    // it failed only in full runs and passed in isolation. Writes go out
    // concurrently and the count is only just above the cap to keep the work
    // down; the timeout covers slower CI machines rather than masking a bug.
    it('caps results at 500', async () => {
      const FILE_COUNT = 520 // > 500 so the cap is exercised, without 600 files of parsing
      await Promise.all(
        Array.from({ length: FILE_COUNT }, (_, i) =>
          fs.writeFile(path.join(tempDir, `file-${i}.md`), `---\nbulk: yes\n---\n# File ${i}`),
        ),
      )
      await service.rebuild()

      const filters: PropertyFilter[] = [{ key: 'bulk', operator: 'exists' }]
      const result = service.queryByProperties(filters)
      expect(result.length).toBeLessThanOrEqual(500)
    }, 30000)
  })

  // ─── Inverse index consistency with updateFile/removeFile ──────────────────

  describe('inverse index consistency', () => {
    it('updateFile adds entries to inverse index', async () => {
      await service.rebuild()
      await service.updateFile('new.md', '---\ncolor: blue\n---\n# New')

      const files = service.getFilesByProperty('color', 'blue')
      expect(files).toEqual(['new.md'])
    })

    it('updateFile removes old entries from inverse index', async () => {
      await service.rebuild()
      await service.updateFile('file.md', '---\nstatus: open\n---\n# File')
      expect(service.getFilesByProperty('status', 'open')).toEqual(['file.md'])

      // Update with different value
      await service.updateFile('file.md', '---\nstatus: closed\n---\n# File')
      expect(service.getFilesByProperty('status', 'open')).toEqual([])
      expect(service.getFilesByProperty('status', 'closed')).toEqual(['file.md'])
    })

    it('removeFile removes entries from inverse index', async () => {
      await service.rebuild()
      await service.updateFile('file.md', '---\nstatus: active\n---\n# File')
      expect(service.getFilesByProperty('status', 'active')).toEqual(['file.md'])

      await service.removeFile('file.md')
      expect(service.getFilesByProperty('status', 'active')).toEqual([])
      expect(service.getFilesByProperty('status')).toEqual([])
    })

    it('renameFile moves entries in inverse index', async () => {
      await service.rebuild()
      await service.updateFile('old.md', '---\nstatus: active\n---\n# Old')
      expect(service.getFilesByProperty('status', 'active')).toEqual(['old.md'])

      await service.renameFile('old.md', 'new.md', '---\nstatus: active\n---\n# New')
      expect(service.getFilesByProperty('status', 'active')).toEqual(['new.md'])
    })
  })
})
