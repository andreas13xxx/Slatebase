import { describe, it, expect } from 'vitest'
import { sortRowsByFormula } from './base-formula-sort'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'

const row = (name: string, values: Record<string, unknown>): BaseRow => ({ path: `${name}.md`, fileName: name, values })

const doc: BaseDocument = { formulas: { total: 'price * qty' }, views: [] }

const rows: BaseRow[] = [
  row('a', { price: 2, qty: 3 }), // 6
  row('b', { price: 5, qty: 1 }), // 5
  row('c', { price: 4, qty: 2 }), // 8
]

describe('sortRowsByFormula', () => {
  it('sorts ascending by the formula value', () => {
    const view: BaseView = { type: 'table', sort: [{ column: 'formula.total', direction: 'asc' }] }
    expect(sortRowsByFormula(rows, doc, view).map((r) => r.fileName)).toEqual(['b', 'a', 'c'])
  })

  it('sorts descending by the formula value', () => {
    const view: BaseView = { type: 'table', sort: [{ column: 'total', direction: 'desc' }] }
    expect(sortRowsByFormula(rows, doc, view).map((r) => r.fileName)).toEqual(['c', 'a', 'b'])
  })

  it('leaves rows untouched for a non-formula sort column', () => {
    const view: BaseView = { type: 'table', sort: [{ column: 'price', direction: 'asc' }] }
    expect(sortRowsByFormula(rows, doc, view)).toBe(rows)
  })

  it('leaves rows untouched when there is no sort', () => {
    expect(sortRowsByFormula(rows, doc, { type: 'table' })).toBe(rows)
  })

  it('is stable on ties', () => {
    const d: BaseDocument = { formulas: { k: 'price' }, views: [] }
    const r = [row('x', { price: 1 }), row('y', { price: 1 }), row('z', { price: 1 })]
    const view: BaseView = { type: 'table', sort: [{ column: 'formula.k', direction: 'asc' }] }
    expect(sortRowsByFormula(r, d, view).map((e) => e.fileName)).toEqual(['x', 'y', 'z'])
  })

  it('sorts error/empty values last when ascending', () => {
    const d: BaseDocument = { formulas: { k: 'score' }, views: [] }
    const r = [row('ok', { score: 5 }), row('bad', {})] // bad: score missing → null
    const view: BaseView = { type: 'table', sort: [{ column: 'formula.k', direction: 'asc' }] }
    expect(sortRowsByFormula(r, d, view).map((e) => e.fileName)).toEqual(['ok', 'bad'])
  })
})
