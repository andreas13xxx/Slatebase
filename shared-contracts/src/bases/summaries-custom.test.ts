import { describe, it, expect } from 'vitest'
import { computeSummaries } from './summaries.js'
import type { BaseDocument, BaseRow, BaseView } from './types.js'

const row = (values: Record<string, unknown>): BaseRow => ({ path: 'x.md', fileName: 'x', values })
const rows = [row({ n: '1' }), row({ n: '2' }), row({ n: '4' })]

function run(docSummaries: Record<string, string>, name: string) {
  const doc: BaseDocument = { views: [], summaries: docSummaries }
  const view: BaseView = { type: 'table', summaries: { n: name } }
  return computeSummaries(rows, view, doc)['n']?.value
}

describe('custom summaries', () => {
  it('evaluates a formula over `values`', () => {
    expect(run({ total: 'values.reduce(acc + value, 0)' }, 'total')).toBe(7)
    expect(run({ customAverage: 'values.mean().round(1)' }, 'customAverage')).toBe(2.3)
    expect(run({ big: 'values.filter(value > 1).length' }, 'big')).toBe(2)
  })

  it('a custom name wins over nothing, built-ins still work', () => {
    expect(run({}, 'Sum')).toBe(7)
  })

  it('a failing formula yields null, never throws', () => {
    expect(run({ bad: 'values.nope()' }, 'bad')).toBeNull()
  })
})
