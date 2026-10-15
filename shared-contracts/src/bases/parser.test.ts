import { describe, it, expect } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { parseBase } from './parser.js'
import { serializeBase } from './serializer.js'
import type { BaseDocument, BaseFilterAnd } from './types.js'

/**
 * Fixture in the real Obsidian `.base` format: AND/OR-nested filters as
 * expression strings, a formula column, property display metadata, and a table
 * view with sort.
 */
const FIXTURE = `filters:
  and:
    - 'status != "done"'
    - or:
        - 'priority == "high"'
        - file.hasTag("urgent")
formulas:
  days_left: date(deadline) - today()
properties:
  file.name:
    displayName: Task
  status:
    displayName: Status
  formula.days_left:
    displayName: Days left
views:
  - type: table
    name: Open tasks
    order:
      - file.name
      - status
      - priority
      - formula.days_left
    sort:
      - column: priority
        direction: desc
`

describe('parseBase', () => {
  it('parses a nested filter / formula / view fixture', () => {
    const result = parseBase(FIXTURE)
    expect(result.success).toBe(true)
    if (!result.success) return
    const doc = result.document

    expect(doc.views).toHaveLength(1)
    expect(doc.views[0]?.type).toBe('table')
    expect(doc.views[0]?.name).toBe('Open tasks')
    expect(doc.views[0]?.order).toEqual(['file.name', 'status', 'priority', 'formula.days_left'])
    expect(doc.views[0]?.sort).toEqual([{ column: 'priority', direction: 'desc' }])

    expect(doc.formulas?.['days_left']).toBe('date(deadline) - today()')
    expect(doc.properties?.['status']?.displayName).toBe('Status')

    const root = doc.filters as BaseFilterAnd
    expect(root.and).toHaveLength(2)
    expect(root.and[0]).toBe('status != "done"')
    expect('or' in (root.and[1] as object)).toBe(true)
  })

  it('round-trips through serialize → parse without semantic loss', () => {
    const first = parseBase(FIXTURE)
    expect(first.success).toBe(true)
    if (!first.success) return
    const yaml = serializeBase(first.document)
    const second = parseBase(yaml)
    expect(second.success).toBe(true)
    if (!second.success) return
    expect(second.document).toEqual(first.document)
  })

  it('preserves unknown top-level and view fields through a round-trip', () => {
    const input = `futureTopLevel: keep-me
views:
  - type: cards
    name: Gallery
    futureViewField: also-keep
`
    const result = parseBase(input)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document._unknown).toEqual({ futureTopLevel: 'keep-me' })
    expect(result.document.views[0]?._unknown).toEqual({ futureViewField: 'also-keep' })

    const out = parseYaml(serializeBase(result.document)) as Record<string, unknown>
    expect(out['futureTopLevel']).toBe('keep-me')
    const view0 = (out['views'] as Record<string, unknown>[])[0]
    expect(view0?.['futureViewField']).toBe('also-keep')
  })

  it('treats an empty document as an empty base', () => {
    const result = parseBase('')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.views).toEqual([])
  })

  it('fails on invalid YAML', () => {
    const result = parseBase('filters: [unclosed')
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]?.message).toMatch(/YAML parse error/)
  })

  it('fails on a non-mapping root', () => {
    const result = parseBase('- just\n- a\n- list')
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]?.message).toMatch(/must be a YAML mapping/)
  })

  it('rejects the removed legacy object-condition schema with a migration hint', () => {
    const result = parseBase('filters:\n  property: x\n  op: eq\n  value: y\nviews: []\n')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.errors?.some((e) => /no longer supported|expression string/.test(e.message))).toBe(true)
  })

  it('parses a filters list group of expression strings', () => {
    const result = parseBase('filters:\n  not:\n    - \'status == "archived"\'\nviews: []\n')
    expect(result.success).toBe(true)
    if (!result.success) return
    const root = result.document.filters as { not: unknown[] }
    expect(root.not).toEqual(['status == "archived"'])
  })

  it('parses a cards view with a groupBy object', () => {
    const result = parseBase('views:\n  - type: cards\n    name: Board\n    groupBy:\n      property: status\n      direction: ASC\n')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.views[0]?.type).toBe('cards')
    expect(result.document.views[0]?.groupBy).toEqual({ property: 'status', direction: 'ASC' })
  })

  it('tolerates a bare-string groupBy as { property }', () => {
    const result = parseBase('views:\n  - type: cards\n    groupBy: status\n')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.views[0]?.groupBy).toEqual({ property: 'status' })
  })

  it('parses a view limit and summaries', () => {
    const result = parseBase('views:\n  - type: table\n    limit: 10\n    summaries:\n      price: Average\n')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.views[0]?.limit).toBe(10)
    expect(result.document.views[0]?.summaries).toEqual({ price: 'Average' })
  })

  it('reports a non-fatal error for a non-object groupBy', () => {
    const result = parseBase('views:\n  - type: cards\n    groupBy: [1, 2]\n')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.errors?.some((e) => /groupBy/.test(e.message))).toBe(true)
  })
})

describe('serializeBase', () => {
  it('emits a stable top-level key order', () => {
    const doc: BaseDocument = {
      filters: 'status == "open"',
      formulas: { x: '1 + 1' },
      properties: { status: { displayName: 'Status' } },
      summaries: { price: 'Average' },
      views: [{ type: 'table', name: 'All' }],
    }
    const yaml = serializeBase(doc)
    const keys = yaml
      .split('\n')
      .filter((line) => /^[a-z]/.test(line))
      .map((line) => line.split(':')[0])
    expect(keys).toEqual(['filters', 'formulas', 'properties', 'summaries', 'views'])
  })

  it('round-trips a cards view groupBy object', () => {
    const doc: BaseDocument = {
      views: [{ type: 'cards', name: 'Board', groupBy: { property: 'status', direction: 'DESC' } }],
    }
    const yaml = serializeBase(doc)
    const reparsed = parseBase(yaml)
    expect(reparsed.success).toBe(true)
    if (!reparsed.success) return
    expect(reparsed.document.views[0]?.groupBy).toEqual({ property: 'status', direction: 'DESC' })
  })
})
