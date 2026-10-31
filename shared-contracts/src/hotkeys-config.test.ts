import { describe, expect, it } from 'vitest'
import {
  OBSIDIAN_COMMAND_ALIASES,
  describeHotkeysDeviations,
  fromFileCommandId,
  hotkeyToShortcut,
  isValidHotkeyCommandId,
  readHotkeys,
  shortcutToHotkey,
  shortcutsToFileValue,
  toFileCommandId,
} from './hotkeys-config.js'

describe('shortcutToHotkey / hotkeyToShortcut', () => {
  it('converts a shortcut into Obsidian modifiers and an upper-case letter', () => {
    expect(shortcutToHotkey('Mod+Shift+f')).toEqual({ modifiers: ['Mod', 'Shift'], key: 'F' })
  })

  it('orders modifiers the same way whatever the input order', () => {
    expect(shortcutToHotkey('Shift+Alt+Mod+X')).toEqual(shortcutToHotkey('Mod+Alt+Shift+X'))
  })

  it('keeps special keys as they are', () => {
    expect(shortcutToHotkey('Alt+ArrowLeft')).toEqual({ modifiers: ['Alt'], key: 'ArrowLeft' })
    expect(shortcutToHotkey('Ctrl+,')).toEqual({ modifiers: ['Ctrl'], key: ',' })
    expect(shortcutToHotkey('Ctrl+Shift+]')).toEqual({ modifiers: ['Ctrl', 'Shift'], key: ']' })
  })

  it('understands a plus as the key', () => {
    expect(shortcutToHotkey('Mod++')).toEqual({ modifiers: ['Mod'], key: '+' })
    expect(hotkeyToShortcut({ modifiers: ['Mod'], key: '+' })).toBe('Mod++')
  })

  it('maps Cmd to Meta and rejects a shortcut without a key', () => {
    expect(shortcutToHotkey('Cmd+K')).toEqual({ modifiers: ['Meta'], key: 'K' })
    expect(shortcutToHotkey('Mod+Shift')).toBeNull()
    expect(shortcutToHotkey('')).toBeNull()
  })

  it('round-trips', () => {
    for (const s of ['Mod+P', 'Ctrl+,', 'Alt+ArrowRight', 'Mod+Shift+F', 'Ctrl+Shift+[']) {
      const hotkey = shortcutToHotkey(s)!
      expect(shortcutToHotkey(hotkeyToShortcut(hotkey))).toEqual(hotkey)
    }
  })
})

describe('command IDs', () => {
  it('maps Slatebase IDs to Obsidian IDs and back; others pass through', () => {
    expect(toFileCommandId('slatebase:open-settings')).toBe('app:open-settings')
    expect(fromFileCommandId('app:open-settings')).toBe('slatebase:open-settings')
    expect(toFileCommandId('slatebase:open-trash')).toBe('slatebase:open-trash')
    expect(fromFileCommandId('some-plugin:do-it')).toBe('some-plugin:do-it')
  })

  it('has no two Slatebase commands on one Obsidian ID', () => {
    const values = Object.values(OBSIDIAN_COMMAND_ALIASES)
    expect(new Set(values).size).toBe(values.length)
  })

  it('refuses names that could change the prototype or are not IDs', () => {
    for (const id of ['__proto__', 'constructor', 'prototype', '', ' x', 'a b', 'x'.repeat(201)]) {
      expect(isValidHotkeyCommandId(id)).toBe(false)
    }
    expect(isValidHotkeyCommandId('editor:toggle-bold')).toBe(true)
  })
})

describe('readHotkeys', () => {
  it('reads bindings under Slatebase IDs, an empty list as unbound', () => {
    const map = readHotkeys({
      'app:open-settings': [],
      'editor:toggle-bold': [{ modifiers: ['Mod'], key: 'B' }],
    })
    expect(map.get('slatebase:open-settings')).toEqual([])
    expect(map.get('editor:toggle-bold')).toEqual(['Mod+B'])
  })

  it('skips what is not a binding without throwing', () => {
    const map = readHotkeys({ a: 'x', b: [{ key: 'X' }, { modifiers: ['Hyper'], key: 'X' }, { modifiers: [], key: 'Q' }] })
    expect(map.has('a')).toBe(false)
    expect(map.get('b')).toEqual(['Q'])
  })
})

describe('describeHotkeysDeviations', () => {
  it('is quiet for a good file', () => {
    expect(describeHotkeysDeviations({ 'app:go-back': [{ modifiers: ['Alt'], key: 'ArrowLeft' }], x: [] })).toEqual([])
  })

  it('reports bad names, non-lists and bad bindings', () => {
    const keys = describeHotkeysDeviations({ 'bad id': [], a: 3, b: [{ modifiers: ['Hyper'], key: 'X' }] }).map((d) => d.key)
    expect(keys).toEqual(['bad id', 'a', 'b.0'])
  })
})

describe('shortcutsToFileValue', () => {
  it('drops shortcuts without a key', () => {
    expect(shortcutsToFileValue(['Mod+K', 'Mod'])).toEqual([{ modifiers: ['Mod'], key: 'K' }])
  })
})

describe('space bar and unreadable lists', () => {
  it('writes the space bar as " " and shows it as Space', () => {
    expect(shortcutToHotkey('Mod+Space')).toEqual({ modifiers: ['Mod'], key: ' ' })
    expect(hotkeyToShortcut({ modifiers: ['Mod'], key: ' ' })).toBe('Mod+Space')
    expect(readHotkeys({ x: [{ modifiers: ['Mod'], key: ' ' }] }).get('x')).toEqual(['Mod+Space'])
  })

  it('does not read a list without a usable entry as "unbound"', () => {
    const map = readHotkeys({ a: [{ modifiers: ['Hyper'], key: 'X' }], b: [] })
    expect(map.has('a')).toBe(false)
    expect(map.get('b')).toEqual([])
  })
})
