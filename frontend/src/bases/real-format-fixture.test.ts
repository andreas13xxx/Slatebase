/**
 * Real-Obsidian-format `.base` fixture test — closes the "verify against a real
 * Obsidian .base file" item (the original Bases gap "point 5"). The fixture is
 * the canonical example from https://help.obsidian.md/bases/syntax, verbatim,
 * so a parse + round-trip failure here means Slatebase has drifted from the
 * real format.
 */

import { describe, it, expect } from 'vitest'
import { parseBase } from './parser'
import { serializeBase } from './serializer'
import { evaluateCondition } from './formula/evaluator'
import type { FormulaContext } from './formula/evaluator'
import type { BaseFilterAnd, BaseGroupBy } from './types'

// Verbatim from the official Obsidian Bases syntax reference.
const OFFICIAL = `filters:
  or:
    - file.hasTag("tag")
    - and:
        - file.hasTag("book")
        - file.hasLink("Textbook")
    - not:
        - file.hasTag("book")
        - file.inFolder("Required Reading")
formulas:
  formatted_price: 'if(price, price.toFixed(2) + " dollars")'
  ppu: "(price / age).toFixed(2)"
properties:
  status:
    displayName: Status
  formula.formatted_price:
    displayName: "Price"
  file.ext:
    displayName: Extension
summaries:
  customAverage: 'values.mean().round(3)'
views:
  - type: table
    name: "My table"
    limit: 10
    groupBy:
      property: note.age
      direction: DESC
    filters:
      and:
        - 'status != "done"'
        - or:
            - "formula.ppu > 5"
            - "price > 2.1"
    order:
      - file.name
      - file.ext
      - note.age
      - formula.ppu
      - formula.formatted_price
    summaries:
      formula.ppu: Average
`

describe('real Obsidian .base fixture', () => {
  it('parses the official syntax-reference example without a fatal error', () => {
    const result = parseBase(OFFICIAL)
    expect(result.success).toBe(true)
    if (!result.success) return
    const doc = result.document

    // Top-level filter is an OR group of three nodes (string, and, not).
    const root = doc.filters as { or: unknown[] }
    expect(root.or).toHaveLength(3)

    // Formulas, properties, summaries all present.
    expect(doc.formulas?.['ppu']).toBe('(price / age).toFixed(2)')
    expect(doc.properties?.['file.ext']?.displayName).toBe('Extension')
    expect(doc.summaries?.['customAverage']).toBe('values.mean().round(3)')

    // View: limit, groupBy object, nested view filter, order, summaries.
    const view = doc.views[0]!
    expect(view.type).toBe('table')
    expect(view.limit).toBe(10)
    expect(view.groupBy).toEqual<BaseGroupBy>({ property: 'note.age', direction: 'DESC' })
    expect((view.filters as BaseFilterAnd).and).toHaveLength(2)
    expect(view.order).toContain('formula.formatted_price')
    expect(view.summaries).toEqual({ 'formula.ppu': 'Average' })

    // No fatal parse errors (there may be none; assert the list is empty/absent).
    expect(result.errors ?? []).toEqual([])
  })

  it('round-trips the official example through serialize → parse', () => {
    const first = parseBase(OFFICIAL)
    expect(first.success).toBe(true)
    if (!first.success) return
    const second = parseBase(serializeBase(first.document))
    expect(second.success).toBe(true)
    if (!second.success) return
    expect(second.document).toEqual(first.document)
  })

  it('evaluates a file.hasTag / inFolder filter leaf against a row fileApi', () => {
    const ctx: FormulaContext = {
      resolve: () => null,
      fileApi: {
        hasTag: (t) => t === 'book',
        inFolder: (f) => f === 'Required Reading',
        hasLink: () => false,
      },
    }
    expect(evaluateCondition('file.hasTag("book")', ctx)).toBe(true)
    expect(evaluateCondition('file.hasTag("missing")', ctx)).toBe(false)
    expect(evaluateCondition('file.inFolder("Required Reading")', ctx)).toBe(true)
  })
})
