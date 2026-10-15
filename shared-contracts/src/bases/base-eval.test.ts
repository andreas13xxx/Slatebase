import { describe, it, expect } from 'vitest'
import { buildQuerySpec, filterRows, evaluateFormulaColumn } from './base-eval.js'
import type { BaseDocument, BaseQueryRowWire, BaseRow } from './types.js'

const wire = (path: string, values: Record<string, string[]>, extra: Partial<BaseQueryRowWire> = {}): BaseQueryRowWire => ({
  path,
  fileName: path.replace(/^.*\//, '').replace(/\.md$/, ''),
  values,
  ...extra,
})

describe('buildQuerySpec', () => {
  it('never pushes the view limit to the backend', () => {
    const spec = buildQuerySpec({ views: [] }, { type: 'table', order: ['status'], limit: 5 })
    expect(spec.limit).toBeUndefined()
  })
})

describe('buildQuerySpec filter references', () => {
  it('requests the receiver property of a method-call filter, not "prop.method"', () => {
    const doc: BaseDocument = { filters: { and: ['title.contains("x")', 'price.toFixed(2) > 1', 'file.hasTag("t")'] }, views: [] }
    const spec = buildQuerySpec(doc, { type: 'table', order: [] })
    expect(spec.columns.sort()).toEqual(['price', 'title'])
  })

  it('requests properties read by formulas, but not formula.* references', () => {
    const doc: BaseDocument = { formulas: { double: 'price * 2', plus: 'formula.double + 1' }, views: [] }
    const spec = buildQuerySpec(doc, { type: 'table', order: ['formula.plus'] })
    expect(spec.columns).toEqual(['price'])
  })

  it('ignores identifiers inside quoted strings but keeps real references', () => {
    const doc: BaseDocument = { filters: `status == "other_prop" && 'x y' != prio`, views: [] }
    const spec = buildQuerySpec(doc, { type: 'table', order: [] })
    expect(spec.columns.sort()).toEqual(['prio', 'status'])
  })

  it('stays fast on a long unterminated string with many escaped quotes', () => {
    const doc: BaseDocument = { filters: '"' + '\\"'.repeat(50_000), views: [] }
    const t0 = Date.now()
    buildQuerySpec(doc, { type: 'table', order: [] })
    expect(Date.now() - t0).toBeLessThan(500)
  })
})

describe('filterRows', () => {
  const doc: BaseDocument = { filters: 'status == "open"', views: [] }

  it('filters first, then applies the view limit and reports the pre-limit total', () => {
    const rows = [
      wire('a.md', { status: ['done'] }),
      wire('b.md', { status: ['open'] }),
      wire('c.md', { status: ['open'] }),
    ]
    const out = filterRows(rows, doc, { type: 'table', limit: 1 })
    expect(out.rows.map((r) => r.path)).toEqual(['b.md'])
    expect(out.total).toBe(2)
  })

  it('matches a method-call filter on the fetched property value end to end', () => {
    const rows = [wire('a.md', { title: ['Plan A'] }), wire('b.md', { title: ['Notes'] })]
    const d: BaseDocument = { filters: 'title.contains("Plan")', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('file.inFolder("") matches nothing', () => {
    const rows = [wire('root.md', {}, { folder: '' }), wire('Tasks/a.md', {}, { folder: 'Tasks' })]
    const d: BaseDocument = { filters: 'file.inFolder("")', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows).toEqual([])
  })

  it('folds file metadata into file.* values and honours file.hasTag / file.inFolder', () => {
    const rows = [
      wire('Tasks/a.md', {}, { folder: 'Tasks', tags: ['urgent'], ext: 'md' }),
      wire('b.md', {}, { folder: '', tags: [], ext: 'md' }),
    ]
    const d: BaseDocument = { filters: { and: ['file.hasTag("urgent")', 'file.inFolder("Tasks")'] }, views: [] }
    const out = filterRows(rows, d, { type: 'table' })
    expect(out.rows.map((r) => r.path)).toEqual(['Tasks/a.md'])
    expect(out.rows[0]?.values['file.ext']).toBe('md')
  })
})

describe('filters over formulas, lists and file fields', () => {
  it('filters on a formula value', () => {
    const rows = [wire('a.md', { due: ['2000-01-01'] }), wire('b.md', { due: ['2999-01-01'] })]
    const d: BaseDocument = { formulas: { overdue: 'date(due) < today()' }, filters: 'formula.overdue', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows.map((r) => r.path)).toEqual(['a.md'])
  })

  it('keeps tags/aliases and file.tags/links lists even with a single entry', () => {
    const rows = [
      wire('one.md', { tags: ['urgent'] }, { tags: ['urgent'] }),
      wire('two.md', { tags: ['urgent', 'home'] }, { tags: ['urgent', 'home'] }),
    ]
    // exact element match, identical behaviour for one and two entries
    const d: BaseDocument = { filters: 'tags.contains("urg")', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows).toEqual([])
    const lengths = filterRows(rows, { filters: 'file.tags.length >= 1', views: [] }, { type: 'table' })
    expect(lengths.rows.map((r) => r.path)).toEqual(['one.md', 'two.md'])
    const one = filterRows(rows, { filters: 'tags.length == 1', views: [] }, { type: 'table' })
    expect(one.rows.map((r) => r.path)).toEqual(['one.md'])
  })

  it('exposes file.path and file.basename', () => {
    const rows = [wire('Projects/a.md', {}), wire('Other/b.md', {})]
    const d: BaseDocument = { filters: 'file.path.startsWith("Projects/") && file.basename == "a"', views: [] }
    expect(filterRows(rows, d, { type: 'table' }).rows.map((r) => r.path)).toEqual(['Projects/a.md'])
  })

  it('collects refs from note["..."] indexing', () => {
    const d: BaseDocument = { filters: 'note["due-date"] != ""', views: [] }
    expect(buildQuerySpec(d, { type: 'table', order: [] }).columns).toEqual(['due-date'])
  })
})

describe('evaluateFormulaColumn', () => {
  const row: BaseRow = { path: 'a.md', fileName: 'a', values: { price: 4 } }

  it('evaluates a formula over row values', () => {
    const doc: BaseDocument = { formulas: { double: 'price * 2' }, views: [] }
    expect(evaluateFormulaColumn(doc, row, 'double')).toEqual({ ok: true, value: 8 })
  })

  it('resolves formula.x references to other formulas', () => {
    const doc: BaseDocument = { formulas: { double: 'price * 2', plus: 'formula.double + 1' }, views: [] }
    expect(evaluateFormulaColumn(doc, row, 'plus')).toEqual({ ok: true, value: 9 })
  })

  it('reports a cycle as an error instead of recursing', () => {
    const doc: BaseDocument = { formulas: { a: 'formula.b', b: 'formula.a' }, views: [] }
    const r = evaluateFormulaColumn(doc, row, 'a')
    expect(r.ok).toBe(false)
  })

  it('reports an unknown formula id', () => {
    expect(evaluateFormulaColumn({ views: [] }, row, 'nope').ok).toBe(false)
  })
})
