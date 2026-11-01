import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

describe('app.hotkeyManager — writes and bad input', () => {
  let patches: Array<Record<string, unknown>>

  beforeEach(async () => {
    vi.useFakeTimers()
    _reset()
    patches = []
    await initialize({
      getHotkeysConfig: async () => ({}),
      patchHotkeysConfig: async (_v: string, patch: Record<string, unknown>) => { patches.push(patch); return {} },
      getKeybindings: async () => ({ entries: [] }),
    } as unknown as IApiClient)
    await loadVaultHotkeys('v1')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes under Obsidian\'s command ID in Obsidian\'s format', async () => {
    createHotkeyManager(registry).setHotkeys('app:open-settings', [{ modifiers: ['Mod', 'Shift'], key: 'S' }])
    await vi.advanceTimersByTimeAsync(600)
    expect(patches).toEqual([{ 'app:open-settings': [{ modifiers: ['Mod', 'Shift'], key: 'S' }] }])
  })

  it('customKeys is live: assigning and deleting an entry change the file', async () => {
    const { customKeys } = createHotkeyManager(registry)
    customKeys['my-plugin:new'] = [{ modifiers: ['Alt'], key: 'N' }]
    expect(customKeys['my-plugin:new']).toEqual([{ modifiers: ['Alt'], key: 'N' }])
    expect(Object.keys(customKeys)).toContain('my-plugin:new')
    delete customKeys['my-plugin:new']
    expect(customKeys['my-plugin:new']).toBeUndefined()
    await vi.advanceTimersByTimeAsync(600)
    expect(patches).toEqual([{ 'my-plugin:new': null }])
  })

  it('refuses bad input instead of queueing it, so other changes are not held back', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const manager = createHotkeyManager(registry)
    manager.setHotkeys('my plugin:cmd', [{ modifiers: ['Alt'], key: 'X' }])
    manager.setHotkeys('x'.repeat(201), [])
    manager.setHotkeys('my-plugin:many', Array.from({ length: 21 }, (_, i) => ({ modifiers: ['Alt'], key: String(i % 10) })))
    manager.setHotkeys('my-plugin:bad', [{ modifiers: ['Control'], key: 'X' }] as never)
    manager.setHotkeys('my-plugin:null', [null] as never)
    manager.setHotkeys('app:open-settings', [{ modifiers: ['Alt'], key: 'S' }])
    await vi.advanceTimersByTimeAsync(600)
    expect(patches).toEqual([{ 'app:open-settings': [{ modifiers: ['Alt'], key: 'S' }] }])
    warn.mockRestore()
  })
})
