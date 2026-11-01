import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IApiClient } from '../../../api'
import { initialize, loadVaultHotkeys, getShortcut, _reset } from '../../../state/keybindingsStore'
import { createHotkeyManager } from './app-shim'
import type { ICommandRegistry } from '../command-registry'

vi.mock('../../../components/ToastNotification', () => ({ showToast: vi.fn() }))

const registry = {
  getCommands: () => [{ id: 'my-plugin:run', name: 'Run', pluginId: 'my-plugin', callback: () => {}, hotkeys: [{ modifiers: ['Alt'], key: 'r' }] }],
  registerHotkey: () => true,
} as unknown as ICommandRegistry

describe('app.hotkeyManager mirrors hotkeys.json', () => {
  beforeEach(async () => {
    _reset()
    const file: Record<string, unknown> = { 'app:go-back': [], 'my-plugin:other': [{ modifiers: ['Mod'], key: 'J' }] }
    await initialize({
      getHotkeysConfig: async () => ({ ...file }),
      patchHotkeysConfig: async () => ({ ...file }),
      getKeybindings: async () => ({ entries: [] }),
    } as unknown as IApiClient)
    await loadVaultHotkeys('v1')
  })

  it('shows the file as customKeys, under the IDs Obsidian uses', () => {
    const { customKeys } = createHotkeyManager(registry)
    expect(customKeys['app:go-back']).toEqual([])
    expect(customKeys['my-plugin:other']).toEqual([{ modifiers: ['Mod'], key: 'J' }])
  })

  it('getHotkeys prefers the file over the default the plugin declared', () => {
    const manager = createHotkeyManager(registry)
    expect(manager.getHotkeys('my-plugin:run')).toEqual([{ modifiers: ['Alt'], key: 'r' }])
    expect(manager.getHotkeys('my-plugin:other')).toEqual([{ modifiers: ['Mod'], key: 'J' }])
    expect(manager.getDefaultHotkeys('my-plugin:other')).toBeUndefined()
  })

  it('setHotkeys binds, an empty list unbinds, removeHotkeys goes back to the default', () => {
    const manager = createHotkeyManager(registry)
    manager.setHotkeys('app:open-settings', [{ modifiers: ['Mod', 'Shift'], key: 'S' }])
    expect(getShortcut('slatebase:open-settings')).toBe('Mod+Shift+S')
    manager.setHotkeys('app:open-settings', [])
    expect(getShortcut('slatebase:open-settings')).toBe('')
    manager.removeHotkeys('app:open-settings')
    expect(getShortcut('slatebase:open-settings')).toBe('Ctrl+,')
  })
})
