import { describe, it, expect } from 'vitest'
import type { BaseDocument, BaseFilterNode, BaseRow } from '@slatebase/shared-contracts'
import { evaluateCondition, rowContext } from '@slatebase/shared-contracts'
import {
  addView, renameView, duplicateView, deleteView, setViewType, uniqueViewName,
  setSort, setGroupBy, setOrder, effectiveColumns, availableColumns,
  rootGroup, normalizeFilter, replaceFilterNode, removeFilterNode, addFilterChild, setGroupKey,
  setViewFilter, setDocFilter, conditionToExpression, parseCondition, propertyRef,
  type Condition,
} from './base-edit'

const doc = (): BaseDocument => ({
  formulas: { late: 'x' },
  properties: { status: { displayName: 'Status' } },
  views: [{ type: 'table', name: 'A', order: ['status'] }, { type: 'list', name: 'B' }],
})

describe('view management', () => {
  it('adds a view with a unique name', () => {
    const next = addView(doc(), 'cards', 'A')
    expect(next.views.map((v) => v.name)).toEqual(['A', 'B', 'A 2'])
    expect(next.views[2]).toMatchObject({ type: 'cards', order: ['file.name'] })
  })

  it('falls back to the type when the name is blank', () => {
    expect(addView(doc(), 'map', '  ').views[2]!.name).toBe('map')
    expect(uniqueViewName(doc(), 'Neu')).toBe('Neu')
  })

  it('renames, ignoring an empty name', () => {
    expect(renameView(doc(), 0, ' X ').views[0]!.name).toBe('X')
    expect(renameView(doc(), 0, '  ')).toEqual(doc())
  })

  it('duplicates right after the original, deeply', () => {
    const next = duplicateView(doc(), 0)
    expect(next.views.map((v) => v.name)).toEqual(['A', 'A (Kopie)', 'B'])
    next.views[1]!.order!.push('x')
    expect(next.views[0]!.order).toEqual(['status'])
  })

  it('never deletes the last view', () => {
    expect(deleteView(doc(), 0).views.map((v) => v.name)).toEqual(['B'])
    const single = { views: [{ type: 'table' }] } as BaseDocument
    expect(deleteView(single, 0)).toBe(single)
  })

  it('changes the type', () => {
    expect(setViewType(doc(), 1, 'cards').views[1]!.type).toBe('cards')
  })

  it('does not mutate its input', () => {
    const d = doc()
    renameView(d, 0, 'Z')
    expect(d.views[0]!.name).toBe('A')
  })
})

describe('sort / group / columns', () => {
  it('sets and clears sort', () => {
    const sorted = setSort(doc(), 0, [{ column: 'status', direction: 'desc' }])
    expect(sorted.views[0]!.sort).toEqual([{ column: 'status', direction: 'desc' }])
    expect('sort' in setSort(sorted, 0, []).views[0]!).toBe(false)
  })

  it('setting a group drops the old groupOrder, clearing removes groupBy', () => {
    const d = doc()
    d.views[0] = { ...d.views[0]!, groupBy: { property: 'a' }, groupOrder: ['x'] }
    const next = setGroupBy(d, 0, { property: 'b', direction: 'ASC' })
    expect(next.views[0]).toMatchObject({ groupBy: { property: 'b', direction: 'ASC' } })
    expect('groupOrder' in next.views[0]!).toBe(false)
    expect('groupBy' in setGroupBy(next, 0, undefined).views[0]!).toBe(false)
  })

  it('effective columns fall back to the declared properties', () => {
    expect(effectiveColumns(doc(), doc().views[0])).toEqual(['status'])
    expect(effectiveColumns(doc(), doc().views[1])).toEqual(['status'])
    expect(setOrder(doc(), 1, ['a']).views[1]!.order).toEqual(['a'])
  })

  it('lists file fields, formulas, declared and observed properties once', () => {
    const rows = [{ path: 'a.md', fileName: 'a', values: { status: ['x'], prio: ['1'], 'file.ctime': 1 } }]
    const ids = availableColumns(doc(), rows, doc().views[0]).map((c) => c.id)
    expect(ids).toContain('file.name')
    expect(ids).toContain('formula.late')
    expect(ids.filter((i) => i === 'status')).toHaveLength(1)
    expect(ids).toContain('prio')
    expect(ids.filter((i) => i === 'file.ctime')).toHaveLength(1)
    expect(availableColumns(doc(), rows, undefined).find((c) => c.id === 'status')!.label).toBe('Status')
  })

  it('collapses a note.-prefixed order id and the bare observed key into one choice', () => {
    // `view.order` holds `note.status`, the rows carry the bare `status` (the
    // backend strips `note.`): one choice, under the canonical bare id.
    const d: BaseDocument = { properties: { status: { displayName: 'Status' } }, views: [{ type: 'table', name: 'A', order: ['note.status'] }] }
    const rows = [{ path: 'a.md', fileName: 'a', values: { status: ['x'] } }]
    const statusChoices = availableColumns(d, rows, d.views[0]).filter((c) => c.id === 'status' || c.id === 'note.status')
    expect(statusChoices).toHaveLength(1)
    expect(statusChoices[0]!.id).toBe('status')
  })
})

describe('filter tree', () => {
  const tree: BaseFilterNode = { and: ['a == 1', { or: ['b == 2', 'c == 3'] }] }

  it('wraps a missing or leaf root in an and-group', () => {
    expect(rootGroup(undefined)).toEqual({ and: [] })
    expect(rootGroup('x == 1')).toEqual({ and: ['x == 1'] })
    expect(rootGroup(tree)).toBe(tree)
  })

  it('replaces, removes and adds by path', () => {
    expect(replaceFilterNode(tree, [1, 0], 'z == 9')).toEqual({ and: ['a == 1', { or: ['z == 9', 'c == 3'] }] })
    expect(removeFilterNode(tree, [0])).toEqual({ and: [{ or: ['b == 2', 'c == 3'] }] })
    expect(addFilterChild(tree, [1], 'd == 4')).toEqual({ and: ['a == 1', { or: ['b == 2', 'c == 3', 'd == 4'] }] })
    expect(addFilterChild(tree, [], { not: [] })).toEqual({ and: ['a == 1', { or: ['b == 2', 'c == 3'] }, { not: [] }] })
    expect(removeFilterNode(tree, [])).toBe(tree)
  })

  it('switches a group key and keeps the children', () => {
    expect(setGroupKey(tree, [1], 'not')).toEqual({ and: ['a == 1', { not: ['b == 2', 'c == 3'] }] })
  })

  it('normalizes away empty groups', () => {
    expect(normalizeFilter({ and: [{ or: [] }, ''] })).toBeUndefined()
    expect(normalizeFilter({ and: ['a == 1', { or: [] }] })).toEqual({ and: ['a == 1'] })
  })

  it('writes and clears view and document filters', () => {
    const withFilter = setViewFilter(doc(), 0, { and: ['a == 1'] })
    expect(withFilter.views[0]!.filters).toEqual({ and: ['a == 1'] })
    expect('filters' in setViewFilter(withFilter, 0, { and: [] }).views[0]!).toBe(false)
    expect(setDocFilter(doc(), { and: ['t == 1'] }).filters).toEqual({ and: ['t == 1'] })
    expect('filters' in setDocFilter(setDocFilter(doc(), { and: ['t == 1'] }), undefined)).toBe(false)
  })
})

describe('condition builder', () => {
  const cases: Array<[Condition, string]> = [
    [{ property: 'status', operator: 'eq', value: 'open' }, 'status == "open"'],
    [{ property: 'priority', operator: 'gte', value: '3' }, 'priority >= 3'],
    [{ property: 'status', operator: 'neq', value: 'done' }, 'status != "done"'],
    [{ property: 'file.name', operator: 'contains', value: 'Plan' }, 'file.name.contains("Plan")'],
    [{ property: 'file.name', operator: 'notContains', value: 'x' }, '!file.name.contains("x")'],
    [{ property: 'title', operator: 'startsWith', value: 'A' }, 'title.startsWith("A")'],
    [{ property: 'title', operator: 'endsWith', value: 'Z' }, 'title.endsWith("Z")'],
    [{ property: 'deadline', operator: 'empty', value: '' }, 'deadline.isEmpty()'],
    [{ property: 'deadline', operator: 'notEmpty', value: '' }, '!deadline.isEmpty()'],
    [{ property: 'file.tags', operator: 'hasTag', value: 'book' }, 'file.hasTag("book")'],
    [{ property: 'file.folder', operator: 'inFolder', value: 'Tasks' }, 'file.inFolder("Tasks")'],
    [{ property: 'due-date', operator: 'lt', value: '2026-01-01' }, 'note["due-date"] < "2026-01-01"'],
    [{ property: 'x', operator: 'eq', value: 'say "hi"' }, 'x == "say \\"hi\\""'],
  ]

  it.each(cases)('generates and parses %o', (cond, expr) => {
    expect(conditionToExpression(cond)).toBe(expr)
    expect(parseCondition(expr)).toEqual(cond)
  })

  it('quotes property names that are not identifiers', () => {
    expect(propertyRef('due-date')).toBe('note["due-date"]')
    expect(propertyRef('formula.days_left')).toBe('formula.days_left')
    expect(propertyRef('Aufwand (h)')).toBe('note["Aufwand (h)"]')
  })

  it('returns null for what the builder cannot represent', () => {
    expect(parseCondition('a == 1 && b == 2')).toBeNull()
    expect(parseCondition('if(a, b, c)')).toBeNull()
    expect(parseCondition('!title.startsWith("x")')).toBeNull()
    expect(parseCondition('')).toBeNull()
  })

  it('a numeric value stays a string for text operators', () => {
    expect(conditionToExpression({ property: 'a', operator: 'contains', value: '5' })).toBe('a.contains("5")')
  })
})

describe('generated expressions evaluate in the real engine', () => {
  const row = (values: Record<string, unknown>): BaseRow => ({ path: 'Tasks/a.md', fileName: 'a', values: { 'file.folder': 'Tasks', 'file.tags': ['book'], ...values } })
  const holds = (c: Condition, r: BaseRow) => evaluateCondition(conditionToExpression(c), rowContext(r))

  it('text, number, empty and file operators', () => {
    const r = row({ status: ['open'], priority: ['3'], 'due-date': ['2026-01-01'] })
    expect(holds({ property: 'status', operator: 'eq', value: 'open' }, r)).toBe(true)
    expect(holds({ property: 'status', operator: 'neq', value: 'open' }, r)).toBe(false)
    expect(holds({ property: 'priority', operator: 'gte', value: '3' }, r)).toBe(true)
    expect(holds({ property: 'status', operator: 'startsWith', value: 'op' }, r)).toBe(true)
    expect(holds({ property: 'status', operator: 'notContains', value: 'zz' }, r)).toBe(true)
    expect(holds({ property: 'missing', operator: 'empty', value: '' }, r)).toBe(true)
    expect(holds({ property: 'status', operator: 'notEmpty', value: '' }, r)).toBe(true)
    expect(holds({ property: 'file.tags', operator: 'hasTag', value: 'book' }, r)).toBe(true)
    expect(holds({ property: 'file.folder', operator: 'inFolder', value: 'Tasks' }, r)).toBe(true)
    expect(holds({ property: 'due-date', operator: 'lt', value: '2027-01-01' }, r)).toBe(true)
  })
})
