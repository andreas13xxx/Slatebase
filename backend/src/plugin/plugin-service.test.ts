import { describe, it, expect, vi } from 'vitest'
import { PluginService } from './plugin-service.js'
import type { IInstalledPluginStore } from './types.js'
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
