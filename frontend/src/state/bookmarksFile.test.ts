import { describe, expect, it } from 'vitest'
import { entriesToItems, itemsToEntries, type RawItem } from './bookmarksFile'
import type { FavoriteEntry } from './favoritesStore'

const file = (path: string, extra: RawItem = {}): RawItem => ({ type: 'file', path, ...extra })

describe('itemsToEntries', () => {
  it('reads files, headings, blocks and searches, in file order, and ignores what Slatebase has no use for', () => {
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
      ['heading', 'b.md', undefined, 'Intro', undefined, undefined, 1],
      ['block', 'b.md', undefined, undefined, 'abc123', undefined, 2],
      ['search', '', 'Todos', undefined, undefined, 'tag:#todo', 3],
    ])
    expect(entries[0]?.addedAt).toBe(new Date(1700000000000).toISOString())
    expect(entries.every((e) => e.vaultId === 'v1')).toBe(true)
  })

  it('gives the same ids after every load, and different ids to entries that look alike', () => {
    const items = [file('a.md'), file('a.md'), file('b.md')]
    const first = itemsToEntries('v1', items).entries.map((e) => e.id)
    const second = itemsToEntries('v1', items).entries.map((e) => e.id)
    expect(first).toEqual(second)
    expect(new Set(first).size).toBe(3)
  })

  it('does not choke on entries that are not objects or lack their fields', () => {
    expect(itemsToEntries('v1', ['oops', null, { type: 'file' }, { type: 'search' }, 3, { type: 'file', path: 'x.md', subpath: 'weird' }]).entries).toEqual([])
  })

  it('reads the search switches Slatebase kept as extra fields', () => {
    const [entry] = itemsToEntries('v1', [{ type: 'search', query: 'x', searchCaseSensitive: true, searchRegex: true }]).entries
    expect(entry).toMatchObject({ searchCaseSensitive: true, searchRegex: true })
  })
})

describe('entriesToItems', () => {
  const load = (items: RawItem[]) => itemsToEntries('v1', items)

  it('writes back exactly what was read when nothing changed', () => {
    const items = [file('a.md', { title: 'A', ctime: 5, custom: 1 }), { type: 'group', title: 'G', items: [file('c.md')] }, file('b.md', { subpath: '#H' })]
    const loaded = load(items)
    expect(entriesToItems(loaded.entries, loaded)).toEqual(items)
  })

  it('keeps unknown fields and untouched items in place when an entry is renamed, relabelled or removed', () => {
    const items = [{ type: 'url', url: 'u' }, file('a.md', { custom: 1 }), { type: 'group', title: 'G', items: [] }, file('b.md')]
    const loaded = load(items)
    const [a, b] = loaded.entries as [FavoriteEntry, FavoriteEntry]

    const written = entriesToItems([{ ...a, path: 'moved.md', label: 'Moved' }], loaded)

    expect(written).toEqual([{ type: 'url', url: 'u' }, file('moved.md', { custom: 1, title: 'Moved' }), { type: 'group', title: 'G', items: [] }])
    expect(b).toBeDefined()
  })

  it('follows a reorder: the entries take the places of the entries in their new order, other items stay', () => {
    const items = [file('a.md'), { type: 'url', url: 'u' }, file('b.md'), { type: 'folder', path: 'D' }, file('c.md')]
    const loaded = load(items)
    const [a, b, c] = loaded.entries as [FavoriteEntry, FavoriteEntry, FavoriteEntry]

    const written = entriesToItems([{ ...a, order: 2 }, { ...b, order: 0 }, { ...c, order: 1 }], loaded)

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
    const written = entriesToItems(entries, loaded)
    const ctime = Date.parse('2026-01-01T00:00:00.000Z')

    expect(written).toEqual([
      file('a.md'),
      { type: 'file', path: 'n.md', subpath: '#H', ctime },
      { type: 'file', path: 'n.md', subpath: '#^x1', ctime },
      { type: 'search', query: 'q', searchRegex: true, ctime },
    ])
  })

  it('drops the label from the file when it is cleared', () => {
    const loaded = load([file('a.md', { title: 'A' })])
    const [a] = loaded.entries as [FavoriteEntry]
    const { label: _label, ...withoutLabel } = a
    expect(entriesToItems([withoutLabel], loaded)).toEqual([file('a.md')])
  })

  it('removes everything it shows when the list is empty, and keeps the rest', () => {
    const loaded = load([file('a.md'), { type: 'url', url: 'u' }])
    expect(entriesToItems([], loaded)).toEqual([{ type: 'url', url: 'u' }])
  })
})
