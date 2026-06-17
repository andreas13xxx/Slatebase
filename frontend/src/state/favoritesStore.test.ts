import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  add,
  remove,
  getForVault,
  isFavorite,
  updatePath,
  removeByPath,
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
    })
  })
})
