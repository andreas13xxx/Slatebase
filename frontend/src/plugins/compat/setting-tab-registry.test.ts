import { afterEach, describe, expect, it } from 'vitest'
import { PluginSettingTab } from './setting-tab'
import { SettingTabRegistry, pluginSettingTabs } from './setting-tab-registry'
import { AppShim } from './shims/app-shim'

function makeTab(id: string): PluginSettingTab {
  return new PluginSettingTab({} as never, { manifest: { id, name: id } } as never)
}

describe('SettingTabRegistry and app.setting.pluginTabs', () => {
  afterEach(() => {
    pluginSettingTabs.length = 0
  })

  it('registers tabs into the array every AppShim exposes as app.setting.pluginTabs', () => {
    const registry = new SettingTabRegistry()
    const tab = makeTab('smart-connections')
    registry.register('smart-connections', tab)

    const stub = {} as never
    const shim = new AppShim({ vault: stub, workspace: stub, metadataCache: stub, pluginId: 'other-plugin' })
    expect(shim.setting.pluginTabs.find(t => (t as PluginSettingTab).id === 'smart-connections')).toBe(tab)
  })

  it('replaces a plugin\'s earlier tab instead of accumulating duplicates', () => {
    const registry = new SettingTabRegistry()
    registry.register('a', makeTab('a'))
    const second = makeTab('a')
    registry.register('a', second)
    expect(pluginSettingTabs).toEqual([second])
  })

  it('drops a tab on remove() and all tabs on clear()', () => {
    const registry = new SettingTabRegistry()
    registry.register('a', makeTab('a'))
    registry.register('b', makeTab('b'))
    registry.remove('a')
    expect(pluginSettingTabs).toHaveLength(1)
    registry.clear()
    expect(pluginSettingTabs).toHaveLength(0)
  })
})
