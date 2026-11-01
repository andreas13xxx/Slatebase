/**
 * core-default-hotkeys — the keys Obsidian binds to its core commands out of the box.
 *
 * A command without an entry in the vault's `hotkeys.json` answers to these (the file wins; a command
 * the file unbinds has none). Only bindings that two sources agree on are listed (KeyCombiner's
 * Obsidian collection and the key names of Obsidian's own Hotkeys settings); `Mod` is Ctrl, or Cmd on
 * a Mac. Obsidian has more defaults than these; what is not listed starts unbound.
 *
 * Not listed on purpose:
 * - Commands Slatebase handles natively (`command-palette:open`, `switcher:open`, `app:open-settings`,
 *   `global-search:open`, `markdown:toggle-preview`, `editor:save-file`, ...): their keys are in
 *   `DEFAULT_KEYBINDINGS` (keybindingsStore.ts).
 * - `editor:delete-paragraph` (Ctrl+D in Obsidian): in the editor Ctrl+D selects the next occurrence.
 * - The help command (F1): its ID is not known well enough.
 *
 * @module core-default-hotkeys
 */

import type { Hotkey } from './types'

const mod = (key: string, ...more: string[]): Hotkey[] => [{ modifiers: ['Mod', ...more], key }]

/** Obsidian command ID → its default keys. */
export const OBSIDIAN_DEFAULT_HOTKEYS: Readonly<Record<string, Hotkey[]>> = {
  'editor:toggle-bold': mod('B'),
  'editor:toggle-italics': mod('I'),
  'editor:insert-link': mod('K'),
  'editor:open-search': mod('F'),
  'editor:open-search-replace': mod('H'),
  'editor:follow-link': [{ modifiers: ['Alt'], key: 'Enter' }],
  'editor:open-link-in-new-leaf': mod('Enter', 'Alt'),
  'workspace:close': mod('W'),
}

/** The default keys of a core command (Obsidian ID), or undefined. */
export function defaultHotkeysFor(commandId: string): Hotkey[] | undefined {
  const hotkeys = OBSIDIAN_DEFAULT_HOTKEYS[commandId]
  return hotkeys?.map((h) => ({ modifiers: [...h.modifiers], key: h.key }))
}
