import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import { InstalledPluginStore } from './installed-plugin-store.js'
import { LEGACY_PLUGINS_MIGRATED_MARKER, migrateLegacyPlugins } from './legacy-migration.js'

let root: string
let dataDir: string
let vaultPath: string
let store: InstalledPluginStore

const logger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

function registryOf(entries: VaultRegistryEntry[]): IVaultRegistry {
  return {
    load: async () => entries,
    save: async () => {},
    addEntry: async () => {},
    removeEntry: async () => {},
    findById: () => null,
    findByName: () => null,
    updateEntries: async (mutator) => mutator([]),
  }
}

const entry = (): VaultRegistryEntry => ({
  id: 'v1',
  name: 'Vault',
  storagePath: vaultPath,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerId: 'u1',
})

const legacyDir = (): string => path.join(dataDir, 'plugins', 'v1')
const run = (): Promise<void> => migrateLegacyPlugins({ dataDir, vaultRegistry: registryOf([entry()]), pluginStore: store, logger })

function manifestOf(id: string): string {
  return JSON.stringify({ id, name: id, version: '1.0.0' })
}

async function writeLegacyPlugin(id: string, extra: { styles?: string; data?: string } = {}): Promise<void> {
  const dir = path.join(legacyDir(), id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'manifest.json'), manifestOf(id))
  await fs.writeFile(path.join(dir, 'main.js'), `// ${id}`)
  if (extra.styles !== undefined) await fs.writeFile(path.join(dir, 'styles.css'), extra.styles)
  if (extra.data !== undefined) await fs.writeFile(path.join(dir, 'data.json'), extra.data)
}

async function writeLegacyRegistry(active: string[], inactive: string[] = []): Promise<void> {
  const base = {
    permissions: { network: false, networkAllowlist: [], filesystemWrite: false, domManipulation: false },
    compatibilityLevel: 'full',
    installedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const plugins = {
    ...Object.fromEntries(active.map((id) => [id, { ...base, status: 'active' }])),
    ...Object.fromEntries(inactive.map((id) => [id, { ...base, status: 'inactive' }])),
  }
  await fs.mkdir(legacyDir(), { recursive: true })
  await fs.writeFile(path.join(legacyDir(), '_registry.json'), JSON.stringify({ version: 1, plugins }))
}

const markerExists = (): Promise<boolean> =>
  fs.access(path.join(legacyDir(), LEGACY_PLUGINS_MIGRATED_MARKER)).then(() => true, () => false)

beforeEach(async () => {
  root = path.join(os.tmpdir(), `plugin-migration-${crypto.randomBytes(8).toString('hex')}`)
  dataDir = path.join(root, 'data')
  vaultPath = path.join(root, 'vault')
  await fs.mkdir(dataDir, { recursive: true })
  await fs.mkdir(vaultPath, { recursive: true })
  store = new InstalledPluginStore(dataDir, (vaultId) => (vaultId === 'v1' ? vaultPath : null))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('migrateLegacyPlugins', () => {
  it('copies plugin files and settings into the vault and lists the active plugins', async () => {
    await writeLegacyPlugin('alpha', { styles: '.a{}', data: '{"k":1}' })
    await writeLegacyPlugin('beta')
    await writeLegacyRegistry(['alpha'], ['beta'])

    await run()

    expect((await store.listPlugins('v1')).map((m) => m.id).sort()).toEqual(['alpha', 'beta'])
    expect(await store.loadBundle('v1', 'alpha')).toBe('// alpha')
    expect(await store.loadStyles('v1', 'alpha')).toBe('.a{}')
    expect(await store.loadSettings('v1', 'alpha')).toBe('{"k":1}')
    expect(await store.loadEnabledIds('v1')).toEqual(['alpha'])
    expect(await markerExists()).toBe(true)
  })

  it('leaves the registry, the secrets and the old files where they are', async () => {
    await writeLegacyPlugin('alpha')
    await writeLegacyRegistry(['alpha'])
    await fs.writeFile(path.join(legacyDir(), 'alpha', 'secrets.json'), '{"version":1}')

    await run()

    expect(await store.loadRegistry('v1')).not.toBeNull()
    expect(await fs.readFile(path.join(legacyDir(), 'alpha', 'secrets.json'), 'utf-8')).toBe('{"version":1}')
    expect(await fs.readFile(path.join(legacyDir(), 'alpha', 'main.js'), 'utf-8')).toBe('// alpha')
  })

  it('keeps the vault version when a plugin exists in both places, but fills a missing data.json', async () => {
    await store.savePlugin('v1', 'alpha', { manifest: manifestOf('alpha'), bundle: '// vault version' })
    await writeLegacyPlugin('alpha', { data: '{"from":"legacy"}' })

    await run()

    expect(await store.loadBundle('v1', 'alpha')).toBe('// vault version')
    expect(await store.loadSettings('v1', 'alpha')).toBe('{"from":"legacy"}')
  })

  it('does not overwrite settings that are already in the vault', async () => {
    await store.savePlugin('v1', 'alpha', { manifest: manifestOf('alpha'), bundle: 'x' })
    await store.saveSettings('v1', 'alpha', '{"from":"vault"}')
    await writeLegacyPlugin('alpha', { data: '{"from":"legacy"}' })

    await run()

    expect(await store.loadSettings('v1', 'alpha')).toBe('{"from":"vault"}')
  })

  it('merges the active plugins with the ones already enabled in the vault', async () => {
    await store.updateEnabledIds('v1', () => ['already'])
    await writeLegacyPlugin('alpha')
    await writeLegacyRegistry(['alpha'])

    await run()

    expect(await store.loadEnabledIds('v1')).toEqual(['already', 'alpha'])
  })

  it('does not list an active plugin whose files are missing', async () => {
    await writeLegacyRegistry(['ghost'])

    await run()

    expect(await store.loadEnabledIds('v1')).toEqual([])
    expect(await markerExists()).toBe(true)
  })

  it('ignores folders that are not plugins (only secrets, invalid names)', async () => {
    await fs.mkdir(path.join(legacyDir(), 'only-secrets'), { recursive: true })
    await fs.writeFile(path.join(legacyDir(), 'only-secrets', 'secrets.json'), '{}')
    await writeLegacyPlugin('Bad_Name')

    await run()

    expect(await store.listPlugins('v1')).toEqual([])
  })

  it('runs only once', async () => {
    await writeLegacyPlugin('alpha')
    await run()
    await store.deletePlugin('v1', 'alpha')

    await run()

    expect(await store.loadManifest('v1', 'alpha')).toBeNull()
  })

  it('does nothing for a vault without legacy data', async () => {
    await run()

    expect(await store.listPlugins('v1')).toEqual([])
    await expect(fs.access(path.join(vaultPath, '.obsidian'))).rejects.toThrow()
  })

  it('postpones an unreachable vault: no phantom directory, no marker, migrated once it is back', async () => {
    await fs.rm(vaultPath, { recursive: true, force: true })
    await writeLegacyPlugin('alpha')
    await writeLegacyRegistry(['alpha'])

    await run()

    await expect(fs.access(vaultPath)).rejects.toThrow()
    expect(await markerExists()).toBe(false)

    await fs.mkdir(vaultPath, { recursive: true })
    await run()

    expect(await store.loadBundle('v1', 'alpha')).toBe('// alpha')
    expect(await store.loadEnabledIds('v1')).toEqual(['alpha'])
  })

  it('postpones when community-plugins.json is invalid: file untouched, no marker, retried next start', async () => {
    await fs.mkdir(path.join(vaultPath, '.obsidian'), { recursive: true })
    await fs.writeFile(path.join(vaultPath, '.obsidian', 'community-plugins.json'), '{ broken')
    await writeLegacyPlugin('alpha')
    await writeLegacyRegistry(['alpha'])

    await run()

    expect(await fs.readFile(path.join(vaultPath, '.obsidian', 'community-plugins.json'), 'utf-8')).toBe('{ broken')
    expect(await markerExists()).toBe(false)

    await fs.writeFile(path.join(vaultPath, '.obsidian', 'community-plugins.json'), '[]')
    await run()

    expect(await store.loadEnabledIds('v1')).toEqual(['alpha'])
    expect(await markerExists()).toBe(true)
  })
})
