import { describe, it, expect } from 'vitest'
import { isValidPluginId, PLUGIN_ID_PATTERN, pluginManifestSchema } from './validation.js'

// ─── isValidPluginId ─────────────────────────────────────────────────────────

describe('isValidPluginId', () => {
  describe('accepts valid plugin IDs', () => {
    const validIds = [
      'my-plugin',
      'obsidian-git',
      'dataview',
      'a',
      '0-plugin',
      'plugin-123',
      'abc-def-ghi-jkl',
      'a'.repeat(64),
    ]

    for (const id of validIds) {
      it(`accepts "${id}"`, () => {
        expect(isValidPluginId(id)).toBe(true)
      })
    }
  })

  describe('rejects path traversal attempts', () => {
    const traversalIds = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32',
      '../other-vault/evil',
      'foo/../bar',
      '.',
      '..',
      './plugin',
    ]

    for (const id of traversalIds) {
      it(`rejects "${id}"`, () => {
        expect(isValidPluginId(id)).toBe(false)
      })
    }
  })

  describe('rejects IDs with forbidden characters', () => {
    const invalidIds = [
      'Plugin-Name',       // uppercase
      'my_plugin',         // underscore
      'my plugin',         // space
      'my/plugin',         // forward slash
      'my\\plugin',        // backslash
      'plugin.name',       // dot
      '-starts-with-dash', // starts with dash
      '',                  // empty
      'a'.repeat(65),      // exceeds 64 chars
      'plugin@name',       // at sign
      'plugin:name',       // colon (Windows path)
      '\x00evil',          // null byte
    ]

    for (const id of invalidIds) {
      // eslint-disable-next-line no-control-regex
      it(`rejects "${id.replace(/\x00/g, '\\x00')}"`, () => {
        expect(isValidPluginId(id)).toBe(false)
      })
    }
  })
})

// ─── PLUGIN_ID_PATTERN ───────────────────────────────────────────────────────

describe('PLUGIN_ID_PATTERN', () => {
  it('is anchored (cannot match partial strings)', () => {
    expect(PLUGIN_ID_PATTERN.test('valid-plugin\n../hack')).toBe(false)
  })
})

// ─── pluginManifestSchema (ID field) ─────────────────────────────────────────

describe('pluginManifestSchema — ID validation', () => {
  const validManifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
  }

  it('accepts a valid manifest', () => {
    const result = pluginManifestSchema.safeParse(validManifest)
    expect(result.success).toBe(true)
  })

  it('rejects manifest with path traversal in ID', () => {
    const result = pluginManifestSchema.safeParse({
      ...validManifest,
      id: '../../../other-vault/malicious',
    })
    expect(result.success).toBe(false)
  })

  it('rejects manifest with slashes in ID', () => {
    const result = pluginManifestSchema.safeParse({
      ...validManifest,
      id: 'my/nested/plugin',
    })
    expect(result.success).toBe(false)
  })

  it('rejects manifest with uppercase in ID', () => {
    const result = pluginManifestSchema.safeParse({
      ...validManifest,
      id: 'MyPlugin',
    })
    expect(result.success).toBe(false)
  })

  it('rejects manifest with ID exceeding 64 characters', () => {
    const result = pluginManifestSchema.safeParse({
      ...validManifest,
      id: 'a'.repeat(65),
    })
    expect(result.success).toBe(false)
  })

  it('rejects manifest with empty ID', () => {
    const result = pluginManifestSchema.safeParse({
      ...validManifest,
      id: '',
    })
    expect(result.success).toBe(false)
  })
})

// ─── PluginStore path safety (via installFromZip rejection) ──────────────────

describe('PluginInstaller — manifest ID path traversal', () => {
  it('rejects ZIP with path traversal in manifest ID via Zod schema', async () => {
    // This test verifies the end-to-end protection:
    // The Zod schema in pluginManifestSchema rejects the ID before it reaches PluginStore
    const { PluginInstaller, PluginInstallError } = await import('./plugin-installer.js')
    const { default: AdmZip } = await import('adm-zip')

    const mockStore = {
      savePlugin: async () => {},
      loadManifest: async () => null,
      loadBundle: async () => null,
      loadStyles: async () => null,
      saveSettings: async () => {},
      loadSettings: async () => null,
      listPlugins: async () => [],
      deletePlugin: async () => {},
      deleteAllForVault: async () => {},
      saveRegistry: async () => {},
      loadRegistry: async () => null,
    }

    const installer = new PluginInstaller(mockStore)

    const zip = new AdmZip()
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({
      id: '../../../etc/evil',
      name: 'Evil Plugin',
      version: '1.0.0',
    }), 'utf-8'))
    zip.addFile('main.js', Buffer.from('module.exports = {};', 'utf-8'))

    await expect(installer.installFromZip('vault-1', zip.toBuffer()))
      .rejects.toThrow(PluginInstallError)

    await expect(installer.installFromZip('vault-1', zip.toBuffer()))
      .rejects.toMatchObject({ code: 'MANIFEST_VALIDATION_FAILED' })
  })
})
