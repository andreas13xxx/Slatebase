import { describe, it, expect } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { parseBase } from './parser'
import { serializeBase } from './serializer'
import type { BaseDocument, BaseFilterAnd, BaseFilterCondition } from './types'

/**
 * Fixture modelled on a real Obsidian `.base` file: AND/OR-nested filters, a
 * formula column, property display metadata, and a table view with sort.
 */
const FIXTURE = `filters:
  and:
    - property: status
      op: neq
      value: done
    - or:
        - property: priority
          op: eq
          value: high
        - tag: urgent
formulas:
  days_left: date(deadline) - today()
properties:
  file.name:
    displayName: Task
  status:
    displayName: Status
  days_left:
    displayName: Days left
views:
  - type: table
    name: Open tasks
    order:
      - file.name
      - status
      - priority
      - days_left
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
    expect(doc.views[0]?.order).toEqual(['file.name', 'status', 'priority', 'days_left'])
    expect(doc.views[0]?.sort).toEqual([{ column: 'priority', direction: 'desc' }])

    expect(doc.formulas?.['days_left']).toBe('date(deadline) - today()')
    expect(doc.properties?.['status']?.displayName).toBe('Status')

    const root = doc.filters as BaseFilterAnd
    expect(root.and).toHaveLength(2)
    const first = root.and[0] as BaseFilterCondition
    expect(first.property).toBe('status')
    expect(first.op).toBe('neq')
    expect(first.value).toBe('done')
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

  it('reports a non-fatal error for a condition targeting nothing', () => {
    const result = parseBase('filters:\n  op: eq\n  value: x\nviews: []\n')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.errors?.some((e) => /must target one of/.test(e.message))).toBe(true)
  })

  it('reports a non-fatal error for an unknown operator', () => {
    const result = parseBase('filters:\n  property: x\n  op: between\nviews: []\n')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.errors?.some((e) => /op/.test(e.message))).toBe(true)
  })
})

describe('serializeBase', () => {
  it('emits a stable top-level key order', () => {
    const doc: BaseDocument = {
      filters: { property: 'status', op: 'eq', value: 'open' },
      formulas: { x: '1 + 1' },
      properties: { status: { displayName: 'Status' } },
      views: [{ type: 'table', name: 'All' }],
    }
    const yaml = serializeBase(doc)
    const keys = yaml
      .split('\n')
      .filter((line) => /^[a-z]/.test(line))
      .map((line) => line.split(':')[0])
    expect(keys).toEqual(['filters', 'formulas', 'properties', 'views'])
  })
})
