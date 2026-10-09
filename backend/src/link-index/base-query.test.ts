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
})
