import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { InstalledPluginStore } from './installed-plugin-store.js'
import {
  CommunityPluginsFileInvalidError,
  PluginFileTooLargeError,
  PluginSettingsTooLargeError,
  PluginVaultUnavailableError,
} from './errors.js'
import type { PluginFiles, PluginManifest, PluginRegistryData } from './types.js'

// ─── Test Setup ──────────────────────────────────────────────────────────────

let root: string
let dataDir: string
let vaultPath: string
let store: InstalledPluginStore

const pluginDir = (id: string): string => path.join(vaultPath, '.obsidian', 'plugins', id)
const enabledFile = (): string => path.join(vaultPath, '.obsidian', 'community-plugins.json')

beforeEach(async () => {
  root = path.join(os.tmpdir(), `plugin-store-test-${crypto.randomBytes(8).toString('hex')}`)
  dataDir = path.join(root, 'data')
  vaultPath = path.join(root, 'vault-1')
  await fs.mkdir(dataDir, { recursive: true })
  await fs.mkdir(vaultPath, { recursive: true })
  store = new InstalledPluginStore(dataDir, (vaultId) => (vaultId === 'vault-1' ? vaultPath : null))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

// ─── Helper Data ─────────────────────────────────────────────────────────────

const testManifest: PluginManifest = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  author: 'Test Author',
  description: 'A test plugin',
}

const testFiles: PluginFiles = {
  manifest: JSON.stringify(testManifest, null, 2),
  bundle: 'module.exports = class TestPlugin { onload() {} onunload() {} }',
  styles: '.test-plugin { color: red; }',
}

function emptyRegistry(): PluginRegistryData {
  return { version: 1, plugins: {} }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InstalledPluginStore', () => {
  describe('savePlugin / loadManifest / loadBundle / loadStyles', () => {
    it('stores the files where Obsidian keeps them, inside the vault', async () => {
      await store.savePlugin('vault-1', 'test-plugin', testFiles)

      expect(await fs.readFile(path.join(pluginDir('test-plugin'), 'manifest.json'), 'utf-8')).toBe(testFiles.manifest)
      expect(await fs.readFile(path.join(pluginDir('test-plugin'), 'main.js'), 'utf-8')).toBe(testFiles.bundle)
      expect(await fs.readFile(path.join(pluginDir('test-plugin'), 'styles.css'), 'utf-8')).toBe(testFiles.styles)
      await expect(fs.access(path.join(dataDir, 'plugins', 'vault-1', 'test-plugin', 'main.js'))).rejects.toThrow()
    })

    it('saves and loads plugin files correctly', async () => {
      await store.savePlugin('vault-1', 'test-plugin', testFiles)

      expect(await store.loadManifest('vault-1', 'test-plugin')).toEqual(testManifest)
      expect(await store.loadBundle('vault-1', 'test-plugin')).toBe(testFiles.bundle)
      expect(await store.loadStyles('vault-1', 'test-plugin')).toBe(testFiles.styles)
    })

    it('handles plugin without styles', async () => {
      await store.savePlugin('vault-1', 'no-styles', { manifest: testFiles.manifest, bundle: testFiles.bundle })

      expect(await store.loadStyles('vault-1', 'no-styles')).toBeNull()
      expect(await store.loadBundle('vault-1', 'no-styles')).toBe(testFiles.bundle)
    })

    it('normalizes the manifest id to the folder name', async () => {
      await store.savePlugin('vault-1', 'folder-name', { manifest: JSON.stringify({ ...testManifest, id: 'other' }), bundle: 'x' })

      expect((await store.loadManifest('vault-1', 'folder-name'))?.id).toBe('folder-name')
    })

    it('rejects plugin files exceeding 10 MB', async () => {
      const big = 'x'.repeat(10 * 1024 * 1024 + 1)
      await expect(store.savePlugin('vault-1', 'big', { manifest: testFiles.manifest, bundle: big })).rejects.toThrow(PluginFileTooLargeError)
      await expect(store.savePlugin('vault-1', 'big', { manifest: big, bundle: 'x' })).rejects.toThrow(PluginFileTooLargeError)
      await expect(store.savePlugin('vault-1', 'big', { manifest: testFiles.manifest, bundle: 'x', styles: big })).rejects.toThrow(PluginFileTooLargeError)
    })

    it('accepts the ids Obsidian plugins really have, including uppercase, dots and underscores', async () => {
      const ids = ['3d_embeds', 'ObsidianAnkiSync', 'scrybble.ink', 'waka_time_box']
      for (const id of ids) {
        await store.savePlugin('vault-1', id, { manifest: JSON.stringify({ ...testManifest, id }), bundle: id })
        expect(await store.loadBundle('vault-1', id)).toBe(id)
      }

      expect((await store.listPlugins('vault-1')).map((m) => m.id).sort()).toEqual(ids)
    })

    it('rejects invalid plugin ids', async () => {
      await expect(store.savePlugin('vault-1', '../escape', testFiles)).rejects.toThrow()
      await expect(store.savePlugin('vault-1', '_registry.json', testFiles)).rejects.toThrow()
      await expect(store.savePlugin('vault-1', 'trailing.', testFiles)).rejects.toThrow()
    })

    it('throws for an unknown vault', async () => {
      await expect(store.savePlugin('unknown', 'test-plugin', testFiles)).rejects.toThrow(PluginVaultUnavailableError)
      await expect(store.listPlugins('unknown')).rejects.toThrow(PluginVaultUnavailableError)
    })
  })

  describe('reading what Obsidian (or a sync) put into the vault', () => {
    it('reads a plugin that was not installed through Slatebase', async () => {
      await fs.mkdir(pluginDir('from-obsidian'), { recursive: true })
      await fs.writeFile(path.join(pluginDir('from-obsidian'), 'manifest.json'), JSON.stringify({ ...testManifest, id: 'from-obsidian' }))
      await fs.writeFile(path.join(pluginDir('from-obsidian'), 'main.js'), 'bundle')
      await fs.writeFile(path.join(pluginDir('from-obsidian'), 'data.json'), '{"a":1}')

      expect((await store.listPlugins('vault-1')).map((m) => m.id)).toEqual(['from-obsidian'])
      expect(await store.loadBundle('vault-1', 'from-obsidian')).toBe('bundle')
      expect(await store.loadSettings('vault-1', 'from-obsidian')).toBe('{"a":1}')
    })

    it('treats a symlinked bundle that leaves the vault as absent', async () => {
      const outside = path.join(root, 'secret.js')
      await fs.writeFile(outside, 'secret')
      await fs.mkdir(pluginDir('evil'), { recursive: true })
      await fs.writeFile(path.join(pluginDir('evil'), 'manifest.json'), JSON.stringify({ ...testManifest, id: 'evil' }))
      try {
        await fs.symlink(outside, path.join(pluginDir('evil'), 'main.js'))
      } catch {
        return // symlinks unavailable (e.g. Windows without privileges)
      }

      expect(await store.loadBundle('vault-1', 'evil')).toBeNull()
    })

    it('treats a symlinked plugin folder that leaves the vault as absent', async () => {
      const outsideDir = path.join(root, 'outside-plugin')
      await fs.mkdir(outsideDir, { recursive: true })
      await fs.writeFile(path.join(outsideDir, 'manifest.json'), JSON.stringify(testManifest))
      await fs.writeFile(path.join(outsideDir, 'main.js'), 'secret')
      await fs.mkdir(path.dirname(pluginDir('linked')), { recursive: true })
      try {
        await fs.symlink(outsideDir, pluginDir('linked'))
      } catch {
        return
      }

      expect(await store.loadBundle('vault-1', 'linked')).toBeNull()
      expect(await store.loadManifest('vault-1', 'linked')).toBeNull()
      expect(await store.listPlugins('vault-1')).toEqual([])
    })

    it('refuses to read a bundle over 10 MB', async () => {
      await fs.mkdir(pluginDir('huge'), { recursive: true })
      await fs.writeFile(path.join(pluginDir('huge'), 'main.js'), 'x'.repeat(10 * 1024 * 1024 + 1))

      await expect(store.loadBundle('vault-1', 'huge')).rejects.toThrow(PluginFileTooLargeError)
    })
  })

  describe('loadManifest / loadBundle / loadStyles - missing files', () => {
    it('returns null for a plugin that does not exist', async () => {
      expect(await store.loadManifest('vault-1', 'nonexistent')).toBeNull()
      expect(await store.loadBundle('vault-1', 'nonexistent')).toBeNull()
      expect(await store.loadStyles('vault-1', 'nonexistent')).toBeNull()
    })

    it('returns null for an unparsable manifest', async () => {
      await fs.mkdir(pluginDir('broken'), { recursive: true })
      await fs.writeFile(path.join(pluginDir('broken'), 'manifest.json'), '{ nope')

      expect(await store.loadManifest('vault-1', 'broken')).toBeNull()
    })
  })

  describe('saveSettings / loadSettings', () => {
    it('saves settings to data.json in the plugin folder and loads them back', async () => {
      const settings = JSON.stringify({ theme: 'dark', count: 42 })
      await store.saveSettings('vault-1', 'test-plugin', settings)

      expect(await fs.readFile(path.join(pluginDir('test-plugin'), 'data.json'), 'utf-8')).toBe(settings)
      expect(await store.loadSettings('vault-1', 'test-plugin')).toBe(settings)
    })

    it('returns null for non-existent settings', async () => {
      expect(await store.loadSettings('vault-1', 'no-settings')).toBeNull()
    })

    it('rejects settings exceeding 1 MB', async () => {
      await expect(store.saveSettings('vault-1', 'test-plugin', 'x'.repeat(1024 * 1024 + 1))).rejects.toThrow(PluginSettingsTooLargeError)
    })

    it('allows settings exactly at 1 MB', async () => {
      const exact = 'x'.repeat(1024 * 1024)
      await store.saveSettings('vault-1', 'test-plugin', exact)

      expect(await store.loadSettings('vault-1', 'test-plugin')).toBe(exact)
    })

    it('refuses to load a data.json over 1 MB', async () => {
      await fs.mkdir(pluginDir('chatty'), { recursive: true })
      await fs.writeFile(path.join(pluginDir('chatty'), 'data.json'), 'x'.repeat(1024 * 1024 + 1))

      await expect(store.loadSettings('vault-1', 'chatty')).rejects.toThrow(PluginSettingsTooLargeError)
    })
  })

  describe('saveRegistry / loadRegistry (server-local, outside the vault)', () => {
    it('saves and loads the registry under data/plugins/<vaultId>', async () => {
      const registry: PluginRegistryData = {
        version: 1,
        plugins: {
          'test-plugin': {
            status: 'active',
            permissions: { network: true, networkAllowlist: ['example.com'], filesystemWrite: false, domManipulation: true },
            compatibilityLevel: 'full',
            installedAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
        },
      }
      await store.saveRegistry('vault-1', registry)

      expect(await store.loadRegistry('vault-1')).toEqual(registry)
      await expect(fs.access(path.join(dataDir, 'plugins', 'vault-1', '_registry.json'))).resolves.toBeUndefined()
      await expect(fs.access(path.join(vaultPath, '.obsidian', 'plugins', '_registry.json'))).rejects.toThrow()
    })

    it('returns null when no registry exists', async () => {
      expect(await store.loadRegistry('vault-1')).toBeNull()
    })

    it('does not lose either plugin entry when two mutateRegistry calls race', async () => {
      const entry = (status: 'active' | 'inactive') => ({
        status,
        permissions: { network: false, networkAllowlist: [], filesystemWrite: false, domManipulation: false },
        compatibilityLevel: 'unknown' as const,
        installedAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      })

      await Promise.all([
        store.mutateRegistry('vault-1', (current) => ({ version: 1, plugins: { ...(current?.plugins ?? {}), a: entry('active') } })),
        store.mutateRegistry('vault-1', (current) => ({ version: 1, plugins: { ...(current?.plugins ?? {}), b: entry('inactive') } })),
      ])

      expect(Object.keys((await store.loadRegistry('vault-1'))?.plugins ?? {}).sort()).toEqual(['a', 'b'])
    })
  })

  describe('listPlugins', () => {
    it('lists all plugins of the vault', async () => {
      await store.savePlugin('vault-1', 'plugin-a', { manifest: JSON.stringify({ ...testManifest, id: 'plugin-a', name: 'A' }), bundle: 'a' })
      await store.savePlugin('vault-1', 'plugin-b', { manifest: JSON.stringify({ ...testManifest, id: 'plugin-b', name: 'B' }), bundle: 'b' })

      expect((await store.listPlugins('vault-1')).map((m) => m.id).sort()).toEqual(['plugin-a', 'plugin-b'])
    })

    it('returns an empty array when the vault has no plugins folder', async () => {
      expect(await store.listPlugins('vault-1')).toEqual([])
    })

    it('skips folders without a valid manifest, invalid ids and plain files', async () => {
      await store.savePlugin('vault-1', 'good', { manifest: JSON.stringify({ ...testManifest, id: 'good' }), bundle: 'g' })
      await fs.mkdir(pluginDir('no-manifest'), { recursive: true })
      await fs.writeFile(path.join(pluginDir('no-manifest'), 'main.js'), 'x')
      await fs.mkdir(pluginDir('_hidden'), { recursive: true })
      await fs.writeFile(path.join(pluginDir('_hidden'), 'manifest.json'), JSON.stringify(testManifest))
      await fs.writeFile(path.join(vaultPath, '.obsidian', 'plugins', 'stray.txt'), 'x')

      expect((await store.listPlugins('vault-1')).map((m) => m.id)).toEqual(['good'])
    })

    it('does not list the plugins of another vault', async () => {
      const otherPath = path.join(root, 'vault-2')
      await fs.mkdir(otherPath, { recursive: true })
      const both = new InstalledPluginStore(dataDir, (id) => (id === 'vault-1' ? vaultPath : otherPath))
      await both.savePlugin('vault-1', 'only-in-one', { manifest: JSON.stringify({ ...testManifest, id: 'only-in-one' }), bundle: 'x' })

      expect(await both.listPlugins('vault-2')).toEqual([])
    })
  })

  describe('deletePlugin', () => {
    it('deletes the plugin folder, its secrets and its entry in community-plugins.json', async () => {
      await store.savePlugin('vault-1', 'test-plugin', testFiles)
      await store.savePlugin('vault-1', 'keep', { manifest: JSON.stringify({ ...testManifest, id: 'keep' }), bundle: 'k' })
      await store.updateEnabledIds('vault-1', () => ['test-plugin', 'keep'])
      const secretsDir = path.join(dataDir, 'plugins', 'vault-1', 'test-plugin')
      await fs.mkdir(secretsDir, { recursive: true })
      await fs.writeFile(path.join(secretsDir, 'secrets.json'), '{}')

      await store.deletePlugin('vault-1', 'test-plugin')

      expect(await store.loadManifest('vault-1', 'test-plugin')).toBeNull()
      await expect(fs.access(secretsDir)).rejects.toThrow()
      expect(await store.loadEnabledIds('vault-1')).toEqual(['keep'])
      expect((await store.listPlugins('vault-1')).map((m) => m.id)).toEqual(['keep'])
    })

    it('does nothing for a plugin that does not exist', async () => {
      await expect(store.deletePlugin('vault-1', 'nonexistent')).resolves.toBeUndefined()
      await expect(fs.access(enabledFile())).rejects.toThrow()
    })

    it('still deletes when community-plugins.json is invalid, and leaves that file untouched', async () => {
      await store.savePlugin('vault-1', 'test-plugin', testFiles)
      await fs.writeFile(enabledFile(), '{ broken')

      await store.deletePlugin('vault-1', 'test-plugin')

      expect(await store.loadManifest('vault-1', 'test-plugin')).toBeNull()
      expect(await fs.readFile(enabledFile(), 'utf-8')).toBe('{ broken')
    })
  })

  describe('deleteAllForVault', () => {
    it('removes the server-side data but leaves the plugins in the vault', async () => {
      await store.savePlugin('vault-1', 'test-plugin', testFiles)
      await store.saveRegistry('vault-1', emptyRegistry())
      await fs.mkdir(path.join(dataDir, 'plugins', 'vault-1', 'test-plugin'), { recursive: true })

      await store.deleteAllForVault('vault-1')

      expect(await store.loadRegistry('vault-1')).toBeNull()
      await expect(fs.access(path.join(dataDir, 'plugins', 'vault-1'))).rejects.toThrow()
      expect(await store.loadBundle('vault-1', 'test-plugin')).toBe(testFiles.bundle)
    })

    it('does nothing when there is no server-side data', async () => {
      await expect(store.deleteAllForVault('vault-1')).resolves.toBeUndefined()
    })
  })

  describe('community-plugins.json', () => {
    it('is empty when the file does not exist', async () => {
      expect(await store.loadEnabledIds('vault-1')).toEqual([])
    })

    it('reads the list Obsidian wrote', async () => {
      await fs.mkdir(path.dirname(enabledFile()), { recursive: true })
      await fs.writeFile(enabledFile(), JSON.stringify(['dataview', 'calendar']))

      expect(await store.loadEnabledIds('vault-1')).toEqual(['dataview', 'calendar'])
    })

    it('adds and removes ids and keeps the order of the rest', async () => {
      await fs.mkdir(path.dirname(enabledFile()), { recursive: true })
      await fs.writeFile(enabledFile(), JSON.stringify(['a', 'b', 'c']))

      await store.updateEnabledIds('vault-1', (ids) => [...ids.filter((id) => id !== 'b'), 'd'])

      expect(JSON.parse(await fs.readFile(enabledFile(), 'utf-8'))).toEqual(['a', 'c', 'd'])
    })

    it('does not create the file when nothing is enabled', async () => {
      await store.updateEnabledIds('vault-1', (ids) => ids)

      await expect(fs.access(enabledFile())).rejects.toThrow()
    })

    it('never overwrites a file that is not a JSON array', async () => {
      await fs.mkdir(path.dirname(enabledFile()), { recursive: true })
      for (const broken of ['{ broken', '{"a":1}']) {
        await fs.writeFile(enabledFile(), broken)

        await expect(store.updateEnabledIds('vault-1', (ids) => [...ids, 'x'])).rejects.toThrow(CommunityPluginsFileInvalidError)
        expect(await fs.readFile(enabledFile(), 'utf-8')).toBe(broken)
        expect(await store.loadEnabledIds('vault-1')).toEqual([])
      }
    })

    it('does not lose either change when two updates race', async () => {
      await Promise.all([
        store.updateEnabledIds('vault-1', (ids) => [...ids, 'a']),
        store.updateEnabledIds('vault-1', (ids) => [...ids, 'b']),
      ])

      expect((await store.loadEnabledIds('vault-1')).sort()).toEqual(['a', 'b'])
    })
  })

  describe('atomic writes', () => {
    it('leaves no temp files behind', async () => {
      await store.savePlugin('vault-1', 'test-plugin', testFiles)
      await store.saveSettings('vault-1', 'test-plugin', '{"a":1}')
      await store.updateEnabledIds('vault-1', () => ['test-plugin'])

      const leftovers = [
        ...(await fs.readdir(pluginDir('test-plugin'))),
        ...(await fs.readdir(path.join(vaultPath, '.obsidian'))),
      ].filter((name) => name.endsWith('.tmp'))
      expect(leftovers).toEqual([])
    })
  })
})
