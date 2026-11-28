import { describe, it, expect } from 'vitest'
import { PluginSettingTab } from './setting-tab'

describe('PluginSettingTab name/id', () => {
  it('is set from the plugin manifest before a subclass constructor body runs', () => {
    const plugin = { manifest: { id: 'smart-connections', name: 'Smart Connections' } }
    class Tab extends PluginSettingTab {
      readonly seen: string
      constructor() {
        super({} as never, plugin as never)
        this.seen = this.name.replace('Smart ', '')
      }
    }
    const tab = new Tab()
    expect(tab.seen).toBe('Connections')
    expect(tab.id).toBe('smart-connections')
  })

  it('falls back to empty strings without a manifest', () => {
    const tab = new PluginSettingTab({} as never, {} as never)
    expect(tab.name).toBe('')
  })
})
