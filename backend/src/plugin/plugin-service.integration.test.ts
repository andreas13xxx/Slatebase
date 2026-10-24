// PluginService on a real InstalledPluginStore and real files: how the server's registry and the
// vault's community-plugins.json (shared with Obsidian) work together.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { InstalledPluginStore } from './installed-plugin-store.js'
import { PluginService } from './plugin-service.js'
import type { IPluginInstaller } from './plugin-installer.js'
import type { PluginRegistryData, PluginStatus } from './types.js'

let root: string
let vaultPath: string
let store: InstalledPluginStore
let service: PluginService

const listFile = (): string => path.join(vaultPath, '.obsidian', 'community-plugins.json')

async function installPlugin(id: string): Promise<void> {
  await store.savePlugin('v1', id, { manifest: JSON.stringify({ id, name: id, version: '1.0.0' }), bundle: `// ${id}` })
}

/** What Obsidian does when the user toggles plugins: it rewrites the list. */
async function obsidianWritesList(ids: string[]): Promise<void> {
  await fs.mkdir(path.dirname(listFile()), { recursive: true })
  await fs.writeFile(listFile(), JSON.stringify(ids))
}

async function listOnDisk(): Promise<string[]> {
  return JSON.parse(await fs.readFile(listFile(), 'utf-8')) as string[]
}

function registry(statuses: Record<string, PluginStatus>): PluginRegistryData {
  const plugins: PluginRegistryData['plugins'] = {}
  for (const [id, status] of Object.entries(statuses)) {
    plugins[id] = {
      status,
      permissions: { network: false, networkAllowlist: [], filesystemWrite: false, domManipulation: false },
      compatibilityLevel: 'full',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
  }
  return { version: 1, plugins }
}

async function statusesSeenByClient(): Promise<Record<string, PluginStatus>> {
  const loaded = await service.loadRegistry('v1')
  return Object.fromEntries(Object.entries(loaded?.plugins ?? {}).map(([id, entry]) => [id, entry.status]))
}

beforeEach(async () => {
  root = path.join(os.tmpdir(), `plugin-service-it-${crypto.randomBytes(8).toString('hex')}`)
  vaultPath = path.join(root, 'vault')
  await fs.mkdir(vaultPath, { recursive: true })
  store = new InstalledPluginStore(path.join(root, 'data'), (id) => (id === 'v1' ? vaultPath : null))
  service = new PluginService(store, {} as IPluginInstaller)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('PluginService with a real store', () => {
  it('activating a plugin approves it and lists it where Obsidian looks', async () => {
    await installPlugin('alpha')

    await service.saveRegistry('v1', registry({ alpha: 'active' }))

    expect(await listOnDisk()).toEqual(['alpha'])
    expect(await statusesSeenByClient()).toEqual({ alpha: 'active' })
  })

  it('a plugin that arrives in the vault and is enabled in Obsidian does not start here by itself', async () => {
    await installPlugin('from-sync')
    await obsidianWritesList(['from-sync'])

    expect((await store.listPlugins('v1')).map((m) => m.id)).toEqual(['from-sync'])
    expect(await service.loadRegistry('v1')).toBeNull()

    // Even with a registry that knows the plugin, only an explicit activation here switches it on.
    await service.saveRegistry('v1', registry({ 'from-sync': 'inactive' }))
    expect(await statusesSeenByClient()).toEqual({ 'from-sync': 'inactive' })
  })

  it('disabling a plugin in Obsidian switches it off here, and activating it again works', async () => {
    await installPlugin('alpha')
    await service.saveRegistry('v1', registry({ alpha: 'active' }))

    await obsidianWritesList([])
    expect(await statusesSeenByClient()).toEqual({ alpha: 'inactive' })

    await service.saveRegistry('v1', registry({ alpha: 'active' }))
    expect(await listOnDisk()).toEqual(['alpha'])
    expect(await statusesSeenByClient()).toEqual({ alpha: 'active' })
  })

  it('saving the registry does not switch off a plugin that was enabled in Obsidian in the meantime', async () => {
    await installPlugin('alpha')
    await installPlugin('beta')
    await installPlugin('enabled-in-obsidian')
    // The client has seen all three; only alpha is active here.
    await service.saveRegistry('v1', registry({ alpha: 'active', beta: 'inactive', 'enabled-in-obsidian': 'inactive' }))

    // The Obsidian user switches a plugin on; the list is synced into the vault.
    await obsidianWritesList(['alpha', 'enabled-in-obsidian'])

    // A Slatebase user toggles beta; the client sends its (older) snapshot of everything.
    await service.saveRegistry('v1', registry({ alpha: 'active', beta: 'active', 'enabled-in-obsidian': 'inactive' }))

    expect((await listOnDisk()).sort()).toEqual(['alpha', 'beta', 'enabled-in-obsidian'])
    expect(await statusesSeenByClient()).toEqual({ alpha: 'active', beta: 'active', 'enabled-in-obsidian': 'inactive' })
  })

  it('switching a plugin off here removes it from the list, and leaves the others', async () => {
    await installPlugin('alpha')
    await installPlugin('beta')
    await service.saveRegistry('v1', registry({ alpha: 'active', beta: 'active' }))

    await service.saveRegistry('v1', registry({ alpha: 'inactive', beta: 'active' }))

    expect(await listOnDisk()).toEqual(['beta'])
  })

  it('keeps the other entries of a list written by Obsidian, including plugins this server does not have', async () => {
    await installPlugin('alpha')
    await obsidianWritesList(['not-installed-here', 'dataview'])

    await service.saveRegistry('v1', registry({ alpha: 'active' }))

    expect(await listOnDisk()).toEqual(['not-installed-here', 'dataview', 'alpha'])
  })

  it('deleting a plugin removes it from the list and the registry view', async () => {
    await installPlugin('alpha')
    await service.saveRegistry('v1', registry({ alpha: 'active' }))

    await service.deletePlugin('v1', 'alpha')

    expect(await listOnDisk()).toEqual([])
    expect(await service.listPlugins('v1')).toEqual([])
  })
})
