import { describe, it, expect, vi } from 'vitest'
import { buildQuerySpec, runBaseQuery } from './query-engine'
import type { BaseDocument, BaseView } from '@slatebase/shared-contracts'
import type { IApiClient } from '../api'

describe('buildQuerySpec', () => {
  const doc: BaseDocument = {
    filters: 'status == "open"',
    formulas: { days_left: 'today() - date(deadline)' },
    properties: { status: {}, priority: {}, days_left: {} },
    views: [],
  }

  it('takes columns from the view order, dropping file.* and formula columns', () => {
    const view: BaseView = { type: 'table', order: ['file.name', 'priority', 'days_left'] }
    const spec = buildQuerySpec(doc, view)
    // priority from order; status pulled in by the filter, deadline by the formula.
    expect(spec.columns.sort()).toEqual(['deadline', 'priority', 'status'])
  })

  it('falls back to the document property keys when the view has no order', () => {
    const view: BaseView = { type: 'table' }
    const spec = buildQuerySpec(doc, view)
    // days_left is a formula → excluded, but the property it reads (deadline) is fetched.
    expect(spec.columns.sort()).toEqual(['deadline', 'priority', 'status'])
  })

  it('pushes a conservative prefilter for a pushable expression', () => {
    const spec = buildQuerySpec(doc, { type: 'table', order: ['status'] })
    // `status == "open"` is a necessary condition → sent as an eq prefilter so
    // the backend narrows candidates before its cap; the full expression still
    // runs client-side.
    expect(spec.filters).toEqual({ property: 'status', op: 'eq', value: 'open' })
  })

  it('pushes no prefilter for an un-pushable expression', () => {
    const unpushable: BaseDocument = { ...doc, filters: 'status != "open"' }
    const spec = buildQuerySpec(unpushable, { type: 'table', order: ['status'] })
    expect('filters' in spec).toBe(false)
  })

  it('requests properties referenced only in the filter', () => {
    const d: BaseDocument = { filters: 'archived == false', properties: {}, views: [] }
    const spec = buildQuerySpec(d, { type: 'table', order: [] })
    expect(spec.columns).toContain('archived')
  })

  it('keeps a file.* sort but drops a formula-column sort', () => {
    const view: BaseView = {
      type: 'table',
      order: ['status'],
      sort: [
        { column: 'file.name', direction: 'asc' },
        { column: 'days_left', direction: 'desc' },
      ],
    }
    const spec = buildQuerySpec(doc, view)
    expect(spec.sort).toEqual([{ column: 'file.name', direction: 'asc' }])
  })

  it('does not push the view limit to the backend (it would cut rows before filtering)', () => {
    const spec = buildQuerySpec(doc, { type: 'table', order: ['status'], limit: 25 })
    expect(spec.limit).toBeUndefined()
  })

  it('adds a cards view groupBy property to the requested columns', () => {
    const view: BaseView = { type: 'cards', order: ['file.name'], groupBy: { property: 'status' } }
    const spec = buildQuerySpec(doc, view)
    expect(spec.columns).toContain('status')
  })

  it('ignores a groupBy on a file.* column', () => {
    const specFile = buildQuerySpec(doc, { type: 'cards', order: ['status'], groupBy: { property: 'file.name' } })
    expect(specFile.columns).not.toContain('file.name')
  })
})

describe('runBaseQuery — this (the host note)', () => {
  const candidates = [
    { path: 'a.md', fileName: 'a', values: { status: ['open'] }, links: ['Plan'] },
    { path: 'b.md', fileName: 'b', values: { status: ['done'] }, links: ['Other'] },
  ]
  const host = { path: 'Projekte/Plan.md', fileName: 'Plan', values: { status: ['open'] }, folder: 'Projekte' }

  /** A client that answers the host query (it carries a path filter) separately from the candidate query. */
  function makeClient(hostRows: unknown[] = [host]) {
    const queryBase = vi.fn().mockImplementation((_vault: string, spec: { filters?: { path?: string } }) =>
      Promise.resolve({ rows: spec.filters?.path !== undefined ? hostRows : candidates, total: 2 }))
    return { client: { queryBase } as unknown as IApiClient, queryBase }
  }

  it('filters candidates by a property of the host', async () => {
    const { client } = makeClient()
    const doc: BaseDocument = { filters: 'status == this.status', views: [] }

    const { rows } = await runBaseQuery(client, 'v1', doc, { type: 'table' }, 'Projekte/Plan.md')

    expect(rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('filters candidates that link to the host with file.hasLink(this.file)', async () => {
    const { client } = makeClient()
    const doc: BaseDocument = { filters: 'file.hasLink(this.file)', views: [] }

    const { rows } = await runBaseQuery(client, 'v1', doc, { type: 'table' }, 'Projekte/Plan.md')

    expect(rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('asks for the host with its path and only the columns the base reads', async () => {
    const { client, queryBase } = makeClient()
    const doc: BaseDocument = { filters: 'status == this.status', views: [] }

    await runBaseQuery(client, 'v1', doc, { type: 'table' }, 'Projekte/Plan.md')

    expect(queryBase).toHaveBeenCalledWith('v1', expect.objectContaining({ columns: ['status'], filters: { path: 'Projekte/Plan.md' } }))
  })

  it('makes no host query when the base never reads this', async () => {
    const { client, queryBase } = makeClient()

    await runBaseQuery(client, 'v1', { filters: 'status == "open"', views: [] }, { type: 'table' }, 'Projekte/Plan.md')

    expect(queryBase).toHaveBeenCalledTimes(1)
  })

  it('makes no host query without a host path, and this.* excludes every row', async () => {
    const { client, queryBase } = makeClient()
    const doc: BaseDocument = { filters: 'status == this.status', views: [] }

    const { rows } = await runBaseQuery(client, 'v1', doc, { type: 'table' })

    expect(queryBase).toHaveBeenCalledTimes(1)
    expect(rows).toEqual([])
  })

  it('excludes every row when the host is not in the index', async () => {
    const { client } = makeClient([])
    const doc: BaseDocument = { filters: 'status == this.status', views: [] }

    const { rows } = await runBaseQuery(client, 'v1', doc, { type: 'table' }, 'Projekte/Plan.md')

    expect(rows).toEqual([])
  })

  it('takes only the row with the exact host path when the backend glob matched more', async () => {
    const { client } = makeClient([
      { path: 'Projekte/Plan.md', fileName: 'Plan', values: { status: ['open'] } },
      { path: 'Projekte/Plan.md.bak', fileName: 'Plan.md', values: { status: ['done'] } },
    ])
    const doc: BaseDocument = { filters: 'status == this.status', views: [] }

    const { rows } = await runBaseQuery(client, 'v1', doc, { type: 'table' }, 'Projekte/Plan.md')

    expect(rows.map((r) => r.path)).toEqual(['a.md'])
  })
})

describe('runBaseQuery (client-side filtering)', () => {
  function makeApiClient(rows: Array<{ path: string; fileName: string; values: Record<string, string[]>; folder?: string; tags?: string[] }>): IApiClient {
    return {
      queryBase: vi.fn().mockResolvedValue({ rows, total: rows.length }),
    } as unknown as IApiClient
  }

  it('filters rows by a document expression filter', async () => {
    const doc: BaseDocument = { filters: 'status == "open"', properties: { status: {} }, views: [] }
    const view: BaseView = { type: 'table', order: ['status'] }
    const api = makeApiClient([
      { path: 'a.md', fileName: 'A', values: { status: ['open'] } },
      { path: 'b.md', fileName: 'B', values: { status: ['done'] } },
    ])
    const { rows } = await runBaseQuery(api, 'v1', doc, view)
    expect(rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('evaluates a file.folder condition', async () => {
    const doc: BaseDocument = { filters: 'file.folder == "Tasks"', views: [] }
    const view: BaseView = { type: 'table', order: [] }
    const api = makeApiClient([
      { path: 'Tasks/a.md', fileName: 'A', values: {}, folder: 'Tasks' },
      { path: 'b.md', fileName: 'B', values: {}, folder: '' },
    ])
    const { rows } = await runBaseQuery(api, 'v1', doc, view)
    expect(rows.map((r) => r.path)).toEqual(['Tasks/a.md'])
  })

  it('applies the view filter on top of the document filter', async () => {
    const doc: BaseDocument = { filters: 'status == "open"', views: [] }
    const view: BaseView = { type: 'table', order: [], filters: 'priority == "high"' }
    const api = makeApiClient([
      { path: 'a.md', fileName: 'A', values: { status: ['open'], priority: ['high'] } },
      { path: 'b.md', fileName: 'B', values: { status: ['open'], priority: ['low'] } },
    ])
    const { rows } = await runBaseQuery(api, 'v1', doc, view)
    expect(rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('applies the view limit after filtering and reports the pre-limit total', async () => {
    const doc: BaseDocument = { filters: 'status == "open"', views: [] }
    const view: BaseView = { type: 'table', order: [], limit: 1 }
    const api = makeApiClient([
      { path: 'a.md', fileName: 'A', values: { status: ['done'] } },
      { path: 'b.md', fileName: 'B', values: { status: ['open'] } },
      { path: 'c.md', fileName: 'C', values: { status: ['open'] } },
    ])
    const { rows, total } = await runBaseQuery(api, 'v1', doc, view)
    expect(rows.map((r) => r.path)).toEqual(['b.md'])
    expect(total).toBe(2)
  })
})
