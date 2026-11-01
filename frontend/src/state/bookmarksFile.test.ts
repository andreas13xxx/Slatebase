import { describe, expect, it } from 'vitest'
import { adoptEntryIds, entriesToItems, itemsToEntries, type RawItem } from './bookmarksFile'
import type { FavoriteEntry } from './favoritesStore'

const file = (path: string, extra: RawItem = {}): RawItem => ({ type: 'file', path, ...extra })

describe('itemsToEntries', () => {
  it('reads files, headings, blocks, searches and groups, in file order, and ignores what Slatebase has no use for', () => {
    const items = [
      file('a.md', { title: 'Alpha', ctime: 1700000000000 }),
      { type: 'group', title: 'Work', items: [file('inside.md')] },
      file('b.md', { subpath: '#Intro' }),
      { type: 'url', url: 'https://example.com' },
      file('b.md', { subpath: '#^abc123' }),
      { type: 'search', query: 'tag:#todo', title: 'Todos' },
      { type: 'folder', path: 'Dir' },
    ]
    const { entries } = itemsToEntries('v1', items)

    expect(entries.map((e) => [e.type, e.path, e.label, e.heading, e.blockId, e.searchQuery, e.order])).toEqual([
      ['file', 'a.md', 'Alpha', undefined, undefined, undefined, 0],
      ['group', '', 'Work', undefined, undefined, undefined, 1],
      ['file', 'inside.md', undefined, undefined, undefined, undefined, 2],
      ['heading', 'b.md', undefined, 'Intro', undefined, undefined, 3],
      ['block', 'b.md', undefined, undefined, 'abc123', undefined, 4],
      ['search', '', 'Todos', undefined, undefined, 'tag:#todo', 5],
    ])
    expect(entries[0]?.addedAt).toBe(new Date(1700000000000).toISOString())
    expect(entries.every((e) => e.vaultId === 'v1')).toBe(true)
  })

  it('puts the entries of a group under its id, also in nested groups', () => {
    const items = [{ type: 'group', title: 'Outer', items: [file('a.md'), { type: 'group', title: 'Inner', items: [file('b.md')] }] }, file('top.md')]
    const { entries } = itemsToEntries('v1', items)
    const [outer, a, inner, b, top] = entries as [FavoriteEntry, FavoriteEntry, FavoriteEntry, FavoriteEntry, FavoriteEntry]

    expect(outer.parentId).toBeUndefined()
    expect(a.parentId).toBe(outer.id)
    expect(inner.parentId).toBe(outer.id)
    expect(b.parentId).toBe(inner.id)
    expect(top.parentId).toBeUndefined()
  })

  it('gives the same ids after every load, and different ids to entries that look alike', () => {
    const items = [file('a.md'), file('a.md'), file('b.md')]
    const first = itemsToEntries('v1', items).entries.map((e) => e.id)
    const second = itemsToEntries('v1', items).entries.map((e) => e.id)
    expect(first).toEqual(second)
    expect(new Set(first).size).toBe(3)
  })

  it('gives the same file in two groups two different ids', () => {
    const items = [{ type: 'group', title: 'A', items: [file('x.md')] }, { type: 'group', title: 'B', items: [file('x.md')] }, file('x.md')]
    const ids = itemsToEntries('v1', items).entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not choke on entries that are not objects or lack their fields', () => {
    expect(itemsToEntries('v1', ['oops', null, { type: 'file' }, { type: 'search' }, 3, { type: 'file', path: 'x.md', subpath: 'weird' }]).entries).toEqual([])
  })

  it('reads a group without a list of items as an empty group', () => {
    const { entries } = itemsToEntries('v1', [{ type: 'group', title: 'Empty' }, { type: 'group', title: 'Odd', items: 'x' }])
    expect(entries.map((e) => [e.type, e.label])).toEqual([['group', 'Empty'], ['group', 'Odd']])
  })

  it('reads the search switches Slatebase kept as extra fields', () => {
    const [entry] = itemsToEntries('v1', [{ type: 'search', query: 'x', searchCaseSensitive: true, searchRegex: true }]).entries
    expect(entry).toMatchObject({ searchCaseSensitive: true, searchRegex: true })
  })
})

describe('entriesToItems', () => {
  const load = (items: RawItem[]) => itemsToEntries('v1', items)

  it('writes back exactly what was read when nothing changed', () => {
    const items = [
      file('a.md', { title: 'A', ctime: 5, custom: 1 }),
      { type: 'group', title: 'G', custom: 2, items: [file('c.md', { x: 1 }), { type: 'url', url: 'in-group' }] },
      file('b.md', { subpath: '#H' }),
    ]
    const loaded = load(items)
    expect(entriesToItems(loaded.entries, loaded).items).toEqual(items)
  })

  it('lists the ids in the order itemsToEntries reads them back', () => {
    const items = [file('a.md'), { type: 'group', title: 'G', items: [file('c.md'), { type: 'group', title: 'H', items: [file('d.md')] }, file('e.md')] }, file('b.md')]
    const loaded = load(items)
    const reversed = [...loaded.entries].reverse().map((e, index) => ({ ...e, order: index }))
    const { items: written, ids } = entriesToItems(loaded.entries, loaded)

    expect(ids).toEqual(loaded.entries.map((e) => e.id))
    // Whatever order the entries are handed in, the ids follow the written tree
    const again = entriesToItems(reversed, loaded)
    expect(itemsToEntries('v1', again.items).entries).toHaveLength(loaded.entries.length)
    expect(written).toEqual(items)
  })

  it('keeps unknown fields and untouched items in place when an entry is renamed, relabelled or removed', () => {
    const items = [{ type: 'url', url: 'u' }, file('a.md', { custom: 1 }), { type: 'folder', path: 'D' }, file('b.md')]
    const loaded = load(items)
    const [a, b] = loaded.entries as [FavoriteEntry, FavoriteEntry]

    const written = entriesToItems([{ ...a, path: 'moved.md', label: 'Moved' }], loaded).items

    expect(written).toEqual([{ type: 'url', url: 'u' }, file('moved.md', { custom: 1, title: 'Moved' }), { type: 'folder', path: 'D' }])
    expect(b).toBeDefined()
  })

  it('follows a reorder: the entries take the places of the entries in their new order, other items stay', () => {
    const items = [file('a.md'), { type: 'url', url: 'u' }, file('b.md'), { type: 'folder', path: 'D' }, file('c.md')]
    const loaded = load(items)
    const [a, b, c] = loaded.entries as [FavoriteEntry, FavoriteEntry, FavoriteEntry]

    const written = entriesToItems([{ ...a, order: 2 }, { ...b, order: 0 }, { ...c, order: 1 }], loaded).items

    expect(written.map((i) => i['path'] ?? i['url'])).toEqual(['b.md', 'u', 'c.md', 'D', 'a.md'])
  })

  it('adds new entries at the end with a creation time, as Obsidian\'s items', () => {
    const loaded = load([file('a.md')])
    const entries: FavoriteEntry[] = [
      ...loaded.entries,
      { id: 'n1', vaultId: 'v1', path: 'n.md', addedAt: '2026-01-01T00:00:00.000Z', order: 1, type: 'heading', heading: 'H' },
      { id: 'n2', vaultId: 'v1', path: 'n.md', addedAt: '2026-01-01T00:00:00.000Z', order: 2, type: 'block', blockId: 'x1' },
      { id: 'n3', vaultId: 'v1', path: '', addedAt: '2026-01-01T00:00:00.000Z', order: 3, type: 'search', searchQuery: 'q', searchRegex: true, searchCaseSensitive: false },
    ]
    const written = entriesToItems(entries, loaded).items
    const ctime = Date.parse('2026-01-01T00:00:00.000Z')

    expect(written).toEqual([
      file('a.md'),
      { type: 'file', path: 'n.md', subpath: '#H', ctime },
      { type: 'file', path: 'n.md', subpath: '#^x1', ctime },
      { type: 'search', query: 'q', searchRegex: true, ctime },
    ])
  })

  it('writes a new group with its entries, as Obsidian\'s group item', () => {
    const loaded = load([file('a.md')])
    const at = '2026-01-01T00:00:00.000Z'
    const entries: FavoriteEntry[] = [
      ...loaded.entries,
      { id: 'g1', vaultId: 'v1', path: '', addedAt: at, order: 1, type: 'group', label: 'New' },
      { id: 'n1', vaultId: 'v1', path: 'n.md', addedAt: at, order: 2, type: 'file', parentId: 'g1' },
    ]
    const ctime = Date.parse(at)

    expect(entriesToItems(entries, loaded).items).toEqual([
      file('a.md'),
      { type: 'group', title: 'New', ctime, items: [{ type: 'file', path: 'n.md', ctime }] },
    ])
  })

  it('moves an entry into a group and keeps what the group holds that Slatebase does not show', () => {
    const items = [file('a.md'), { type: 'group', title: 'G', items: [{ type: 'url', url: 'u' }, file('b.md')] }]
    const loaded = load(items)
    const [a, g, b] = loaded.entries as [FavoriteEntry, FavoriteEntry, FavoriteEntry]

    const written = entriesToItems([{ ...a, parentId: g.id, order: 3 }, g, b], loaded).items

    expect(written).toEqual([
      { type: 'group', title: 'G', items: [{ type: 'url', url: 'u' }, file('b.md'), file('a.md')] },
    ])
  })

  it('moves an entry out of a group to the top level', () => {
    const items = [{ type: 'group', title: 'G', items: [file('b.md')] }]
    const loaded = load(items)
    const [g, b] = loaded.entries as [FavoriteEntry, FavoriteEntry]
    const { parentId: _parent, ...top } = b

    expect(entriesToItems([g, top], loaded).items).toEqual([{ type: 'group', title: 'G', items: [] }, file('b.md')])
  })

  it('removes a group with its content when the group entry is gone', () => {
    const items = [{ type: 'group', title: 'G', items: [file('b.md')] }, file('a.md')]
    const loaded = load(items)
    const [, , a] = loaded.entries as [FavoriteEntry, FavoriteEntry, FavoriteEntry]

    expect(entriesToItems([a], loaded).items).toEqual([file('a.md')])
  })

  it('puts an entry whose group is gone on the top level instead of losing it', () => {
    const loaded = load([file('a.md')])
    const [a] = loaded.entries as [FavoriteEntry]

    expect(entriesToItems([{ ...a, parentId: 'missing' }], loaded).items).toEqual([file('a.md')])
  })

  it('drops the label from the file when it is cleared', () => {
    const loaded = load([file('a.md', { title: 'A' })])
    const [a] = loaded.entries as [FavoriteEntry]
    const { label: _label, ...withoutLabel } = a
    expect(entriesToItems([withoutLabel], loaded).items).toEqual([file('a.md')])
  })

  it('drops the title of a group when the name is cleared', () => {
    const loaded = load([{ type: 'group', title: 'G', items: [] }])
    const [g] = loaded.entries as [FavoriteEntry]
    const { label: _label, ...unnamed } = g
    expect(entriesToItems([unnamed], loaded).items).toEqual([{ type: 'group', items: [] }])
  })

  it('removes everything it shows when the list is empty, and keeps the rest', () => {
    const loaded = load([file('a.md'), { type: 'url', url: 'u' }])
    expect(entriesToItems([], loaded).items).toEqual([{ type: 'url', url: 'u' }])
  })
})

describe('entriesToItems: stored data that does not fit', () => {
  const load = (items: RawItem[]) => itemsToEntries('v1', items)
  const at = '2026-01-01T00:00:00.000Z'

  it('puts an entry whose parent is not a group on the top level instead of losing it', () => {
    const loaded = load([file('a.md'), file('b.md')])
    const [a, b] = loaded.entries as [FavoriteEntry, FavoriteEntry]

    const written = entriesToItems([a, { ...b, parentId: a.id }], loaded).items

    expect(written.map((i) => i['path'])).toEqual(['a.md', 'b.md'])
  })

  it('keeps groups that point at each other, and what is in them', () => {
    const entries: FavoriteEntry[] = [
      { id: 'g1', vaultId: 'v1', path: '', addedAt: at, order: 0, type: 'group', label: 'One', parentId: 'g2' },
      { id: 'g2', vaultId: 'v1', path: '', addedAt: at, order: 1, type: 'group', label: 'Two', parentId: 'g1' },
      { id: 'f', vaultId: 'v1', path: 'x.md', addedAt: at, order: 2, type: 'file', parentId: 'g2' },
    ]
    const loaded = load([])

    const { items, ids } = entriesToItems(entries, loaded)

    expect(new Set(ids)).toEqual(new Set(['g1', 'g2', 'f']))
    expect(ids).toHaveLength(3)
    expect(JSON.stringify(items)).toContain('x.md')
  })
})

describe('adoptEntryIds', () => {
  const at = '2026-01-01T00:00:00.000Z'

  it('gives the raw item of the file to the entry of the cache that is the same item', () => {
    const fresh = itemsToEntries('v1', [{ type: 'group', title: 'G', items: [{ type: 'url', url: 'u' }] }])
    const cache: FavoriteEntry[] = [{ id: 'random', vaultId: 'v1', path: '', addedAt: at, order: 0, type: 'group', label: 'G' }]

    const { loaded, idMap } = adoptEntryIds(fresh, cache)

    expect(loaded.rawById.get('random')).toBe(fresh.rawById.get(fresh.entries[0]!.id))
    expect(idMap.get(fresh.entries[0]!.id)).toBe('random')
  })

  it('does not give one item of the file to two entries', () => {
    const fresh = itemsToEntries('v1', [file('a.md', { custom: 1 })])
    const sameId = fresh.entries[0]!.id
    const cache: FavoriteEntry[] = [
      { id: sameId, vaultId: 'v1', path: 'a.md', addedAt: at, order: 0, type: 'file' },
      { id: 'new', vaultId: 'v1', path: 'a.md', addedAt: at, order: 1, type: 'file' },
    ]

    const { loaded } = adoptEntryIds(fresh, cache)

    expect(loaded.rawById.get('new')).toBeUndefined()
    expect(loaded.rawById.get(sameId)).toBeDefined()
  })
})

