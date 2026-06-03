import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { PluginStore } from './plugin-store.js'
import { PluginFileTooLargeError, PluginSettingsTooLargeError } from './errors.js'
import type { PluginFiles, PluginManifest, PluginRegistryData } from './types.js'

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tmpDir: string
let store: PluginStore

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `plugin-store-test-${crypto.randomBytes(8).toString('hex')}`)
  await fs.mkdir(tmpDir, { recursive: true })
  store = new PluginStore(tmpDir)
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PluginStore', () => {
  describe('savePlugin / loadManifest / loadBundle / loadStyles', () => {
    it('saves and loads plugin files correctly', async () => {
      await store.savePlugin('vault-1', 'test-plugin', testFiles)

      const manifest = await store.loadManifest('vault-1', 'test-plugin')
      expect(manifest).toEqual(testManifest)

      const bundle = await store.loadBundle('vault-1', 'test-plugin')
      expect(bundle).toBe(testFiles.bundle)

      const styles = await store.loadStyles('vault-1', 'test-plugin')
      expect(styles).toBe(testFiles.styles)
    })

    it('handles plugin without styles', async () => {
      const filesNoStyles: PluginFiles = {
        manifest: JSON.stringify(testManifest, null, 2),
        bundle: 'module.exports = class {}',
      }

      await store.savePlugin('vault-1', 'no-styles-plugin', filesNoStyles)

      const styles = await store.loadStyles('vault-1', 'no-styles-plugin')
      expect(styles).toBeNull()
    })

    it('rejects plugin files exceeding 5 MB', async () => {
      const largeContent = 'x'.repeat(5 * 1024 * 1024 + 1)
      const largeFiles: PluginFiles = {
        manifest: JSON.stringify(testManifest, null, 2),
        bundle: largeContent,
      }

      await expect(store.savePlugin('vault-1', 'large-plugin', largeFiles))
        .rejects.toThrow(PluginFileTooLargeError)
    })

    it('rejects large manifest', async () => {
      const largeManifest = 'x'.repeat(5 * 1024 * 1024 + 1)
      const files: PluginFiles = {
        manifest: largeManifest,
        bundle: 'module.exports = class {}',
      }

      await expect(store.savePlugin('vault-1', 'large-manifest', files))
        .rejects.toThrow(PluginFileTooLargeError)
    })

    it('rejects large styles', async () => {
      const largeStyles = 'x'.repeat(5 * 1024 * 1024 + 1)
      const files: PluginFiles = {
        manifest: JSON.stringify(testManifest, null, 2),
        bundle: 'module.exports = class {}',
        styles: largeStyles,
      }

      await expect(store.savePlugin('vault-1', 'large-styles', files))
        .rejects.toThrow(PluginFileTooLargeError)
    })
  })

  describe('loadManifest / loadBundle / loadStyles - missing files', () => {
    it('returns null for non-existent manifest', async () => {
      const result = await store.loadManifest('vault-1', 'non-existent')
      expect(result).toBeNull()
    })

    it('returns null for non-existent bundle', async () => {
      const result = await store.loadBundle('vault-1', 'non-existent')
      expect(result).toBeNull()
    })

    it('returns null for non-existent styles', async () => {
      const result = await store.loadStyles('vault-1', 'non-existent')
      expect(result).toBeNull()
    })

    it('returns null for non-existent vault', async () => {
      const result = await store.loadManifest('non-existent-vault', 'test-plugin')
      expect(result).toBeNull()
    })
  })

  describe('saveSettings / loadSettings', () => {
    it('saves and loads settings correctly', async () => {
      const settings = JSON.stringify({ theme: 'dark', fontSize: 14 })
      await store.saveSettings('vault-1', 'test-plugin', settings)

      const loaded = await store.loadSettings('vault-1', 'test-plugin')
      expect(loaded).toBe(settings)
    })

    it('returns null for non-existent settings', async () => {
      const result = await store.loadSettings('vault-1', 'no-settings-plugin')
      expect(result).toBeNull()
    })

    it('rejects settings exceeding 1 MB', async () => {
      const largeSettings = 'x'.repeat(1 * 1024 * 1024 + 1)

      await expect(store.saveSettings('vault-1', 'test-plugin', largeSettings))
        .rejects.toThrow(PluginSettingsTooLargeError)
    })

    it('allows settings exactly at 1 MB', async () => {
      // 1 MB of single-byte characters = exactly 1 MB
      const exactSettings = 'a'.repeat(1 * 1024 * 1024)

      await store.saveSettings('vault-1', 'exact-size-plugin', exactSettings)
      const loaded = await store.loadSettings('vault-1', 'exact-size-plugin')
      expect(loaded).toBe(exactSettings)
    })
  })

  describe('saveRegistry / loadRegistry', () => {
    it('saves and loads registry correctly', async () => {
      const registry: PluginRegistryData = {
        version: 1,
        plugins: {
          'test-plugin': {
            status: 'active',
            permissions: {
              network: false,
              networkAllowlist: [],
              filesystemWrite: true,
              domManipulation: false,
            },
            compatibilityLevel: 'full',
            installedAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
        },
      }

      await store.saveRegistry('vault-2', registry)

      const loaded = await store.loadRegistry('vault-2')
      expect(loaded).toEqual(registry)
    })

    it('returns null for non-existent registry', async () => {
      const result = await store.loadRegistry('non-existent-vault')
      expect(result).toBeNull()
    })
  })

  describe('listPlugins', () => {
    it('lists all plugins for a vault', async () => {
      const vaultId = 'vault-list-test'

      const plugin1: PluginManifest = { id: 'plugin-a', name: 'Plugin A', version: '1.0.0' }
      const plugin2: PluginManifest = { id: 'plugin-b', name: 'Plugin B', version: '2.0.0' }

      await store.savePlugin(vaultId, 'plugin-a', {
        manifest: JSON.stringify(plugin1, null, 2),
        bundle: 'module.exports = class {}',
      })
      await store.savePlugin(vaultId, 'plugin-b', {
        manifest: JSON.stringify(plugin2, null, 2),
        bundle: 'module.exports = class {}',
      })

      const plugins = await store.listPlugins(vaultId)
      expect(plugins).toHaveLength(2)

      const ids = plugins.map(p => p.id)
      expect(ids).toContain('plugin-a')
      expect(ids).toContain('plugin-b')
    })

    it('returns empty array for non-existent vault', async () => {
      const plugins = await store.listPlugins('non-existent-vault')
      expect(plugins).toEqual([])
    })

    it('skips directories without valid manifest', async () => {
      const vaultId = 'vault-skip-test'

      // Create a valid plugin
      await store.savePlugin(vaultId, 'valid-plugin', {
        manifest: JSON.stringify({ id: 'valid-plugin', name: 'Valid', version: '1.0.0' }, null, 2),
        bundle: 'module.exports = class {}',
      })

      // Create a directory without manifest
      const badDir = path.join(tmpDir, 'plugins', vaultId, 'bad-plugin')
      await fs.mkdir(badDir, { recursive: true })
      await fs.writeFile(path.join(badDir, 'main.js'), 'no manifest here')

      const plugins = await store.listPlugins(vaultId)
      expect(plugins).toHaveLength(1)
      expect(plugins[0]!.id).toBe('valid-plugin')
    })

    it('skips _registry.json entry', async () => {
      const vaultId = 'vault-registry-skip'

      await store.savePlugin(vaultId, 'some-plugin', {
        manifest: JSON.stringify({ id: 'some-plugin', name: 'Some', version: '1.0.0' }, null, 2),
        bundle: 'module.exports = class {}',
      })

      await store.saveRegistry(vaultId, {
        version: 1,
        plugins: {},
      })

      const plugins = await store.listPlugins(vaultId)
      expect(plugins).toHaveLength(1)
      expect(plugins[0]!.id).toBe('some-plugin')
    })
  })

  describe('deletePlugin', () => {
    it('deletes a plugin and all its data', async () => {
      const vaultId = 'vault-delete-test'

      await store.savePlugin(vaultId, 'to-delete', {
        manifest: JSON.stringify({ id: 'to-delete', name: 'Delete Me', version: '1.0.0' }, null, 2),
        bundle: 'module.exports = class {}',
        styles: '.x {}',
      })
      await store.saveSettings(vaultId, 'to-delete', '{"key": "value"}')

      // Verify it exists
      const manifest = await store.loadManifest(vaultId, 'to-delete')
      expect(manifest).not.toBeNull()

      // Delete it
      await store.deletePlugin(vaultId, 'to-delete')

      // Verify it's gone
      expect(await store.loadManifest(vaultId, 'to-delete')).toBeNull()
      expect(await store.loadBundle(vaultId, 'to-delete')).toBeNull()
      expect(await store.loadStyles(vaultId, 'to-delete')).toBeNull()
      expect(await store.loadSettings(vaultId, 'to-delete')).toBeNull()
    })

    it('does nothing for non-existent plugin', async () => {
      // Should not throw
      await store.deletePlugin('vault-delete-test', 'non-existent')
    })
  })

  describe('deleteAllForVault', () => {
    it('deletes all plugins for a vault', async () => {
      const vaultId = 'vault-delete-all'

      await store.savePlugin(vaultId, 'plugin-x', {
        manifest: JSON.stringify({ id: 'plugin-x', name: 'X', version: '1.0.0' }, null, 2),
        bundle: 'module.exports = class {}',
      })
      await store.savePlugin(vaultId, 'plugin-y', {
        manifest: JSON.stringify({ id: 'plugin-y', name: 'Y', version: '1.0.0' }, null, 2),
        bundle: 'module.exports = class {}',
      })
      await store.saveRegistry(vaultId, { version: 1, plugins: {} })

      // Verify they exist
      const plugins = await store.listPlugins(vaultId)
      expect(plugins).toHaveLength(2)

      // Delete all
      await store.deleteAllForVault(vaultId)

      // Verify all gone
      expect(await store.listPlugins(vaultId)).toEqual([])
      expect(await store.loadRegistry(vaultId)).toBeNull()
    })

    it('does nothing for non-existent vault', async () => {
      // Should not throw
      await store.deleteAllForVault('non-existent-vault')
    })
  })

  describe('atomic writes', () => {
    it('no temp files remain after successful write', async () => {
      const vaultId = 'vault-atomic'

      await store.savePlugin(vaultId, 'atomic-test', {
        manifest: JSON.stringify({ id: 'atomic-test', name: 'Atomic', version: '1.0.0' }, null, 2),
        bundle: 'module.exports = class {}',
      })

      const dir = path.join(tmpDir, 'plugins', vaultId, 'atomic-test')
      const entries = await fs.readdir(dir)
      const tmpFiles = entries.filter(e => e.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)
    })
  })
})
