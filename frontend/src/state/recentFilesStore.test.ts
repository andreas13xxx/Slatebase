import { describe, it, expect, beforeEach } from 'vitest'
import { add, getRecent, remove, updatePath, _reload } from './recentFilesStore'

describe('recentFilesStore', () => {
  beforeEach(() => {
    // localStorage is cleared in test-setup.ts beforeEach
    // Re-initialize the module state from empty localStorage
    _reload()
  })

  describe('add', () => {
    it('adds an entry to the front of the list', () => {
      add('vault1', 'notes/hello.md')

      const recent = getRecent()
      expect(recent).toHaveLength(1)
      expect(recent[0]!.vaultId).toBe('vault1')
      expect(recent[0]!.path).toBe('notes/hello.md')
      expect(recent[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('stores timestamp as ISO 8601', () => {
      add('vault1', 'file.md')

      const recent = getRecent()
      const timestamp = recent[0]!.timestamp
      // Verify it's a valid ISO 8601 date
      const parsed = new Date(timestamp)
      expect(parsed.toISOString()).toBe(timestamp)
    })

    it('deduplicates by vaultId + path, moving to front', () => {
      add('vault1', 'a.md')
      add('vault1', 'b.md')
      add('vault1', 'a.md') // re-open a.md

      const recent = getRecent()
      expect(recent).toHaveLength(2)
      expect(recent[0]!.path).toBe('a.md')
      expect(recent[1]!.path).toBe('b.md')
    })

    it('treats different vaults as separate entries', () => {
      add('vault1', 'file.md')
      add('vault2', 'file.md')

      const recent = getRecent()
      expect(recent).toHaveLength(2)
      expect(recent[0]!.vaultId).toBe('vault2')
      expect(recent[1]!.vaultId).toBe('vault1')
    })

    it('caps at 20 entries, removing oldest', () => {
      for (let i = 0; i < 25; i++) {
        add('vault1', `file-${i}.md`)
      }

      const recent = getRecent()
      expect(recent).toHaveLength(20)
      // Most recent should be file-24
      expect(recent[0]!.path).toBe('file-24.md')
      // Oldest should be file-5 (file-0 through file-4 evicted)
      expect(recent[19]!.path).toBe('file-5.md')
    })

    it('persists to localStorage', () => {
      add('vault1', 'persisted.md')

      const stored = localStorage.getItem('slatebase:recentFiles')
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].path).toBe('persisted.md')
    })
  })

  describe('getRecent', () => {
    it('returns empty array when no entries', () => {
      expect(getRecent()).toEqual([])
    })

    it('returns all entries when no limit specified', () => {
      add('vault1', 'a.md')
      add('vault1', 'b.md')
      add('vault1', 'c.md')

      expect(getRecent()).toHaveLength(3)
    })

    it('returns at most N entries when limit is specified', () => {
      add('vault1', 'a.md')
      add('vault1', 'b.md')
      add('vault1', 'c.md')

      const recent = getRecent(2)
      expect(recent).toHaveLength(2)
      expect(recent[0]!.path).toBe('c.md')
      expect(recent[1]!.path).toBe('b.md')
    })

    it('returns all entries when limit exceeds count', () => {
      add('vault1', 'a.md')

      const recent = getRecent(100)
      expect(recent).toHaveLength(1)
    })

    it('returns a copy (not a reference to internal state)', () => {
      add('vault1', 'a.md')

      const recent1 = getRecent()
      recent1.push({ vaultId: 'fake', path: 'fake.md', timestamp: '' })

      expect(getRecent()).toHaveLength(1)
    })
  })

  describe('remove', () => {
    it('removes entry matching vaultId + path', () => {
      add('vault1', 'a.md')
      add('vault1', 'b.md')

      remove('vault1', 'a.md')

      const recent = getRecent()
      expect(recent).toHaveLength(1)
      expect(recent[0]!.path).toBe('b.md')
    })

    it('does nothing when entry does not exist', () => {
      add('vault1', 'a.md')

      remove('vault1', 'nonexistent.md')

      expect(getRecent()).toHaveLength(1)
    })

    it('only removes entry with matching vault', () => {
      add('vault1', 'file.md')
      add('vault2', 'file.md')

      remove('vault1', 'file.md')

      const recent = getRecent()
      expect(recent).toHaveLength(1)
      expect(recent[0]!.vaultId).toBe('vault2')
    })

    it('persists removal to localStorage', () => {
      add('vault1', 'a.md')
      add('vault1', 'b.md')
      remove('vault1', 'a.md')

      const stored = JSON.parse(localStorage.getItem('slatebase:recentFiles')!)
      expect(stored).toHaveLength(1)
      expect(stored[0].path).toBe('b.md')
    })
  })

  describe('updatePath', () => {
    it('updates path for matching vaultId + oldPath', () => {
      add('vault1', 'old/path.md')

      updatePath('vault1', 'old/path.md', 'new/path.md')

      const recent = getRecent()
      expect(recent[0]!.path).toBe('new/path.md')
    })

    it('does nothing when entry is not found', () => {
      add('vault1', 'file.md')

      updatePath('vault1', 'nonexistent.md', 'new.md')

      expect(getRecent()[0]!.path).toBe('file.md')
    })

    it('only updates entry with matching vault', () => {
      add('vault1', 'file.md')
      add('vault2', 'file.md')

      updatePath('vault1', 'file.md', 'renamed.md')

      const recent = getRecent()
      const vault2Entry = recent.find(e => e.vaultId === 'vault2')
      expect(vault2Entry!.path).toBe('file.md')
    })

    it('persists path update to localStorage', () => {
      add('vault1', 'old.md')
      updatePath('vault1', 'old.md', 'new.md')

      const stored = JSON.parse(localStorage.getItem('slatebase:recentFiles')!)
      expect(stored[0].path).toBe('new.md')
    })

    it('preserves timestamp when updating path', () => {
      add('vault1', 'file.md')
      const originalTimestamp = getRecent()[0]!.timestamp

      updatePath('vault1', 'file.md', 'renamed.md')

      expect(getRecent()[0]!.timestamp).toBe(originalTimestamp)
    })
  })

  describe('localStorage persistence', () => {
    it('loads existing entries from localStorage on reload', () => {
      const data = [
        { vaultId: 'v1', path: 'from-storage.md', timestamp: '2024-01-20T14:30:00.000Z' },
      ]
      localStorage.setItem('slatebase:recentFiles', JSON.stringify(data))

      _reload()

      const recent = getRecent()
      expect(recent).toHaveLength(1)
      expect(recent[0]!.path).toBe('from-storage.md')
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('slatebase:recentFiles', 'not-valid-json{{{')

      _reload()

      expect(getRecent()).toEqual([])
    })

    it('filters out invalid entries from localStorage', () => {
      const data = [
        { vaultId: 'v1', path: 'valid.md', timestamp: '2024-01-20T14:30:00.000Z' },
        { invalid: true },
        { vaultId: 'v2', path: null, timestamp: '2024-01-20T14:30:00.000Z' },
        'not-an-object',
      ]
      localStorage.setItem('slatebase:recentFiles', JSON.stringify(data))

      _reload()

      const recent = getRecent()
      expect(recent).toHaveLength(1)
      expect(recent[0]!.path).toBe('valid.md')
    })

    it('handles non-array localStorage data gracefully', () => {
      localStorage.setItem('slatebase:recentFiles', JSON.stringify({ not: 'array' }))

      _reload()

      expect(getRecent()).toEqual([])
    })

    it('works in-memory when localStorage is unavailable', () => {
      // Simulate localStorage being unavailable
      const originalSetItem = localStorage.setItem
      localStorage.setItem = () => { throw new Error('QuotaExceededError') }

      try {
        add('vault1', 'inmemory.md')
        // Should still work in-memory
        expect(getRecent()).toHaveLength(1)
        expect(getRecent()[0]!.path).toBe('inmemory.md')
      } finally {
        localStorage.setItem = originalSetItem
      }
    })
  })
})
