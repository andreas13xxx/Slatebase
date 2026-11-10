import { describe, it, expect } from 'vitest'
import type { BaseRow } from '@slatebase/shared-contracts'
import { filterRowsByText } from './base-row-search'

const rows: BaseRow[] = [
  { path: 'a.md', fileName: 'Café Notizen', values: {} },
  { path: 'b.md', fileName: 'Straße', values: { stadt: ['Łódź'] } },
  { path: 'c.md', fileName: 'Soup', values: {} },
]

describe('filterRowsByText — accent-insensitive (Obsidian 1.15)', () => {
  it('finds accented file names with plain letters', () => {
    expect(filterRowsByText(rows, 'cafe').map((r) => r.path)).toEqual(['a.md'])
    expect(filterRowsByText(rows, 'strasse').map((r) => r.path)).toEqual(['b.md'])
  })

  it('finds accented property values', () => {
    expect(filterRowsByText(rows, 'lodz').map((r) => r.path)).toEqual(['b.md'])
  })

  it('still returns every row for an empty query', () => {
    expect(filterRowsByText(rows, '  ')).toHaveLength(3)
  })
})
