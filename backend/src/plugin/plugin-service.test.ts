import { describe, it, expect, vi } from 'vitest'
import { PluginService } from './plugin-service.js'
import type { IInstalledPluginStore, PluginRegistryData, PluginStatus } from './types.js'
import { CommunityPluginsFileInvalidError } from './errors.js'
import type { IPluginInstaller } from './plugin-installer.js'
import type { IEventBus, PublishOptions } from '../realtime/types.js'

function makeStore(): IInstalledPluginStore {
  return {
    savePlugin: vi.fn(),
    loadManifest: vi.fn(),
    loadBundle: vi.fn(),
    loadStyles: vi.fn(),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    loadSettings: vi.fn(),
    listPlugins: vi.fn(),
    deletePlugin: vi.fn(),
    deleteAllForVault: vi.fn(),
    saveRegistry: vi.fn(),
    loadRegistry: vi.fn(),
  } as unknown as IInstalledPluginStore
}

function makeInstaller(): IPluginInstaller {
  return {} as IPluginInstaller
}

function makeEventBus(): IEventBus & { publish: ReturnType<typeof vi.fn> } {
  return {
    publish: vi.fn(),
    nextEventId: vi.fn(),
    getEventsSince: vi.fn(),
    subscribe: vi.fn(),
  } as unknown as IEventBus & { publish: ReturnType<typeof vi.fn> }
}

describe('PluginService.saveSettings', () => {
  it('persists settings via the store', async () => {
    const store = makeStore()
    const service = new PluginService(store, makeInstaller())

    await service.saveSettings('vault-1', 'plugin-a', '{"x":1}')

    expect(store.saveSettings).toHaveBeenCalledWith('vault-1', 'plugin-a', '{"x":1}')
  })

  it('works without an eventBus (optional dependency)', async () => {
    const store = makeStore()
    const service = new PluginService(store, makeInstaller())

    await expect(service.saveSettings('vault-1', 'plugin-a', '{}')).resolves.toBeUndefined()
  })

  it('publishes a plugin-settings:change broadcast event when an eventBus is provided', async () => {
    const store = makeStore()
    const eventBus = makeEventBus()
    const service = new PluginService(store, makeInstaller(), eventBus)

    await service.saveSettings('vault-1', 'plugin-a', '{"x":1}')

    expect(eventBus.publish).toHaveBeenCalledWith({
      type: 'plugin-settings:change',
      payload: { vaultId: 'vault-1', pluginId: 'plugin-a' },
      target: { kind: 'broadcast' },
    } satisfies PublishOptions)
  })

  it('publishes after the store write succeeds, not before', async () => {
    const store = makeStore()
    const eventBus = makeEventBus()
    const order: string[] = []
    ;(store.saveSettings as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('store')
    })
    eventBus.publish.mockImplementation(() => { order.push('publish') })
    const service = new PluginService(store, makeInstaller(), eventBus)

    await service.saveSettings('vault-1', 'plugin-a', '{}')

    expect(order).toEqual(['store', 'publish'])
  })
})

// ─── Registry ↔ community-plugins.json ───────────────────────────────────────


function entry(status: PluginStatus): PluginRegistryData['plugins'][string] {
  return {
    status,
    permissions: { network: false, networkAllowlist: [], filesystemWrite: false, domManipulation: false },
    compatibilityLevel: 'full',
    installedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }
}

/** A store whose community-plugins.json is an in-memory list. */
function makeRegistryStore(initialEnabled: string[], registry: PluginRegistryData | null = null, installed: string[] = ['turn-on', 'loading', 'keep', 'turn-off', 'a', 'broken', 'other']) {
  const state = { enabled: [...initialEnabled], registry, invalid: false }
  const store = {
    ...makeStore(),
    loadEnabledIds: vi.fn(async () => (state.invalid ? [] : state.enabled)),
    updateEnabledIds: vi.fn(async (_v: string, fn: (ids: string[]) => string[]) => {
      if (state.invalid) throw new CommunityPluginsFileInvalidError()
      state.enabled = fn(state.enabled)
    }),
    listPlugins: vi.fn(async () => installed.map((id) => ({ id, name: id, version: '1.0.0' }))),
    loadRegistry: vi.fn(async () => state.registry),
    saveRegistry: vi.fn(async (_v: string, r: PluginRegistryData) => { state.registry = r }),
  } as unknown as IInstalledPluginStore
  return { store, state }
}

describe('PluginService.saveRegistry', () => {
  it('adds plugins that were switched on and removes plugins that were switched off', async () => {
    const { store, state } = makeRegistryStore(['keep', 'turn-off'], {
      version: 1,
      plugins: { keep: entry('active'), 'turn-off': entry('active'), 'turn-on': entry('inactive'), loading: entry('inactive') },
    })
    const service = new PluginService(store, makeInstaller())

    await service.saveRegistry('vault-1', {
      version: 1,
      plugins: { 'turn-on': entry('active'), loading: entry('loading'), 'turn-off': entry('inactive') },
    })

    expect(state.enabled.sort()).toEqual(['keep', 'loading', 'turn-on'])
  })

  it('leaves alone a plugin that is inactive in the snapshot but was enabled in Obsidian meanwhile', async () => {
    // The client knows `enabled-in-obsidian` as inactive and sends it back unchanged whenever it
    // saves something else; removing it would switch it off in Obsidian too.
    const { store, state } = makeRegistryStore(['enabled-in-obsidian', 'turn-off'], {
      version: 1,
      plugins: { 'enabled-in-obsidian': entry('inactive'), 'turn-off': entry('active'), other: entry('inactive') },
    }, ['enabled-in-obsidian', 'turn-off', 'other'])
    const service = new PluginService(store, makeInstaller())

    await service.saveRegistry('vault-1', {
      version: 1,
      plugins: { 'enabled-in-obsidian': entry('inactive'), 'turn-off': entry('inactive'), other: entry('inactive') },
    })

    expect(state.enabled).toEqual(['enabled-in-obsidian'])
  })

  it('switches a plugin on again that Obsidian had switched off, although the registry still says active', async () => {
    const { store, state } = makeRegistryStore([], { version: 1, plugins: { a: entry('active') } })
    const service = new PluginService(store, makeInstaller())

    await service.saveRegistry('vault-1', { version: 1, plugins: { a: entry('active') } })

    expect(state.enabled).toEqual(['a'])
  })

  it('leaves a plugin in error state where it is, so a load failure here does not switch it off in Obsidian', async () => {
    const { store, state } = makeRegistryStore(['broken'])
    const service = new PluginService(store, makeInstaller())

    await service.saveRegistry('vault-1', { version: 1, plugins: { broken: entry('error'), other: entry('error') } })

    expect(state.enabled).toEqual(['broken'])
  })

  it('does not list ids of plugins that are not in the vault', async () => {
    const { store, state } = makeRegistryStore([], null, ['real'])
    const service = new PluginService(store, makeInstaller())

    await service.saveRegistry('vault-1', { version: 1, plugins: { real: entry('active'), ghost: entry('active'), '../x': entry('active') } })

    expect(state.enabled).toEqual(['real'])
  })

  it('saves nothing when community-plugins.json is invalid', async () => {
    const { store, state } = makeRegistryStore([])
    state.invalid = true
    const service = new PluginService(store, makeInstaller())

    await expect(service.saveRegistry('vault-1', { version: 1, plugins: { a: entry('active') } }))
      .rejects.toBeInstanceOf(CommunityPluginsFileInvalidError)
    expect(store.saveRegistry).not.toHaveBeenCalled()
  })
})

describe('PluginService.loadRegistry', () => {
  it('returns null when there is no registry', async () => {
    const { store } = makeRegistryStore([])
    expect(await new PluginService(store, makeInstaller()).loadRegistry('vault-1')).toBeNull()
  })

  it('keeps a plugin active only while it is also enabled in community-plugins.json', async () => {
    const { store } = makeRegistryStore(['on'], {
      version: 1,
      plugins: { on: entry('active'), 'disabled-in-obsidian': entry('active'), loading: entry('loading'), off: entry('inactive'), broken: entry('error') },
    })

    const registry = await new PluginService(store, makeInstaller()).loadRegistry('vault-1')

    const status = Object.fromEntries(Object.entries(registry?.plugins ?? {}).map(([id, e]) => [id, e.status]))
    expect(status).toEqual({ on: 'active', 'disabled-in-obsidian': 'inactive', loading: 'inactive', off: 'inactive', broken: 'error' })
  })

  it('never activates a plugin that is only enabled in Obsidian', async () => {
    const { store } = makeRegistryStore(['only-in-obsidian', 'approved'], {
      version: 1,
      plugins: { approved: entry('inactive') },
    })

    const registry = await new PluginService(store, makeInstaller()).loadRegistry('vault-1')

    expect(registry?.plugins['approved']?.status).toBe('inactive')
    expect(registry?.plugins['only-in-obsidian']).toBeUndefined()
  })

  it('does not change the stored registry', async () => {
    const { store, state } = makeRegistryStore([], { version: 1, plugins: { a: entry('active') } })

    await new PluginService(store, makeInstaller()).loadRegistry('vault-1')

    expect(state.registry?.plugins['a']?.status).toBe('active')
  })
})
