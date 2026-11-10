import { describe, it, expect } from 'vitest'
import { renderSettingDefinitions } from './declarative-settings-renderer'
import type { IDeclarativeSettingTab, SettingDefinitionItem } from './declarative-settings-renderer'

const tab = {
  getControlValue: () => undefined,
  setControlValue: () => {},
  update: () => {},
} as unknown as IDeclarativeSettingTab

describe('declarative settings: id (Obsidian 1.14)', () => {
  it('renders a given id as data-setting-id', () => {
    const el = document.createElement('div')
    const items = [
      { id: 'my-plugin.enabled', name: 'Enabled', control: { type: 'toggle', key: 'enabled' } },
    ] as unknown as SettingDefinitionItem[]
    renderSettingDefinitions(items, el, tab)
    expect(el.querySelector('[data-setting-id="my-plugin.enabled"]')).not.toBeNull()
  })

  it('leaves the attribute off when no id is given', () => {
    const el = document.createElement('div')
    const items = [
      { name: 'Plain', control: { type: 'toggle', key: 'plain' } },
    ] as unknown as SettingDefinitionItem[]
    renderSettingDefinitions(items, el, tab)
    expect(el.querySelector('[data-setting-id]')).toBeNull()
    expect(el.querySelector('.setting-item')).not.toBeNull()
  })
})
