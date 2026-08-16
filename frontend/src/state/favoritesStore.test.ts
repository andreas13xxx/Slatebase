import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  add,
  remove,
  getForVault,
  isFavorite,
  updatePath,
  removeByPath,
  reorder,
  setLabel,
  removeById,
  addHeadingBookmark,
  addBlockBookmark,
  addSearchBookmark,
  favoritesStore,
} from './favoritesStore'
import type { FavoriteEntry } from './favoritesStore'

describe('favoritesStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('add', () => {
    it('adds a favorite entry for a vault', () => {
      add('vault1', 'notes/hello.md')

      const favorites = getForVault('vault1')
      expect(favorites).toHaveLength(1)
      expect(favorites[0]!.vaultId).toBe('vault1')
      expect(favorites[0]!.path).toBe('notes/hello.md')
      expect(favorites[0]!.addedAt).toBeTruthy()
    })

    it('does not add duplicate entries for the same path', () => {
      add('vault1', 'notes/hello.md')
      add('vault1', 'notes/hello.md')

      expect(getForVault('vault1')).toHaveLength(1)
    })

    it('stores favorites separately per vault', () => {
      add('vault1', 'notes/a.md')
      add('vault2', 'notes/b.md')

      expect(getForVault('vault1')).toHaveLength(1)
      expect(getForVault('vault2')).toHaveLength(1)
      expect(getForVault('vault1')[0]!.path).toBe('notes/a.md')
      expect(getForVault('vault2')[0]!.path).toBe('notes/b.md')
    })

    it('rejects add when cap of 50 is reached', () => {
      for (let i = 0; i < 50; i++) {
        add('vault1', `file-${i}.md`)
      }

      add('vault1', 'file-50.md')

      expect(getForVault('vault1')).toHaveLength(50)
      expect(isFavorite('vault1', 'file-50.md')).toBe(false)
    })

    it('persists to localStorage with correct key', () => {
      add('vault1', 'notes/hello.md')

      const raw = localStorage.getItem('slatebase:favorites:vault1')
      expect(raw).toBeTruthy()
      const parsed = JSON.parse(raw!) as FavoriteEntry[]
      expect(parsed).toHaveLength(1)
      expect(parsed[0]!.path).toBe('notes/hello.md')
    })
  })

  describe('remove', () => {
    it('removes a favorite entry', () => {
      add('vault1', 'notes/a.md')
      add('vault1', 'notes/b.md')

      remove('vault1', 'notes/a.md')

      expect(getForVault('vault1')).toHaveLength(1)
      expect(isFavorite('vault1', 'notes/a.md')).toBe(false)
      expect(isFavorite('vault1', 'notes/b.md')).toBe(true)
    })

    it('does nothing when path not found', () => {
      add('vault1', 'notes/a.md')
      remove('vault1', 'notes/nonexistent.md')

      expect(getForVault('vault1')).toHaveLength(1)
    })
  })

  describe('getForVault', () => {
    it('returns empty array for vault with no favorites', () => {
      expect(getForVault('empty-vault')).toEqual([])
    })

    it('returns favorites ordered by addedAt descending (newest first)', () => {
      // Manually write entries with known timestamps to control order
      const entries: FavoriteEntry[] = [
        { vaultId: 'vault1', path: 'oldest.md', addedAt: '2024-01-01T00:00:00.000Z' },
        { vaultId: 'vault1', path: 'middle.md', addedAt: '2024-06-15T12:00:00.000Z' },
        { vaultId: 'vault1', path: 'newest.md', addedAt: '2024-12-31T23:59:59.000Z' },
      ]
      localStorage.setItem('slatebase:favorites:vault1', JSON.stringify(entries))

      const result = getForVault('vault1')
      expect(result[0]!.path).toBe('newest.md')
      expect(result[1]!.path).toBe('middle.md')
      expect(result[2]!.path).toBe('oldest.md')
    })

    it('returns a new array (not a reference to internal state)', () => {
      add('vault1', 'notes/a.md')
      const result1 = getForVault('vault1')
      const result2 = getForVault('vault1')
      expect(result1).not.toBe(result2)
    })
  })

  describe('isFavorite', () => {
    it('returns true for a favorited file', () => {
      add('vault1', 'notes/a.md')
      expect(isFavorite('vault1', 'notes/a.md')).toBe(true)
    })

    it('returns false for a non-favorited file', () => {
      expect(isFavorite('vault1', 'notes/a.md')).toBe(false)
    })

    it('is vault-scoped', () => {
      add('vault1', 'notes/a.md')
      expect(isFavorite('vault2', 'notes/a.md')).toBe(false)
    })
  })

  describe('updatePath', () => {
    it('updates the path of an existing favorite', () => {
      add('vault1', 'notes/old-name.md')

      updatePath('vault1', 'notes/old-name.md', 'docs/new-name.md')

      expect(isFavorite('vault1', 'notes/old-name.md')).toBe(false)
      expect(isFavorite('vault1', 'docs/new-name.md')).toBe(true)
    })

    it('preserves addedAt when updating path', () => {
      add('vault1', 'notes/a.md')
      const before = getForVault('vault1')[0]!.addedAt

      updatePath('vault1', 'notes/a.md', 'notes/b.md')

      const after = getForVault('vault1')[0]!.addedAt
      expect(after).toBe(before)
    })

    it('does nothing when old path not found', () => {
      add('vault1', 'notes/a.md')
      updatePath('vault1', 'notes/nonexistent.md', 'notes/b.md')

      expect(isFavorite('vault1', 'notes/a.md')).toBe(true)
      expect(isFavorite('vault1', 'notes/b.md')).toBe(false)
    })
  })

  describe('removeByPath', () => {
    it('removes a favorite by path (same as remove)', () => {
      add('vault1', 'notes/a.md')
      removeByPath('vault1', 'notes/a.md')

      expect(isFavorite('vault1', 'notes/a.md')).toBe(false)
      expect(getForVault('vault1')).toHaveLength(0)
    })
  })

  describe('localStorage fallback', () => {
    it('works in-memory when localStorage throws on setItem', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      add('vault1', 'notes/a.md')

      // Should still work via in-memory fallback
      expect(isFavorite('vault1', 'notes/a.md')).toBe(true)
      expect(getForVault('vault1')).toHaveLength(1)

      setItemSpy.mockRestore()
    })

    it('works in-memory when localStorage is completely unavailable', () => {
      // Simulate localStorage being unavailable by making both setItem and getItem throw
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })

      add('vault1', 'notes/a.md')
      expect(isFavorite('vault1', 'notes/a.md')).toBe(true)

      remove('vault1', 'notes/a.md')
      expect(isFavorite('vault1', 'notes/a.md')).toBe(false)

      setItemSpy.mockRestore()
      getItemSpy.mockRestore()
    })

    it('handles corrupted localStorage data gracefully', () => {
      localStorage.setItem('slatebase:favorites:vault1', 'not-valid-json{{{')

      // Should not throw, return empty
      expect(getForVault('vault1')).toEqual([])
    })

    it('filters out malformed entries from localStorage', () => {
      localStorage.setItem(
        'slatebase:favorites:vault1',
        JSON.stringify([
          { vaultId: 'vault1', path: 'valid.md', addedAt: '2024-01-01T00:00:00.000Z' },
          { invalid: true },
          null,
          'string-entry',
        ])
      )

      const result = getForVault('vault1')
      expect(result).toHaveLength(1)
      expect(result[0]!.path).toBe('valid.md')
    })
  })

  describe('favoritesStore object', () => {
    it('exposes all IFavoritesStore methods', () => {
      expect(typeof favoritesStore.add).toBe('function')
      expect(typeof favoritesStore.remove).toBe('function')
      expect(typeof favoritesStore.getForVault).toBe('function')
      expect(typeof favoritesStore.isFavorite).toBe('function')
      expect(typeof favoritesStore.updatePath).toBe('function')
      expect(typeof favoritesStore.removeByPath).toBe('function')
      expect(typeof favoritesStore.reorder).toBe('function')
      expect(typeof favoritesStore.setLabel).toBe('function')
      expect(typeof favoritesStore.removeById).toBe('function')
      expect(typeof favoritesStore.addHeadingBookmark).toBe('function')
      expect(typeof favoritesStore.addBlockBookmark).toBe('function')
      expect(typeof favoritesStore.addSearchBookmark).toBe('function')
    })
  })

  describe('order and id assignment', () => {
    it('assigns a unique id and an ascending order to each new entry', () => {
      add('vault1', 'a.md')
      add('vault1', 'b.md')

      const [first, second] = getForVault('vault1')
      expect(first!.id).toBeTruthy()
      expect(second!.id).toBeTruthy()
      expect(first!.id).not.toBe(second!.id)
      expect(first!.order).toBeLessThan(second!.order)
    })

    it('appends new entries at the end regardless of addedAt', () => {
      add('vault1', 'a.md')
      add('vault1', 'b.md')
      add('vault1', 'c.md')

      const paths = getForVault('vault1').map(e => e.path)
      expect(paths).toEqual(['a.md', 'b.md', 'c.md'])
    })
  })

  describe('lazy migration of legacy entries (Requirement 1.5)', () => {
    it('backfills id and order for entries without them, preserving addedAt-descending order', () => {
      const legacy = [
        { vaultId: 'vault1', path: 'oldest.md', addedAt: '2024-01-01T00:00:00.000Z' },
        { vaultId: 'vault1', path: 'newest.md', addedAt: '2024-12-31T23:59:59.000Z' },
      ]
      localStorage.setItem('slatebase:favorites:vault1', JSON.stringify(legacy))

      const result = getForVault('vault1')
      expect(result.map(e => e.path)).toEqual(['newest.md', 'oldest.md'])
      expect(result[0]!.id).toBeTruthy()
      expect(result[1]!.id).toBeTruthy()
      expect(result[0]!.order).toBeLessThan(result[1]!.order)
    })

    it('is idempotent — a second load does not reassign ids or reorder', () => {
      const legacy = [
        { vaultId: 'vault1', path: 'a.md', addedAt: '2024-01-01T00:00:00.000Z' },
        { vaultId: 'vault1', path: 'b.md', addedAt: '2024-06-01T00:00:00.000Z' },
      ]
      localStorage.setItem('slatebase:favorites:vault1', JSON.stringify(legacy))

      const first = getForVault('vault1')
      const second = getForVault('vault1')

      expect(second.map(e => e.id)).toEqual(first.map(e => e.id))
      expect(second.map(e => e.order)).toEqual(first.map(e => e.order))
    })

    it('treats entries without a type field as file bookmarks', () => {
      const legacy = [{ vaultId: 'vault1', path: 'a.md', addedAt: '2024-01-01T00:00:00.000Z' }]
      localStorage.setItem('slatebase:favorites:vault1', JSON.stringify(legacy))

      expect(isFavorite('vault1', 'a.md')).toBe(true)
    })
  })

  describe('reorder', () => {
    it('moves an entry to the requested index', () => {
      add('vault1', 'a.md')
      add('vault1', 'b.md')
      add('vault1', 'c.md')
      const [a] = getForVault('vault1')

      reorder('vault1', a!.id, 2)

      expect(getForVault('vault1').map(e => e.path)).toEqual(['b.md', 'c.md', 'a.md'])
    })

    it('clamps an out-of-range index to the nearest valid position', () => {
      add('vault1', 'a.md')
      add('vault1', 'b.md')
      const [a] = getForVault('vault1')

      reorder('vault1', a!.id, 999)

      expect(getForVault('vault1').map(e => e.path)).toEqual(['b.md', 'a.md'])
    })

    it('does nothing for an unknown id', () => {
      add('vault1', 'a.md')
      reorder('vault1', 'nonexistent-id', 0)

      expect(getForVault('vault1').map(e => e.path)).toEqual(['a.md'])
    })
  })

  describe('setLabel', () => {
    it('sets a custom label', () => {
      add('vault1', 'a.md')
      const [entry] = getForVault('vault1')

      setLabel('vault1', entry!.id, 'My Custom Name')

      expect(getForVault('vault1')[0]!.label).toBe('My Custom Name')
    })

    it('trims and truncates labels to 100 characters', () => {
      add('vault1', 'a.md')
      const [entry] = getForVault('vault1')

      setLabel('vault1', entry!.id, '  ' + 'x'.repeat(150) + '  ')

      expect(getForVault('vault1')[0]!.label).toBe('x'.repeat(100))
    })

    it('clears the label when passed null', () => {
      add('vault1', 'a.md')
      const [entry] = getForVault('vault1')
      setLabel('vault1', entry!.id, 'Custom')

      setLabel('vault1', entry!.id, null)

      expect(getForVault('vault1')[0]!.label).toBeUndefined()
    })

    it('clears the label when passed an empty/whitespace-only string', () => {
      add('vault1', 'a.md')
      const [entry] = getForVault('vault1')
      setLabel('vault1', entry!.id, 'Custom')

      setLabel('vault1', entry!.id, '   ')

      expect(getForVault('vault1')[0]!.label).toBeUndefined()
    })
  })

  describe('removeById', () => {
    it('removes an entry by id regardless of type', () => {
      add('vault1', 'a.md')
      const [entry] = getForVault('vault1')

      removeById('vault1', entry!.id)

      expect(getForVault('vault1')).toHaveLength(0)
    })
  })

  describe('non-file bookmark types (Requirements 11-13)', () => {
    it('addHeadingBookmark creates a heading-type entry', () => {
      addHeadingBookmark('vault1', 'notes/a.md', 'Introduction')

      const [entry] = getForVault('vault1')
      expect(entry!.type).toBe('heading')
      expect(entry!.path).toBe('notes/a.md')
      expect(entry!.heading).toBe('Introduction')
    })

    it('addBlockBookmark creates a block-type entry', () => {
      addBlockBookmark('vault1', 'notes/a.md', 'abc123')

      const [entry] = getForVault('vault1')
      expect(entry!.type).toBe('block')
      expect(entry!.blockId).toBe('abc123')
    })

    it('addSearchBookmark creates a search-type entry with an empty path', () => {
      addSearchBookmark('vault1', 'TODO', true, false)

      const [entry] = getForVault('vault1')
      expect(entry!.type).toBe('search')
      expect(entry!.path).toBe('')
      expect(entry!.searchQuery).toBe('TODO')
      expect(entry!.searchCaseSensitive).toBe(true)
      expect(entry!.searchRegex).toBe(false)
    })

    it('a file bookmark and a heading bookmark can coexist for the same path', () => {
      add('vault1', 'notes/a.md')
      addHeadingBookmark('vault1', 'notes/a.md', 'Section 1')

      expect(getForVault('vault1')).toHaveLength(2)
    })

    it('remove() only removes the file-type entry, not heading/block bookmarks on the same path', () => {
      add('vault1', 'notes/a.md')
      addHeadingBookmark('vault1', 'notes/a.md', 'Section 1')

      remove('vault1', 'notes/a.md')

      const remaining = getForVault('vault1')
      expect(remaining).toHaveLength(1)
      expect(remaining[0]!.type).toBe('heading')
    })

    it('removeByPath removes every entry (any type) referencing the path', () => {
      add('vault1', 'notes/a.md')
      addHeadingBookmark('vault1', 'notes/a.md', 'Section 1')
      addBlockBookmark('vault1', 'notes/a.md', 'blk1')

      removeByPath('vault1', 'notes/a.md')

      expect(getForVault('vault1')).toHaveLength(0)
    })

    it('updatePath updates every entry (any type) referencing the path', () => {
      add('vault1', 'notes/old.md')
      addHeadingBookmark('vault1', 'notes/old.md', 'Section 1')

      updatePath('vault1', 'notes/old.md', 'notes/new.md')

      const entries = getForVault('vault1')
      expect(entries.every(e => e.path === 'notes/new.md')).toBe(true)
    })

    it('multiple search bookmarks (all with empty path) coexist without colliding', () => {
      addSearchBookmark('vault1', 'foo', false, false)
      addSearchBookmark('vault1', 'bar', false, false)

      const entries = getForVault('vault1')
      expect(entries).toHaveLength(2)
      expect(entries.map(e => e.searchQuery).sort()).toEqual(['bar', 'foo'])
    })

    it('non-file bookmarks respect the 50-entry cap', () => {
      for (let i = 0; i < 50; i++) {
        addSearchBookmark('vault1', `query-${i}`, false, false)
      }

      addSearchBookmark('vault1', 'one-too-many', false, false)

      expect(getForVault('vault1')).toHaveLength(50)
    })
  })
})
