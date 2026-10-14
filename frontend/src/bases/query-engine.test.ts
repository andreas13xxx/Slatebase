import { describe, it, expect, vi } from 'vitest'
import { buildQuerySpec, runBaseQuery } from './query-engine'
import type { BaseDocument, BaseView } from './types'
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
    // priority from order; status pulled in because the filter references it.
    expect(spec.columns.sort()).toEqual(['priority', 'status'])
  })

  it('falls back to the document property keys when the view has no order', () => {
    const view: BaseView = { type: 'table' }
    const spec = buildQuerySpec(doc, view)
    // days_left is a formula → excluded; status/priority remain.
    expect(spec.columns.sort()).toEqual(['priority', 'status'])
  })

  it('does NOT push the filter to the backend (client-side evaluation)', () => {
    const spec = buildQuerySpec(doc, { type: 'table', order: ['status'] })
    expect(spec.filters).toBeUndefined()
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

  it('passes the view limit through', () => {
    const spec = buildQuerySpec(doc, { type: 'table', order: ['status'], limit: 25 })
    expect(spec.limit).toBe(25)
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
})
