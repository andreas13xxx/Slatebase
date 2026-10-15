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
