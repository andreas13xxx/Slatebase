import { describe, it, expect } from 'vitest'
import type { BaseRow } from '@slatebase/shared-contracts'
import { filterRowsByText } from './base-row-search'

const rows: BaseRow[] = [
  { path: 'a.md', fileName: 'Alpha', values: { status: 'open', tags: ['buch', 'roman'] } },
  { path: 'b.md', fileName: 'Beta', values: { status: 'done', prio: 3 } },
  { path: 'c.md', fileName: 'Gamma', values: { status: null } },
]

describe('filterRowsByText', () => {
  it('returns every row for an empty or whitespace query', () => {
    expect(filterRowsByText(rows, '')).toHaveLength(3)
    expect(filterRowsByText(rows, '   ')).toHaveLength(3)
  })

  it('matches the file name case-insensitively', () => {
    expect(filterRowsByText(rows, 'alph').map((r) => r.path)).toEqual(['a.md'])
    expect(filterRowsByText(rows, 'GAMMA').map((r) => r.path)).toEqual(['c.md'])
  })

  it('matches a scalar property value', () => {
    expect(filterRowsByText(rows, 'done').map((r) => r.path)).toEqual(['b.md'])
  })

  it('matches a value inside a list property', () => {
    expect(filterRowsByText(rows, 'roman').map((r) => r.path)).toEqual(['a.md'])
  })

  it('matches a numeric value', () => {
    expect(filterRowsByText(rows, '3').map((r) => r.path)).toEqual(['b.md'])
  })

  it('returns nothing when no row matches', () => {
    expect(filterRowsByText(rows, 'zzz')).toEqual([])
  })

  it('ignores null/undefined values without throwing', () => {
    expect(() => filterRowsByText(rows, 'null')).not.toThrow()
    expect(filterRowsByText(rows, 'null')).toEqual([])
  })
})
