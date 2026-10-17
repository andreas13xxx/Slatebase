// Unit tests for LinkIndexService.queryForBase — the Bases query engine:
// nested AND/OR filters over properties/tags/path/file-metadata, multi-column
// sort, and per-row column value extraction.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { LinkIndexService } from './link-index-service.js'
import type { BaseQuerySpec } from './types.js'
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

describe('LinkIndexService.queryForBase', () => {
  let tempDir: string
  let service: LinkIndexService
  const logger = createMockLogger()

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'base-query-'))
    service = new LinkIndexService(tempDir, 'test-vault', 'Test Vault', logger)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function setupVault(): Promise<void> {
    await fs.mkdir(path.join(tempDir, 'Tasks'), { recursive: true })
    await fs.writeFile(
      path.join(tempDir, 'Tasks', 'a.md'),
      '---\ntype: task\nstatus: open\npriority: 3\ntags: [urgent]\n---\n# A',
    )
    await fs.writeFile(
      path.join(tempDir, 'Tasks', 'b.md'),
      '---\ntype: task\nstatus: done\npriority: 1\n---\n# B',
    )
    await fs.writeFile(
      path.join(tempDir, 'Tasks', 'c.md'),
      '---\ntype: task\nstatus: open\npriority: 2\n---\n# C',
    )
    await fs.writeFile(
      path.join(tempDir, 'note.md'),
      '---\ntype: note\n---\n# Not a task',
    )
    await service.rebuild()
  }

  it('filters by a single property equality', async () => {
    await setupVault()
    const spec: BaseQuerySpec = {
      filters: { property: 'type', op: 'eq', value: 'task' },
      columns: ['status'],
    }
    const result = await service.queryForBase(spec)
    expect(result.total).toBe(3)
    expect(result.rows.map((r) => r.path).sort()).toEqual(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md'])
  })

  it('evaluates a nested AND/OR filter tree', async () => {
    await setupVault()
    const spec: BaseQuerySpec = {
      filters: {
        and: [
          { property: 'type', op: 'eq', value: 'task' },
          { or: [{ property: 'status', op: 'eq', value: 'open' }, { tag: 'urgent' }] },
        ],
      },
      columns: ['status'],
    }
    const result = await service.queryForBase(spec)
    // a (open + urgent) and c (open); b is done without the urgent tag.
    expect(result.rows.map((r) => r.path).sort()).toEqual(['Tasks/a.md', 'Tasks/c.md'])
  })

  it('supports a path glob filter', async () => {
    await setupVault()
    const spec: BaseQuerySpec = {
      filters: { path: 'Tasks/**' },
      columns: [],
    }
    const result = await service.queryForBase(spec)
    expect(result.rows.map((r) => r.path).sort()).toEqual(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md'])
  })

  it('supports a negated condition', async () => {
    await setupVault()
    const spec: BaseQuerySpec = {
      filters: { and: [{ property: 'type', op: 'eq', value: 'task' }, { property: 'status', op: 'eq', value: 'done', not: true }] },
      columns: [],
    }
    const result = await service.queryForBase(spec)
    expect(result.rows.map((r) => r.path).sort()).toEqual(['Tasks/a.md', 'Tasks/c.md'])
  })

  it('sorts by a numeric property descending with a stable path tiebreak', async () => {
    await setupVault()
    const spec: BaseQuerySpec = {
      filters: { property: 'type', op: 'eq', value: 'task' },
      columns: ['priority'],
      sort: [{ column: 'priority', direction: 'desc' }],
    }
    const result = await service.queryForBase(spec)
    expect(result.rows.map((r) => r.path)).toEqual(['Tasks/a.md', 'Tasks/c.md', 'Tasks/b.md'])
  })

  it('returns requested column values per row', async () => {
    await setupVault()
    const spec: BaseQuerySpec = {
      filters: { property: 'status', op: 'eq', value: 'open' },
      columns: ['status', 'priority'],
      sort: [{ column: 'file.name', direction: 'asc' }],
    }
    const result = await service.queryForBase(spec)
    expect(result.rows[0]?.values['status']).toEqual(['open'])
    expect(result.rows[0]?.fileName).toBe('a')
  })

  it('includes every visible note when no filter is given', async () => {
    await setupVault()
    const result = await service.queryForBase({ columns: [] })
    expect(result.total).toBe(4)
  })

  it('applies the limit while reporting the full total', async () => {
    await setupVault()
    const result = await service.queryForBase({ filters: { property: 'type', op: 'eq', value: 'task' }, columns: [], limit: 2 })
    expect(result.total).toBe(3)
    expect(result.rows).toHaveLength(2)
  })

  it('flags truncated when matches exceed the limit', async () => {
    await setupVault()
    const result = await service.queryForBase({ filters: { property: 'type', op: 'eq', value: 'task' }, columns: [], limit: 2 })
    expect(result.truncated).toBe(true)
  })

  it('does not flag truncated when all matches fit', async () => {
    await setupVault()
    const result = await service.queryForBase({ filters: { property: 'type', op: 'eq', value: 'task' }, columns: [], limit: 10 })
    expect(result.truncated).toBe(false)
  })

  it('populates file-metadata fields (ext/folder/tags) on each row', async () => {
    await setupVault()
    const result = await service.queryForBase({ filters: { path: 'Tasks/a.md' }, columns: [] })
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]!
    expect(row.ext).toBe('md')
    expect(row.folder).toBe('Tasks')
    expect(row.tags).toEqual(['urgent'])
  })

  it('reports an empty folder for a vault-root file', async () => {
    await setupVault()
    const result = await service.queryForBase({ filters: { path: 'note.md' }, columns: [] })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.folder).toBe('')
  })

  describe('observed list keys (R2)', () => {
    it('reports a property observed with two or more values as a list key', async () => {
      await fs.writeFile(
        path.join(tempDir, 'multi.md'),
        '---\nauthors: [Ada, Bob]\nstatus: open\n---\n# Multi',
      )
      await service.rebuild()
      const result = await service.queryForBase({ columns: [] })
      expect(result.listKeys).toContain('authors')
      // A single-valued scalar property is NOT reported as a list key.
      expect(result.listKeys).not.toContain('status')
    })

    it('omits listKeys entries when no property has multiple values', async () => {
      await fs.writeFile(path.join(tempDir, 'solo.md'), '---\nstatus: open\n---\n# Solo')
      await service.rebuild()
      const result = await service.queryForBase({ columns: [] })
      expect(result.listKeys).toEqual([])
    })

    it('invalidates the cached list keys after a mutation adds a multi-value property', async () => {
      await fs.writeFile(path.join(tempDir, 'note.md'), '---\nstatus: open\n---\n# Note')
      await service.rebuild()
      // First query: no multi-value property yet.
      expect((await service.queryForBase({ columns: [] })).listKeys).not.toContain('authors')
      // A mutation introduces a two-value property; the memo must be invalidated.
      await service.updateFile('note.md', '---\nauthors: [Ada, Bob]\nstatus: open\n---\n# Note')
      expect((await service.queryForBase({ columns: [] })).listKeys).toContain('authors')
    })

    it('returns a fresh listKeys array so a caller mutating it cannot corrupt the cache', async () => {
      await fs.writeFile(path.join(tempDir, 'multi.md'), '---\nauthors: [Ada, Bob]\n---\n# Multi')
      await service.rebuild()
      const first = await service.queryForBase({ columns: [] })
      // The route layer unions declared keys into this array in place.
      first.listKeys!.push('injected-by-route')
      const second = await service.queryForBase({ columns: [] })
      expect(second.listKeys).toContain('authors')
      expect(second.listKeys).not.toContain('injected-by-route')
    })
  })

  describe('file.size and file.backlinks (R4)', () => {
    it('populates file.size when requested via fileColumns', async () => {
      await fs.writeFile(path.join(tempDir, 'big.md'), '---\ntype: note\n---\n# Big\n' + 'x'.repeat(2000))
      await service.rebuild()
      const result = await service.queryForBase({ columns: [], fileColumns: ['file.size'] })
      const row = result.rows.find((r) => r.path === 'big.md')!
      expect(row.size).toBeGreaterThan(2000)
    })

    it('does NOT stat for size when file.size is not referenced', async () => {
      await fs.writeFile(path.join(tempDir, 'plain.md'), '---\ntype: note\n---\n# Plain')
      await service.rebuild()
      const result = await service.queryForBase({ columns: [] })
      const row = result.rows.find((r) => r.path === 'plain.md')!
      expect(row.size).toBeUndefined()
    })

    it('populates backlinks from the reverse map (always, cheap)', async () => {
      await fs.writeFile(path.join(tempDir, 'target.md'), '# Target')
      await fs.writeFile(path.join(tempDir, 'source.md'), '# Source\n[[target]]')
      await service.rebuild()
      const result = await service.queryForBase({ columns: [] })
      const target = result.rows.find((r) => r.path === 'target.md')!
      expect(target.backlinks).toContain('source.md')
    })
  })
})
