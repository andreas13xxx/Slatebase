import { describe, expect, it } from 'vitest'
import { BOOKMARKS_CONFIG_DEFAULTS, describeBookmarksDeviations, mergeBookmarksConfig } from './bookmarks-config.js'

describe('bookmarks.json', () => {
  it('has an empty list as default', () => {
    expect(BOOKMARKS_CONFIG_DEFAULTS.items).toEqual([])
  })

  it('accepts the entry types seen in real files, also inside groups', () => {
    expect(describeBookmarksDeviations({
      items: [
        { type: 'file', path: 'a.md', title: 'A' },
        { type: 'file', path: 'a.md', subpath: '#H' },
        { type: 'folder', path: 'Dir' },
        { type: 'url', url: 'https://example.com', title: 'x' },
        { type: 'search', query: 'tag:#t' },
        { type: 'group', title: 'G', items: [{ type: 'file', path: 'b.md' }] },
      ],
    })).toEqual([])
  })

  it('reports unknown types and entries that are not objects, with their position', () => {
    const found = describeBookmarksDeviations({
      items: [{ type: 'file', path: 'a.md' }, { type: 'rating' }, 'oops', { type: 'group', items: [{ type: 'weird' }] }],
      fancy: 1,
    })
    expect(found.map((d) => d.key)).toEqual(['fancy', 'items.1.type', 'items.2', 'items.3.items.0.type'])
  })

  it('reports an items value that is not a list, and falls back to the empty list', () => {
    expect(describeBookmarksDeviations({ items: 'x' }).map((d) => d.key)).toEqual(['items'])
    expect(mergeBookmarksConfig({ items: { a: 1 }, other: 1 })).toMatchObject({ items: [], other: 1 })
  })
})
