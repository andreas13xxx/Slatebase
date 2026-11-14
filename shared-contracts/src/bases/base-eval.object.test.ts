import { describe, it, expect } from 'vitest'
import { filterRows, evaluateFormulaColumn, wireRowToBaseRow } from './base-eval.js'
import type { BaseDocument, BaseQueryRowWire } from './types.js'

const wire = (path: string, values: Record<string, string[]>, extra: Partial<BaseQueryRowWire> = {}): BaseQueryRowWire => ({
  path,
  fileName: path.replace(/^.*\//, '').replace(/\.md$/, ''),
  values,
  ...extra,
})

const row = (values: Record<string, string[]>, listKeys?: string[]) =>
  wireRowToBaseRow(wire('Tasks/a.md', values, { ctime: 1, folder: 'Tasks' }), listKeys ? new Set(listKeys) : undefined)

const evalFormula = (formula: string, r = row({ status: ['open'], tags: ['a', 'b'], prio: ['3'] }), thisRow = undefined as ReturnType<typeof row> | undefined) => {
  const doc: BaseDocument = { formulas: { f: formula }, views: [] }
  const res = evaluateFormulaColumn(doc, r, 'f', thisRow)
  if (!res.ok) throw new Error(res.error)
  return res.value
}

describe('file.properties', () => {
  it('is an object of the row\'s properties, without the file.* metadata', () => {
    expect(evalFormula('file.properties.keys()')).toEqual(['status', 'tags', 'prio'])
    expect(evalFormula('file.properties.isEmpty()')).toBe(false)
    expect(evalFormula('file.properties.isType("object")')).toBe(true)
  })

  it('reads values like note.<key>: a one-element list is a single value unless the key is a list key', () => {
    expect(evalFormula('file.properties.status')).toBe('open')
    expect(evalFormula('file.properties["status"]')).toBe('open')
    expect(evalFormula('file.properties.tags')).toEqual(['a', 'b'])
    const listy = row({ status: ['open'], cats: ['only'] }, ['cats'])
    expect(evalFormula('file.properties.cats', listy)).toEqual(['only'])
    expect(evalFormula('note.cats', listy)).toEqual(['only'])
  })

  it('is empty for a note without properties', () => {
    expect(evalFormula('file.properties.isEmpty()', row({}))).toBe(true)
  })

  it('has the compact JSON text form', () => {
    expect(evalFormula('file.properties.toString()', row({ status: ['open'], n: ['1', '2'] }))).toBe('{"status":"open","n":["1","2"]}')
  })

  it('works in filters', () => {
    const doc: BaseDocument = { filters: 'file.properties.status == "open"', views: [] }
    const rows = [wire('a.md', { status: ['open'] }), wire('b.md', { status: ['done'] })]
    const { rows: out } = filterRows(rows, doc, { type: 'table' })
    expect(out.map((r) => r.path)).toEqual(['a.md'])
  })
})

describe('this.file.properties', () => {
  const host = row({ project: ['alpha'], tags: ['x', 'y'] })

  it('reads the host note\'s properties', () => {
    expect(evalFormula('this.file.properties.project', row({ project: ['beta'] }), host)).toBe('alpha')
    expect(evalFormula('this.file.properties.keys()', row({}), host)).toEqual(['project', 'tags'])
  })

  it('is null without a host', () => {
    expect(evalFormula('this.file.properties', row({}))).toBeNull()
    expect(evalFormula('this.file.properties.project', row({}))).toBeNull()
  })

  it('compares the two objects structurally', () => {
    const same = row({ project: ['alpha'], tags: ['x', 'y'] })
    expect(evalFormula('file.properties == this.file.properties', same, host)).toBe(true)
    expect(evalFormula('file.properties == this.file.properties', row({ project: ['beta'] }), host)).toBe(false)
  })
})
