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

describe('PreferencesStore — UI and per-vault settings', () => {
  let dataDir: string
  let store: PreferencesStore

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'preferences-settings-test-'))
    store = new PreferencesStore(dataDir, createMockLogger())
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  describe('UI settings', () => {
    it('returns defaults for a user who has never changed anything', async () => {
      const settings = await store.getUiSettings('user-1')
      expect(settings.statusBarVisible).toBe(true)
      expect(settings.explorerFollowActiveFile).toBe(false)
      expect(settings.toolbar.position).toBe('left')
      expect(settings.toolbar.hidden).toEqual(['toggle-toolbar'])
    })

    it('merges a partial patch without clearing untouched fields', async () => {
      await store.saveUiSettings('user-1', { statusBarVisible: false })
      await store.saveUiSettings('user-1', { explorerFollowActiveFile: true })

      const settings = await store.getUiSettings('user-1')
      expect(settings.statusBarVisible).toBe(false)
      expect(settings.explorerFollowActiveFile).toBe(true)
    })

    it('merges a partial toolbar patch without clearing sibling toolbar keys', async () => {
      await store.saveUiSettings('user-1', { toolbar: { position: 'right', hidden: ['a'] } })
      await store.saveUiSettings('user-1', { toolbar: { visible: false } })

      const { toolbar } = await store.getUiSettings('user-1')
      expect(toolbar.position).toBe('right')
      expect(toolbar.hidden).toEqual(['a'])
      expect(toolbar.visible).toBe(false)
    })

    it('ignores explicitly undefined values instead of erasing the stored one', async () => {
      await store.saveUiSettings('user-1', { statusBarVisible: false })
      await store.saveUiSettings('user-1', { statusBarVisible: undefined })

      expect((await store.getUiSettings('user-1')).statusBarVisible).toBe(false)
    })

    it('keeps settings separate per user', async () => {
      await store.saveUiSettings('user-1', { statusBarVisible: false })
      expect((await store.getUiSettings('user-2')).statusBarVisible).toBe(true)
    })

    it('fills missing fields from defaults when reading a file written before they existed', async () => {
      await mkdir(path.join(dataDir, 'users'), { recursive: true })
      await writeFile(
        path.join(dataDir, 'users', 'legacy-preferences.json'),
        JSON.stringify({ recentFiles: [], favorites: [], keybindings: [] }),
        'utf-8',
      )

      const settings = await store.getUiSettings('legacy')
      expect(settings.statusBarVisible).toBe(true)
      expect(settings.toolbar.order).toEqual([])
      expect(settings.toolbar.hidden).toEqual(['toggle-toolbar'])
    })
  })

  describe('per-vault settings', () => {
    it('returns defaults for a vault the user has never configured', async () => {
      const settings = await store.getVaultSettings('user-1', 'vault-1')
      expect(settings.lineNumbers).toBe(false)
      expect(settings.readableLineLength).toBe(true)
      expect(settings.zoom).toBe(1)
    })

    it('keeps settings separate per vault for the same user', async () => {
      await store.saveVaultSettings('user-1', 'vault-1', { lineNumbers: true, zoom: 1.5 })
      await store.saveVaultSettings('user-1', 'vault-2', { lineNumbers: false })

      expect((await store.getVaultSettings('user-1', 'vault-1')).lineNumbers).toBe(true)
      expect((await store.getVaultSettings('user-1', 'vault-1')).zoom).toBe(1.5)
      expect((await store.getVaultSettings('user-1', 'vault-2')).lineNumbers).toBe(false)
      expect((await store.getVaultSettings('user-1', 'vault-2')).zoom).toBe(1)
    })

    it('keeps the same vault separate per user', async () => {
      await store.saveVaultSettings('user-1', 'vault-1', { lineNumbers: true })
      expect((await store.getVaultSettings('user-2', 'vault-1')).lineNumbers).toBe(false)
    })

    it('merges a partial patch without clearing untouched fields', async () => {
      await store.saveVaultSettings('user-1', 'vault-1', { zoom: 1.25 })
      await store.saveVaultSettings('user-1', 'vault-1', { spellcheck: false })

      const settings = await store.getVaultSettings('user-1', 'vault-1')
      expect(settings.zoom).toBe(1.25)
      expect(settings.spellcheck).toBe(false)
    })

    it('stores opaque client-owned blobs verbatim', async () => {
      const graph = { colors: { fileNode: '#fff' }, layout: { repulsion: 42 } }
      await store.saveVaultSettings('user-1', 'vault-1', { graph })
      expect((await store.getVaultSettings('user-1', 'vault-1')).graph).toEqual(graph)
    })

    it('removes a vault entry for the named users when the vault is deleted', async () => {
      await store.saveVaultSettings('user-1', 'vault-1', { lineNumbers: true })
      await store.saveVaultSettings('user-2', 'vault-1', { lineNumbers: true })

      await store.deleteVaultSettings('vault-1', ['user-1', 'user-2'])

      expect((await store.getVaultSettings('user-1', 'vault-1')).lineNumbers).toBe(false)
      expect((await store.getVaultSettings('user-2', 'vault-1')).lineNumbers).toBe(false)
    })

    it('leaves other vaults untouched when one is deleted', async () => {
      await store.saveVaultSettings('user-1', 'vault-1', { lineNumbers: true })
      await store.saveVaultSettings('user-1', 'vault-2', { lineNumbers: true })

      await store.deleteVaultSettings('vault-1', ['user-1'])

      expect((await store.getVaultSettings('user-1', 'vault-2')).lineNumbers).toBe(true)
    })

    it('does not disturb the other preference buckets', async () => {
      await store.saveKeybindings('user-1', [{ commandId: 'a', shortcut: 'Ctrl+A' }])
      await store.saveVaultSettings('user-1', 'vault-1', { lineNumbers: true })
      await store.saveUiSettings('user-1', { statusBarVisible: false })

      expect(await store.getKeybindings('user-1')).toEqual([{ commandId: 'a', shortcut: 'Ctrl+A' }])
    })
  })
})
