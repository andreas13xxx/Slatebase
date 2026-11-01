import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Command, ICommandRegistry } from '../plugins/compat/command-registry'
import type { IApiClient } from '../api'
import { initialize, loadVaultHotkeys, _reset } from '../state/keybindingsStore'
import { findRegistryCommand, registryShortcuts, useRegistryHotkeys } from './useRegistryHotkeys'

const command = (id: string, hotkeys?: Command['hotkeys']): Command => ({ id, name: id, pluginId: id.split(':')[0] ?? '', callback: () => {}, hotkeys })

function key(init: KeyboardEventInit, target?: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init })
  if (target) Object.defineProperty(event, 'target', { value: target })
  return event
}

async function withFile(file: Record<string, unknown>): Promise<void> {
  _reset()
  await initialize({ getHotkeysConfig: async () => file, getKeybindings: async () => ({ entries: [] }), patchHotkeysConfig: async () => file } as unknown as IApiClient)
  await loadVaultHotkeys('v1')
}

describe('findRegistryCommand', () => {
  beforeEach(async () => {
    await withFile({ 'editor:toggle-code': [{ modifiers: ['Mod', 'Shift'], key: 'K' }], 'graph:open-local': [] })
  })

  it('finds the command the vault file binds to the pressed keys', () => {
    const commands = [command('editor:toggle-code'), command('editor:toggle-bold')]
    expect(findRegistryCommand(key({ key: 'K', ctrlKey: true, shiftKey: true }), commands)?.id).toBe('editor:toggle-code')
    expect(findRegistryCommand(key({ key: 'K', ctrlKey: true }), commands)).toBeNull()
  })

  it('uses the hotkeys a plugin declares unless the file names the command', () => {
    const plugin = command('my-plugin:run', [{ modifiers: ['Alt'], key: 'r' }])
    expect(findRegistryCommand(key({ key: 'r', altKey: true }), [plugin])?.id).toBe('my-plugin:run')
    expect(registryShortcuts(plugin)).toEqual(['Alt+R'])
  })

  it('a command the file unbinds does not run on its declared hotkey', () => {
    const local = command('graph:open-local', [{ modifiers: ['Alt'], key: 'g' }])
    expect(findRegistryCommand(key({ key: 'g', altKey: true }), [local])).toBeNull()
  })

  it('never takes a bare letter, but takes a function key', async () => {
    await withFile({ 'my-plugin:a': [{ modifiers: [], key: 'Q' }], 'my-plugin:b': [{ modifiers: [], key: 'F9' }] })
    const commands = [command('my-plugin:a'), command('my-plugin:b')]
    expect(findRegistryCommand(key({ key: 'q' }), commands)).toBeNull()
    expect(findRegistryCommand(key({ key: 'F9' }), commands)?.id).toBe('my-plugin:b')
  })

  it('leaves keys alone that something else already took, text fields, and commands handled natively', async () => {
    const commands = [command('editor:toggle-code')]
    const taken = key({ key: 'K', ctrlKey: true, shiftKey: true })
    taken.preventDefault()
    expect(findRegistryCommand(taken, commands)).toBeNull()
    expect(findRegistryCommand(key({ key: 'K', ctrlKey: true, shiftKey: true }, document.createElement('input')), commands)).toBeNull()

    await withFile({ 'command-palette:open': [{ modifiers: ['Mod'], key: 'J' }] })
    expect(findRegistryCommand(key({ key: 'J', ctrlKey: true }), [command('command-palette:open')])).toBeNull()
  })
})

describe('findRegistryCommand — more rules', () => {
  it('ignores key repeat, and keys Slatebase\'s own commands take', async () => {
    await withFile({ 'my-plugin:a': [{ modifiers: ['Mod'], key: 'N' }], 'my-plugin:b': [{ modifiers: ['Mod'], key: 'P' }] })
    const commands = [command('my-plugin:a'), command('my-plugin:b')]
    expect(findRegistryCommand(key({ key: 'n', ctrlKey: true }), commands)?.id).toBe('my-plugin:a')
    expect(findRegistryCommand(key({ key: 'n', ctrlKey: true, repeat: true }), commands)).toBeNull()
    // The file gives Mod+P to the plugin command, so the palette's default gives way (file wins)
    expect(findRegistryCommand(key({ key: 'p', ctrlKey: true }), commands)?.id).toBe('my-plugin:b')
    // Without that binding the palette keeps Mod+P and the registry leaves the key alone
    await withFile({ 'my-plugin:b': [{ modifiers: ['Alt'], key: 'P' }] })
    expect(findRegistryCommand(key({ key: 'p', ctrlKey: true }), commands)).toBeNull()
  })

  it('matches a digit that Shift turns into another character by the physical key', async () => {
    await withFile({ 'my-plugin:a': [{ modifiers: ['Mod', 'Shift'], key: '1' }] })
    expect(findRegistryCommand(key({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }), [command('my-plugin:a')])?.id).toBe('my-plugin:a')
  })
})

describe('useRegistryHotkeys', () => {
  function registryWith(cmd: Command, canExecute: boolean) {
    const executed: string[] = []
    const registry = {
      getCommands: () => [cmd],
      canExecute: () => canExecute,
      executeCommand: (id: string) => { executed.push(id) },
    } as unknown as ICommandRegistry
    return { registry, executed }
  }

  beforeEach(async () => {
    await withFile({ 'my-plugin:a': [{ modifiers: ['Mod'], key: 'J' }] })
  })

  it('runs the command and takes the key', () => {
    const { registry, executed } = registryWith(command('my-plugin:a'), true)
    const { unmount } = renderHook(() => useRegistryHotkeys(registry, true))
    const event = key({ key: 'j', ctrlKey: true })
    window.dispatchEvent(event)
    expect(executed).toEqual(['my-plugin:a'])
    expect(event.defaultPrevented).toBe(true)
    unmount()
    window.dispatchEvent(key({ key: 'j', ctrlKey: true }))
    expect(executed).toHaveLength(1)
  })

  it('leaves the key to the browser when the command cannot run now', () => {
    const { registry, executed } = registryWith(command('my-plugin:a'), false)
    renderHook(() => useRegistryHotkeys(registry, true))
    const event = key({ key: 'j', ctrlKey: true })
    window.dispatchEvent(event)
    expect(executed).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })

  it('does nothing while the plugin feature is off', () => {
    const { registry, executed } = registryWith(command('my-plugin:a'), true)
    renderHook(() => useRegistryHotkeys(registry, false))
    window.dispatchEvent(key({ key: 'j', ctrlKey: true }))
    expect(executed).toEqual([])
  })
})
