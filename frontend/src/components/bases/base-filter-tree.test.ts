import { describe, it, expect } from 'vitest'
import type { BaseDocument, BaseFilterNode } from '@slatebase/shared-contracts'
import { moveFilterNode, nudgeFilterNode, nodeAt, moveFilterBetweenScopes } from './base-filter-tree'

const root = (): BaseFilterNode => ({ and: ['a', 'b', { or: ['c', 'd', 'e'] }, 'f'] })

describe('nodeAt', () => {
  it('finds nested nodes and returns undefined for bad paths', () => {
    expect(nodeAt(root(), [0])).toBe('a')
    expect(nodeAt(root(), [2, 1])).toBe('d')
    expect(nodeAt(root(), [9])).toBeUndefined()
    expect(nodeAt(root(), [0, 0])).toBeUndefined()
  })
})

describe('moveFilterNode', () => {
  it('moves a condition forward and backward inside its group', () => {
    expect(moveFilterNode(root(), [0], 2)).toEqual({ and: ['b', { or: ['c', 'd', 'e'] }, 'a', 'f'] })
    expect(moveFilterNode(root(), [3], 0)).toEqual({ and: ['f', 'a', 'b', { or: ['c', 'd', 'e'] }] })
  })

  it('moves nodes inside a nested group without touching the outer one', () => {
    expect(moveFilterNode(root(), [2, 0], 2)).toEqual({ and: ['a', 'b', { or: ['d', 'e', 'c'] }, 'f'] })
  })

  it('moves whole groups', () => {
    expect(moveFilterNode(root(), [2], 0)).toEqual({ and: [{ or: ['c', 'd', 'e'] }, 'a', 'b', 'f'] })
  })

  it('clamps the target index', () => {
    expect(moveFilterNode(root(), [0], 99)).toEqual({ and: ['b', { or: ['c', 'd', 'e'] }, 'f', 'a'] })
    expect(moveFilterNode(root(), [3], -5)).toEqual({ and: ['f', 'a', 'b', { or: ['c', 'd', 'e'] }] })
  })

  it('returns the same tree for a no-op, the root, or an unknown path', () => {
    const r = root()
    expect(moveFilterNode(r, [1], 1)).toBe(r)
    expect(moveFilterNode(r, [], 0)).toBe(r)
    expect(moveFilterNode(r, [9], 0)).toBe(r)
  })

  it('keeps the group kind and loses/duplicates nothing', () => {
    const moved = moveFilterNode({ not: ['x', 'y', 'z'] }, [2], 0)
    expect(moved).toEqual({ not: ['z', 'x', 'y'] })
  })
})

describe('nudgeFilterNode', () => {
  it('moves one step up or down and stops at the edges', () => {
    const r = root()
    expect(nudgeFilterNode(r, [1], -1)).toEqual({ and: ['b', 'a', { or: ['c', 'd', 'e'] }, 'f'] })
    expect(nudgeFilterNode(r, [1], 1)).toEqual({ and: ['a', { or: ['c', 'd', 'e'] }, 'b', 'f'] })
    expect(nudgeFilterNode(r, [0], -1)).toBe(r)
    expect(nudgeFilterNode(r, [3], 1)).toBe(r)
  })
})

const doc = (): BaseDocument => ({
  filters: { and: ['shared'] },
  views: [
    { type: 'table', name: 'A', filters: { and: ['own1', 'own2'] } },
    { type: 'list', name: 'B' },
  ],
})

describe('moveFilterBetweenScopes', () => {
  it('moves a view filter to "all views"', () => {
    const next = moveFilterBetweenScopes(doc(), 0, 'view', [0])
    expect(next.filters).toEqual({ and: ['shared', 'own1'] })
    expect(next.views[0]!.filters).toEqual({ and: ['own2'] })
  })

  it('moves an "all views" filter to this view', () => {
    const next = moveFilterBetweenScopes(doc(), 0, 'all', [0])
    expect(next.filters).toBeUndefined()
    expect(next.views[0]!.filters).toEqual({ and: ['own1', 'own2', 'shared'] })
  })

  it('creates the target group when there is none', () => {
    const next = moveFilterBetweenScopes(doc(), 1, 'all', [0])
    expect(next.views[1]!.filters).toEqual({ and: ['shared'] })
    expect(next.filters).toBeUndefined()
  })

  it('drops a source group that became empty', () => {
    const d: BaseDocument = { views: [{ type: 'table', name: 'A', filters: { and: ['only'] } }] }
    const next = moveFilterBetweenScopes(d, 0, 'view', [0])
    expect(next.views[0]!.filters).toBeUndefined()
    expect(next.filters).toEqual({ and: ['only'] })
  })

  it('moves a whole nested group', () => {
    const d: BaseDocument = { views: [{ type: 'table', name: 'A', filters: { and: ['x', { or: ['p', 'q'] }] } }] }
    const next = moveFilterBetweenScopes(d, 0, 'view', [1])
    expect(next.filters).toEqual({ and: [{ or: ['p', 'q'] }] })
    expect(next.views[0]!.filters).toEqual({ and: ['x'] })
  })

  it('ignores the root path, unknown paths and a missing source', () => {
    const d = doc()
    expect(moveFilterBetweenScopes(d, 0, 'view', [])).toBe(d)
    expect(moveFilterBetweenScopes(d, 0, 'view', [9])).toBe(d)
    expect(moveFilterBetweenScopes(d, 1, 'view', [0])).toBe(d)
  })
})
