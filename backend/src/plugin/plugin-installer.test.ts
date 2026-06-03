import { describe, it, expect, beforeEach } from 'vitest'
import AdmZip from 'adm-zip'
import { PluginInstaller, PluginInstallError, compareSemver } from './plugin-installer.js'
import type { IPluginStore, PluginManifest, PluginFiles, PluginRegistryData } from './types.js'

// ─── Mock PluginStore ────────────────────────────────────────────────────────

function createMockPluginStore(overrides?: Partial<IPluginStore>): IPluginStore & {
  savedPlugins: Array<{ vaultId: string; pluginId: string; files: PluginFiles }>;
} {
  const savedPlugins: Array<{ vaultId: string; pluginId: string; files: PluginFiles }> = []
  return {
    savedPlugins,
    async savePlugin(vaultId: string, pluginId: string, files: PluginFiles): Promise<void> {
      savedPlugins.push({ vaultId, pluginId, files })
    },
    async loadManifest(_vaultId: string, _pluginId: string): Promise<PluginManifest | null> {
      return null
    },
    async loadBundle(): Promise<string | null> { return null },
    async loadStyles(): Promise<string | null> { return null },
    async saveSettings(): Promise<void> { /* no-op */ },
    async loadSettings(): Promise<string | null> { return null },
    async listPlugins(): Promise<PluginManifest[]> { return [] },
    async deletePlugin(): Promise<void> { /* no-op */ },
    async deleteAllForVault(): Promise<void> { /* no-op */ },
    async saveRegistry(): Promise<void> { /* no-op */ },
    async loadRegistry(): Promise<PluginRegistryData | null> { return null },
    ...overrides,
  }
}

// ─── Helper: Create valid ZIP with plugin files ──────────────────────────────

function createPluginZip(options?: {
  manifest?: Record<string, unknown>;
  bundle?: string;
  styles?: string;
  subdir?: string;
}): Buffer {
  const manifest = options?.manifest ?? {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin',
  }
  const bundle = options?.bundle ?? 'module.exports = class TestPlugin { onload() {} onunload() {} };'
  const prefix = options?.subdir ? `${options.subdir}/` : ''

  const zip = new AdmZip()
  zip.addFile(`${prefix}manifest.json`, Buffer.from(JSON.stringify(manifest), 'utf-8'))
  zip.addFile(`${prefix}main.js`, Buffer.from(bundle, 'utf-8'))
  if (options?.styles !== undefined) {
    zip.addFile(`${prefix}styles.css`, Buffer.from(options.styles, 'utf-8'))
  }
  return zip.toBuffer()
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PluginInstaller', () => {
  let store: ReturnType<typeof createMockPluginStore>
  let installer: PluginInstaller

  beforeEach(() => {
    store = createMockPluginStore()
    installer = new PluginInstaller(store)
  })

  describe('installFromZip — successful installation', () => {
    it('installs a valid plugin from root-level ZIP', async () => {
      const zipBuffer = createPluginZip()
      const result = await installer.installFromZip('vault-1', zipBuffer)

      expect(result.pluginId).toBe('test-plugin')
      expect(result.manifest.id).toBe('test-plugin')
      expect(result.manifest.name).toBe('Test Plugin')
      expect(result.manifest.version).toBe('1.0.0')
      expect(result.isUpgrade).toBe(false)
      expect(store.savedPlugins).toHaveLength(1)
      expect(store.savedPlugins[0]!.vaultId).toBe('vault-1')
      expect(store.savedPlugins[0]!.pluginId).toBe('test-plugin')
    })

    it('installs a valid plugin from single subdirectory ZIP', async () => {
      const zipBuffer = createPluginZip({ subdir: 'my-plugin' })
      const result = await installer.installFromZip('vault-1', zipBuffer)

      expect(result.pluginId).toBe('test-plugin')
      expect(result.isUpgrade).toBe(false)
    })

    it('includes styles.css when present', async () => {
      const zipBuffer = createPluginZip({ styles: '.my-class { color: red; }' })
      await installer.installFromZip('vault-1', zipBuffer)

      expect(store.savedPlugins[0]!.files.styles).toBe('.my-class { color: red; }')
    })

    it('omits styles when not present in ZIP', async () => {
      const zipBuffer = createPluginZip()
      await installer.installFromZip('vault-1', zipBuffer)

      expect(store.savedPlugins[0]!.files.styles).toBeUndefined()
    })
  })

  describe('installFromZip — ZIP size validation', () => {
    it('rejects ZIP files larger than 5 MB', async () => {
      // Create a buffer larger than 5 MB
      const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 0)

      await expect(installer.installFromZip('vault-1', largeBuffer))
        .rejects.toThrow(PluginInstallError)

      await expect(installer.installFromZip('vault-1', largeBuffer))
        .rejects.toMatchObject({ code: 'ZIP_TOO_LARGE' })
    })
  })

  describe('installFromZip — ZIP parsing', () => {
    it('rejects corrupted/invalid ZIP data', async () => {
      const invalidBuffer = Buffer.from('this is not a zip file', 'utf-8')

      await expect(installer.installFromZip('vault-1', invalidBuffer))
        .rejects.toThrow(PluginInstallError)

      await expect(installer.installFromZip('vault-1', invalidBuffer))
        .rejects.toMatchObject({ code: 'ZIP_INVALID' })
    })
  })

  describe('installFromZip — missing required files', () => {
    it('rejects ZIP without manifest.json', async () => {
      const zip = new AdmZip()
      zip.addFile('main.js', Buffer.from('// code', 'utf-8'))
      const zipBuffer = zip.toBuffer()

      await expect(installer.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'MISSING_FILES' })
    })

    it('rejects ZIP without main.js', async () => {
      const zip = new AdmZip()
      zip.addFile('manifest.json', Buffer.from('{"id":"x","name":"X","version":"1.0.0"}', 'utf-8'))
      const zipBuffer = zip.toBuffer()

      await expect(installer.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'MISSING_FILES' })
    })

    it('rejects ZIP with no plugin files at all', async () => {
      const zip = new AdmZip()
      zip.addFile('readme.txt', Buffer.from('Hello', 'utf-8'))
      const zipBuffer = zip.toBuffer()

      await expect(installer.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'MISSING_FILES' })
    })
  })

  describe('installFromZip — manifest validation', () => {
    it('rejects manifest with invalid JSON', async () => {
      const zip = new AdmZip()
      zip.addFile('manifest.json', Buffer.from('{ invalid json }', 'utf-8'))
      zip.addFile('main.js', Buffer.from('// code', 'utf-8'))
      const zipBuffer = zip.toBuffer()

      await expect(installer.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'MANIFEST_INVALID_JSON' })
    })

    it('rejects manifest with missing required fields', async () => {
      const zipBuffer = createPluginZip({
        manifest: { name: 'Plugin', version: '1.0.0' }, // missing id
      })

      await expect(installer.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'MANIFEST_VALIDATION_FAILED' })
    })

    it('rejects manifest with invalid semver version', async () => {
      const zipBuffer = createPluginZip({
        manifest: { id: 'test', name: 'Test', version: 'invalid' },
      })

      await expect(installer.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'MANIFEST_VALIDATION_FAILED' })
    })
  })

  describe('installFromZip — bundle integrity', () => {
    it('rejects bundle containing eval(', async () => {
      const zipBuffer = createPluginZip({
        bundle: 'const x = eval("1+1");',
      })

      await expect(installer.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'BUNDLE_UNSAFE' })
    })

    it('rejects bundle containing new Function(', async () => {
      const zipBuffer = createPluginZip({
        bundle: 'const fn = new Function("return 1");',
      })

      await expect(installer.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'BUNDLE_UNSAFE' })
    })

    it('rejects bundle containing document.write(', async () => {
      const zipBuffer = createPluginZip({
        bundle: 'document.write("<h1>Hello</h1>");',
      })

      await expect(installer.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'BUNDLE_UNSAFE' })
    })

    it('allows bundle without unsafe patterns', async () => {
      const zipBuffer = createPluginZip({
        bundle: 'console.log("safe code"); function evaluate() {}',
      })

      const result = await installer.installFromZip('vault-1', zipBuffer)
      expect(result.pluginId).toBe('test-plugin')
    })
  })

  describe('installFromZip — extracted size validation', () => {
    it('rejects if total extracted size exceeds 10 MB', async () => {
      // Create a ZIP with a large file (>10 MB uncompressed)
      const largeContent = 'x'.repeat(10 * 1024 * 1024 + 1)
      const zip = new AdmZip()
      zip.addFile('manifest.json', Buffer.from(JSON.stringify({
        id: 'large-plugin', name: 'Large', version: '1.0.0',
      }), 'utf-8'))
      zip.addFile('main.js', Buffer.from(largeContent, 'utf-8'))
      const zipBuffer = zip.toBuffer()

      // This might also fail ZIP_TOO_LARGE depending on compression,
      // so we check for either error
      await expect(installer.installFromZip('vault-1', zipBuffer))
        .rejects.toThrow(PluginInstallError)
    })
  })

  describe('installFromZip — version upgrade logic', () => {
    it('upgrades plugin when new version is higher', async () => {
      const storeWithExisting = createMockPluginStore({
        async loadManifest(_vaultId: string, _pluginId: string): Promise<PluginManifest | null> {
          return { id: 'test-plugin', name: 'Test', version: '1.0.0' }
        },
      })
      const inst = new PluginInstaller(storeWithExisting)

      const zipBuffer = createPluginZip({
        manifest: { id: 'test-plugin', name: 'Test Plugin', version: '2.0.0' },
      })

      const result = await inst.installFromZip('vault-1', zipBuffer)
      expect(result.isUpgrade).toBe(true)
      expect(result.manifest.version).toBe('2.0.0')
    })

    it('rejects upload with same version', async () => {
      const storeWithExisting = createMockPluginStore({
        async loadManifest(): Promise<PluginManifest | null> {
          return { id: 'test-plugin', name: 'Test', version: '1.0.0' }
        },
      })
      const inst = new PluginInstaller(storeWithExisting)

      const zipBuffer = createPluginZip({
        manifest: { id: 'test-plugin', name: 'Test Plugin', version: '1.0.0' },
      })

      await expect(inst.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'VERSION_NOT_HIGHER' })
    })

    it('rejects upload with lower version', async () => {
      const storeWithExisting = createMockPluginStore({
        async loadManifest(): Promise<PluginManifest | null> {
          return { id: 'test-plugin', name: 'Test', version: '2.0.0' }
        },
      })
      const inst = new PluginInstaller(storeWithExisting)

      const zipBuffer = createPluginZip({
        manifest: { id: 'test-plugin', name: 'Test Plugin', version: '1.5.0' },
      })

      await expect(inst.installFromZip('vault-1', zipBuffer))
        .rejects.toMatchObject({ code: 'VERSION_NOT_HIGHER' })
    })

    it('preserves data.json on upgrade (savePlugin does not touch settings)', async () => {
      // The PluginInstaller calls savePlugin which only saves manifest/bundle/styles.
      // data.json is never written by installFromZip — it's preserved by not touching it.
      const storeWithExisting = createMockPluginStore({
        async loadManifest(): Promise<PluginManifest | null> {
          return { id: 'test-plugin', name: 'Test', version: '1.0.0' }
        },
      })
      const inst = new PluginInstaller(storeWithExisting)

      const zipBuffer = createPluginZip({
        manifest: { id: 'test-plugin', name: 'Test Plugin Updated', version: '2.0.0' },
      })

      const result = await inst.installFromZip('vault-1', zipBuffer)
      expect(result.isUpgrade).toBe(true)
      // savePlugin only receives manifest + bundle (+ styles), not settings
      expect(storeWithExisting.savedPlugins[0]!.files).not.toHaveProperty('settings')
    })
  })
})

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('2.5.3', '2.5.3')).toBe(0)
  })

  it('returns 1 when first is greater', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1)
    expect(compareSemver('1.1.0', '1.0.0')).toBe(1)
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1)
  })

  it('returns -1 when first is smaller', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1)
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1)
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1)
  })

  it('compares major version with highest precedence', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1)
    expect(compareSemver('1.9.9', '2.0.0')).toBe(-1)
  })

  it('compares minor version with medium precedence', () => {
    expect(compareSemver('1.2.0', '1.1.9')).toBe(1)
  })
})
