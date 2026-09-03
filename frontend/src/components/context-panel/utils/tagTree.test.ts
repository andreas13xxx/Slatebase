import { describe, it, expect } from 'vitest'
import { buildTagTree } from './tagTree'

describe('buildTagTree', () => {
  it('groups nested tags under the parent their name describes', () => {
    const tree = buildTagTree([
      { name: 'Rezepte/Hauptspeise', count: 2, files: ['a.md', 'b.md'] },
      { name: 'Rezepte/Nachtisch', count: 1, files: ['c.md'] },
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({ segment: 'Rezepte', name: 'Rezepte', count: 0, totalCount: 3 })
    expect(tree[0]!.children.map((child) => child.name)).toEqual([
      'Rezepte/Hauptspeise',
      'Rezepte/Nachtisch',
    ])
  })

  it('marks a parent that no note carries directly with count 0', () => {
    const tree = buildTagTree([{ name: 'a/b', count: 1, files: ['x.md'] }])

    expect(tree[0]!.count).toBe(0)
    expect(tree[0]!.children[0]!.count).toBe(1)
  })

  it('keeps a parent that notes do carry directly', () => {
    const tree = buildTagTree([
      { name: 'Rezepte', count: 1, files: ['a.md'] },
      { name: 'Rezepte/Nachtisch', count: 1, files: ['b.md'] },
    ])

    expect(tree[0]!.count).toBe(1)
    expect(tree[0]!.totalCount).toBe(2)
  })

  it('counts a note once when it carries both the parent and a child tag', () => {
    const tree = buildTagTree([
      { name: 'Rezepte', count: 1, files: ['a.md'] },
      { name: 'Rezepte/Nachtisch', count: 1, files: ['a.md'] },
    ])

    expect(tree[0]!.totalCount).toBe(1)
  })

  it('falls back to summing counts when file lists are missing', () => {
    const tree = buildTagTree([
      { name: 'Rezepte/Hauptspeise', count: 2 },
      { name: 'Rezepte/Nachtisch', count: 3 },
    ])

    expect(tree[0]!.totalCount).toBe(5)
  })

  it('nests to arbitrary depth', () => {
    const tree = buildTagTree([{ name: 'a/b/c', count: 1, files: ['x.md'] }])

    expect(tree[0]!.name).toBe('a')
    expect(tree[0]!.children[0]!.name).toBe('a/b')
    expect(tree[0]!.children[0]!.children[0]).toMatchObject({ name: 'a/b/c', segment: 'c', count: 1 })
  })

  it('sorts case-insensitively at every level', () => {
    const tree = buildTagTree([
      { name: 'Zebra', count: 1 },
      { name: 'alpha/Zulu', count: 1 },
      { name: 'alpha/beta', count: 1 },
      { name: 'Beta', count: 1 },
    ])

    expect(tree.map((node) => node.segment)).toEqual(['alpha', 'Beta', 'Zebra'])
    expect(tree[0]!.children.map((node) => node.segment)).toEqual(['beta', 'Zulu'])
  })

  it('does not treat a shared name prefix as a parent', () => {
    const tree = buildTagTree([
      { name: 'Rezept', count: 1, files: ['a.md'] },
      { name: 'Rezepte/Nachtisch', count: 1, files: ['b.md'] },
    ])

    expect(tree.map((node) => node.name)).toEqual(['Rezept', 'Rezepte'])
    expect(tree[0]!.children).toEqual([])
  })

  it('ignores empty segments from stray slashes', () => {
    const tree = buildTagTree([{ name: 'a//b/', count: 1, files: ['x.md'] }])

    expect(tree[0]!.name).toBe('a')
    expect(tree[0]!.children[0]!.name).toBe('a/b')
    expect(tree[0]!.children[0]!.children).toEqual([])
  })

  it('drops an entry that is nothing but slashes', () => {
    expect(buildTagTree([{ name: '/', count: 1 }])).toEqual([])
  })
})
