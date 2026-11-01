import { describe, it, expect, beforeEach } from 'vitest'
import { CommandRegistry } from './command-registry'
import { registerCoreEditorCommands } from './core-commands'
import { OBSIDIAN_DEFAULT_HOTKEYS, defaultHotkeysFor } from './core-default-hotkeys'
import { OBSIDIAN_COMMAND_ALIASES } from '@slatebase/shared-contracts'
import { DEFAULT_KEYBINDINGS } from '../../state/keybindingsStore'
import { findRegistryCommand, registryShortcuts } from '../../hooks/useRegistryHotkeys'
import { _reset } from '../../state/keybindingsStore'

function press(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { cancelable: true, ...init })
}

describe('Obsidian default hotkeys', () => {
  beforeEach(() => { _reset() })

  it('are declared on the core editor commands that have one', () => {
    const registry = new CommandRegistry()
    registerCoreEditorCommands(registry, 'en')

    expect(registryShortcuts(registry.getCommand('editor:toggle-bold')!)).toEqual(['Mod+B'])
    expect(registryShortcuts(registry.getCommand('editor:toggle-italics')!)).toEqual(['Mod+I'])
    expect(registryShortcuts(registry.getCommand('editor:insert-link')!)).toEqual(['Mod+K'])
    expect(registry.getCommand('editor:toggle-code')?.hotkeys).toBeUndefined()
  })

  it('run the command when their keys are pressed', () => {
    const registry = new CommandRegistry()
    registerCoreEditorCommands(registry, 'en')
    const commands = registry.getCommands()

    expect(findRegistryCommand(press({ key: 'b', ctrlKey: true }), commands)?.id).toBe('editor:toggle-bold')
    expect(findRegistryCommand(press({ key: 'i', ctrlKey: true }), commands)?.id).toBe('editor:toggle-italics')
    expect(findRegistryCommand(press({ key: 'Enter', altKey: true }), commands)).toBeNull() // follow-link is an app command, not registered here
  })

  it('give a copy, so a caller cannot change the table', () => {
    const first = defaultHotkeysFor('editor:toggle-bold')!
    first[0]!.key = 'X'
    expect(defaultHotkeysFor('editor:toggle-bold')?.[0]?.key).toBe('B')
    expect(defaultHotkeysFor('editor:unknown')).toBeUndefined()
  })

  it('do not repeat a key that Slatebase binds natively or give two commands the same key', () => {
    const natives = new Set(Object.values(OBSIDIAN_COMMAND_ALIASES))
    expect(Object.keys(OBSIDIAN_DEFAULT_HOTKEYS).filter((id) => natives.has(id))).toEqual([])

    const nativeKeys = new Set(DEFAULT_KEYBINDINGS.map((d) => d.defaultShortcut.toLowerCase()).filter(Boolean))
    const keys = Object.values(OBSIDIAN_DEFAULT_HOTKEYS).map((h) => [...h[0]!.modifiers.map((m) => m.toLowerCase()), h[0]!.key.toLowerCase()].sort().join('+'))
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.some((k) => nativeKeys.has(k))).toBe(false)
  })
})
