import { describe, it, expect } from 'vitest'
import { computeSummaries } from './summaries.js'
import type { BaseDocument, BaseRow, BaseView } from './types.js'

const row = (values: Record<string, unknown>): BaseRow => ({ path: 'x.md', fileName: 'x', values })

const doc: BaseDocument = { views: [] }

function run(rows: BaseRow[], summaries: Record<string, string>): Record<string, unknown> {
  const view: BaseView = { type: 'table', summaries }
  const out = computeSummaries(rows, view, doc)
  const flat: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(out)) flat[k] = v.value
  return flat
}

describe('computeSummaries — all-type aggregates', () => {
  const rows = [row({ s: 'a' }), row({ s: '' }), row({ s: 'a' }), row({})]

  it('counts rows, empties and filled', () => {
    expect(run(rows, { s: 'Count' })).toEqual({ s: 4 })
    expect(run(rows, { s: 'Empty' })).toEqual({ s: 2 }) // '' and missing
    expect(run(rows, { s: 'Filled' })).toEqual({ s: 2 })
  })

  it('counts unique non-empty values', () => {
    expect(run(rows, { s: 'Unique' })).toEqual({ s: 1 }) // only 'a'
  })

  it('is case-insensitive on the summary name', () => {
    expect(run(rows, { s: 'count' })).toEqual({ s: 4 })
    expect(run(rows, { s: 'FILLED' })).toEqual({ s: 2 })
  })
})

describe('computeSummaries — numeric aggregates', () => {
  const rows = [row({ n: 2 }), row({ n: 4 }), row({ n: 9 }), row({ n: 'x' })]

  it('sums numbers, ignoring non-numeric', () => {
    expect(run(rows, { n: 'Sum' })).toEqual({ n: 15 })
  })

  it('averages numbers', () => {
    expect(run(rows, { n: 'Average' })).toEqual({ n: 5 })
  })

  it('computes min, max, range', () => {
    expect(run(rows, { n: 'Min' })).toEqual({ n: 2 })
    expect(run(rows, { n: 'Max' })).toEqual({ n: 9 })
    expect(run(rows, { n: 'Range' })).toEqual({ n: 7 })
  })

  it('computes median for odd and even counts', () => {
    expect(run(rows, { n: 'Median' })).toEqual({ n: 4 }) // [2,4,9] → 4
    expect(run([row({ n: 1 }), row({ n: 3 })], { n: 'Median' })).toEqual({ n: 2 })
  })

  it('parses numeric strings', () => {
    expect(run([row({ n: '10' }), row({ n: '20' })], { n: 'Sum' })).toEqual({ n: 30 })
  })

  it('returns null for average/min/max on a non-numeric column (no error)', () => {
    const text = [row({ t: 'a' }), row({ t: 'b' })]
    expect(run(text, { t: 'Average' })).toEqual({ t: null })
    expect(run(text, { t: 'Min' })).toEqual({ t: null })
    // Sum of no numbers is 0 (an additive identity), count-like aggregates still work.
    expect(run(text, { t: 'Sum' })).toEqual({ t: 0 })
  })
})

describe('computeSummaries — empty set', () => {
  it('returns 0 for counts and null for numeric aggregates', () => {
    expect(run([], { n: 'Count' })).toEqual({ n: 0 })
    expect(run([], { n: 'Sum' })).toEqual({ n: 0 })
    expect(run([], { n: 'Average' })).toEqual({ n: null })
    expect(run([], { n: 'Min' })).toEqual({ n: null })
  })
})

describe('computeSummaries — dates', () => {
  const rows = [row({ d: '2024-01-01' }), row({ d: '2024-01-11' }), row({ d: 'nope' })]

  it('computes earliest and latest', () => {
    const out = run(rows, { d: 'Earliest' }) as { d: Date }
    expect(out.d).toBeInstanceOf(Date)
    expect((out.d as Date).toISOString().slice(0, 10)).toBe('2024-01-01')
    const latest = run(rows, { d: 'Latest' }) as { d: Date }
    expect((latest.d as Date).toISOString().slice(0, 10)).toBe('2024-01-11')
  })

  it('computes a date range in days when the column is non-numeric', () => {
    expect(run(rows, { d: 'Range' })).toEqual({ d: 10 })
  })
})

describe('computeSummaries — checkbox', () => {
  const rows = [row({ c: true }), row({ c: false }), row({ c: 'true' }), row({})]

  it('counts checked and unchecked', () => {
    expect(run(rows, { c: 'Checked' })).toEqual({ c: 2 }) // true, 'true'
    expect(run(rows, { c: 'Unchecked' })).toEqual({ c: 1 }) // false; missing is neither
  })
})

describe('computeSummaries — robustness', () => {
  it('returns null for an unknown summary name, never throws', () => {
    expect(run([row({ n: 1 })], { n: 'Bogus' })).toEqual({ n: null })
  })

  it('returns an empty object when the view assigns no summaries', () => {
    expect(computeSummaries([row({ n: 1 })], { type: 'table' }, doc)).toEqual({})
  })

  it('summarises a formula column', () => {
    const d: BaseDocument = { formulas: { total: 'price * 2' }, views: [] }
    const rows = [row({ price: 3 }), row({ price: 5 })]
    const view: BaseView = { type: 'table', summaries: { total: 'Sum' } }
    expect(computeSummaries(rows, view, d).total!.value).toBe(16) // 6 + 10
  })
})
