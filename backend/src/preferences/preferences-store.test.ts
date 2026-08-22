import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PreferencesStore } from './preferences-store.js'
import type { ILogger } from '../logger/index.js'

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

describe('PreferencesStore', () => {
  let dataDir: string
  let store: PreferencesStore

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'preferences-test-'))
    store = new PreferencesStore(dataDir, createMockLogger())
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  describe('recent files', () => {
    it('returns an empty array for a user with no saved preferences yet', async () => {
      expect(await store.getRecentFiles('user-1')).toEqual([])
    })

    it('saves and reads back recent files', async () => {
      const entries = [{ vaultId: 'v1', path: 'notes/a.md', timestamp: '2026-01-01T00:00:00.000Z' }]
      await store.saveRecentFiles('user-1', entries)
      expect(await store.getRecentFiles('user-1')).toEqual(entries)
    })

    it('caps recent files at 20 entries', async () => {
      const entries = Array.from({ length: 25 }, (_, i) => ({
        vaultId: 'v1',
        path: `notes/${i}.md`,
        timestamp: '2026-01-01T00:00:00.000Z',
      }))
      await store.saveRecentFiles('user-1', entries)
      expect(await store.getRecentFiles('user-1')).toHaveLength(20)
    })

    it('keeps preferences isolated per user', async () => {
      await store.saveRecentFiles('user-1', [{ vaultId: 'v1', path: 'a.md', timestamp: '2026-01-01T00:00:00.000Z' }])
      expect(await store.getRecentFiles('user-2')).toEqual([])
    })
  })

  describe('favorites', () => {
    it('returns an empty array for a user with no saved favorites yet', async () => {
      expect(await store.getFavorites('user-1')).toEqual([])
    })

    it('saves and reads back favorites', async () => {
      const entries = [{ vaultId: 'v1', path: 'notes/a.md', addedAt: '2026-01-01T00:00:00.000Z' }]
      await store.saveFavorites('user-1', entries)
      expect(await store.getFavorites('user-1')).toEqual(entries)
    })

    it('caps favorites at 500 entries', async () => {
      const entries = Array.from({ length: 501 }, (_, i) => ({
        vaultId: 'v1',
        path: `notes/${i}.md`,
        addedAt: '2026-01-01T00:00:00.000Z',
      }))
      await store.saveFavorites('user-1', entries)
      expect(await store.getFavorites('user-1')).toHaveLength(500)
    })

    it('does not clobber recent files when saving favorites', async () => {
      await store.saveRecentFiles('user-1', [{ vaultId: 'v1', path: 'a.md', timestamp: '2026-01-01T00:00:00.000Z' }])
      await store.saveFavorites('user-1', [{ vaultId: 'v1', path: 'b.md', addedAt: '2026-01-01T00:00:00.000Z' }])

      expect(await store.getRecentFiles('user-1')).toHaveLength(1)
      expect(await store.getFavorites('user-1')).toHaveLength(1)
    })
  })

  describe('keybindings', () => {
    it('returns an empty array for a user with no saved keybindings yet', async () => {
      expect(await store.getKeybindings('user-1')).toEqual([])
    })

    it('saves and reads back keybindings', async () => {
      const entries = [{ commandId: 'save', shortcut: 'Ctrl+S' }]
      await store.saveKeybindings('user-1', entries)
      expect(await store.getKeybindings('user-1')).toEqual(entries)
    })

    it('caps keybindings at 200 entries', async () => {
      const entries = Array.from({ length: 210 }, (_, i) => ({ commandId: `cmd-${i}`, shortcut: 'Ctrl+X' }))
      await store.saveKeybindings('user-1', entries)
      expect(await store.getKeybindings('user-1')).toHaveLength(200)
    })
  })

  describe('sanitization of malformed on-disk data', () => {
    it('falls back to empty arrays when the stored JSON is missing expected fields', async () => {
      const usersDir = path.join(dataDir, 'users')
      await mkdir(usersDir, { recursive: true })
      await writeFile(path.join(usersDir, 'user-1-preferences.json'), JSON.stringify({ recentFiles: 'not-an-array' }), 'utf-8')

      expect(await store.getRecentFiles('user-1')).toEqual([])
      expect(await store.getFavorites('user-1')).toEqual([])
      expect(await store.getKeybindings('user-1')).toEqual([])
    })
  })
})
