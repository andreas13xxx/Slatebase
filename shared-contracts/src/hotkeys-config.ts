// `<vault>/.obsidian/hotkeys.json` — the key bindings of a vault, same for everyone who opens it:
//
//   { "editor:toggle-bold": [ { "modifiers": ["Mod"], "key": "B" } ],
//     "app:open-settings": [],
//     "slatebase:open-trash": [ { "modifiers": ["Mod", "Shift"], "key": "T" } ] }
//
// Command ID → list of bindings. A key present with an empty list means "unbound" (it overrides the
// command's default); a key that is absent means "default". Modifiers are `Mod` (Ctrl on
// Windows/Linux, Cmd on macOS), `Ctrl`, `Meta`, `Shift`, `Alt`; `key` is a `KeyboardEvent.key`
// value, letters in upper case. Seen in real files: `Mod`, `Shift`, `Alt`, `Ctrl`, letters, `Tab`,
// arrows. `Meta` and the exact spelling of special keys are assumed.
//
// Inside Slatebase a binding is the string `Mod+Shift+F` (see the keybindings store); this module
// converts both ways and maps Slatebase's command IDs to Obsidian's.

export const HOTKEY_MODIFIERS = ['Mod', 'Ctrl', 'Meta', 'Shift', 'Alt'] as const
export type HotkeyModifier = (typeof HOTKEY_MODIFIERS)[number]

export interface Hotkey {
  modifiers: HotkeyModifier[]
  key: string
}

/** Pattern of a command ID in the file; no `__proto__` style names, no whitespace. */
export const HOTKEY_COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/

/** Guards, not product limits (Obsidian has none). */
export const MAX_HOTKEY_COMMANDS = 5000
export const MAX_HOTKEYS_PER_COMMAND = 20
export const MAX_HOTKEY_KEY_LENGTH = 30

const RESERVED_IDS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/** Whether `id` may be used as a key of the file (also keeps `__proto__` and friends out). */
export function isValidHotkeyCommandId(id: string): boolean {
  return HOTKEY_COMMAND_ID_PATTERN.test(id) && !RESERVED_IDS.has(id)
}

export function isHotkey(value: unknown): value is Hotkey {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { modifiers, key } = value as Record<string, unknown>
  return (
    Array.isArray(modifiers) &&
    modifiers.every((m) => typeof m === 'string' && (HOTKEY_MODIFIERS as readonly string[]).includes(m)) &&
    typeof key === 'string' &&
    key.length > 0 &&
    key.length <= MAX_HOTKEY_KEY_LENGTH
  )
}

// ─── Slatebase shortcut string ↔ Obsidian hotkey ─────────────────────────────

const MODIFIER_ORDER: readonly HotkeyModifier[] = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift']

/** `Mod+Shift+F` → `{ modifiers: ['Mod', 'Shift'], key: 'F' }`; null if there is no key. */
export function shortcutToHotkey(shortcut: string): Hotkey | null {
  if (!shortcut) return null
  const modifiers: HotkeyModifier[] = []
  let key = ''
  // A trailing `+` is the key itself ("Ctrl++").
  const plusKey = shortcut.endsWith('+')
  const parts = (plusKey ? shortcut.slice(0, -1) : shortcut).split('+').map((p) => p.trim()).filter((p) => p !== '')
  if (plusKey) key = '+'
  for (const part of parts) {
    const modifier = MODIFIER_ORDER.find((m) => m.toLowerCase() === part.toLowerCase()) ?? (part.toLowerCase() === 'cmd' ? 'Meta' : undefined)
    if (modifier) {
      if (!modifiers.includes(modifier)) modifiers.push(modifier)
    } else if (!plusKey) {
      key = part
    }
  }
  if (!key) return null
  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
  // The file spells the space bar as the key value itself (" "); inside Slatebase it is `Space`.
  if (key.toLowerCase() === 'space') key = ' '
  return { modifiers, key: key.length === 1 ? key.toUpperCase() : key }
}

/** `{ modifiers: ['Mod', 'Shift'], key: 'F' }` → `Mod+Shift+F`; a space bar key is written `Space`. */
export function hotkeyToShortcut(hotkey: Hotkey): string {
  const modifiers = [...hotkey.modifiers].sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
  return [...modifiers, hotkey.key === ' ' ? 'Space' : hotkey.key].join('+')
}

// ─── Command IDs: Slatebase ↔ Obsidian ───────────────────────────────────────

/**
 * Slatebase command ID → the ID Obsidian uses for the same command. Only commands that exist in
 * Obsidian's core are listed; everything else keeps its `slatebase:` ID. The IDs are Obsidian's own
 * where seen in real vaults and docs; the rest are the names its command palette shows.
 */
export const OBSIDIAN_COMMAND_ALIASES: Readonly<Record<string, string>> = {
  'slatebase:open-command-palette': 'command-palette:open',
  'slatebase:open-settings': 'app:open-settings',
  'slatebase:open-quick-switcher': 'switcher:open',
  'slatebase:open-search': 'global-search:open',
  'slatebase:navigate-back': 'app:go-back',
  'slatebase:navigate-forward': 'app:go-forward',
  'slatebase:toggle-sidebar': 'app:toggle-left-sidebar',
  'slatebase:toggle-right-panel': 'app:toggle-right-sidebar',
  'slatebase:next-tab': 'workspace:next-tab',
  'slatebase:previous-tab': 'workspace:previous-tab',
  'slatebase:toggle-mode': 'markdown:toggle-preview',
  'slatebase:editor-save': 'editor:save-file',
  'slatebase:daily-note': 'daily-notes',
  'slatebase:create-file': 'file-explorer:new-file',
  'slatebase:insert-template': 'insert-template',
  'slatebase:open-random-note': 'random-note',
  'slatebase:create-unique-note': 'zk-prefixer',
  'slatebase:open-graph': 'graph:open',
}

const ALIAS_TO_SLATEBASE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(OBSIDIAN_COMMAND_ALIASES).map(([slatebase, obsidian]) => [obsidian, slatebase]),
)

/** The ID under which a command is written to the file. */
export function toFileCommandId(commandId: string): string {
  return OBSIDIAN_COMMAND_ALIASES[commandId] ?? commandId
}

/** The Slatebase ID of a command named in the file (an unknown ID is returned as it is). */
export function fromFileCommandId(fileId: string): string {
  return ALIAS_TO_SLATEBASE[fileId] ?? fileId
}

// ─── The file ─────────────────────────────────────────────────────────────────

/** What is wrong with the file, for the console (Requirement 8). Nothing is rewritten for it. */
export function describeHotkeysDeviations(fields: Record<string, unknown>): Array<{ key: string; reason: string }> {
  const deviations: Array<{ key: string; reason: string }> = []
  for (const [id, value] of Object.entries(fields)) {
    if (!isValidHotkeyCommandId(id)) {
      deviations.push({ key: id.slice(0, 80), reason: 'not a usable command ID' })
    } else if (!Array.isArray(value)) {
      deviations.push({ key: id, reason: 'expected a list of key bindings' })
    } else {
      value.forEach((entry, index) => {
        if (!isHotkey(entry)) deviations.push({ key: `${id}.${index}`, reason: 'expected { modifiers: [...], key: "..." }' })
      })
    }
  }
  return deviations
}

/**
 * The bindings the file sets, as Slatebase command ID → shortcut strings. A command with an empty
 * list maps to `[]` (unbound). Entries that are not bindings are left out. Reading changes nothing in
 * the file, but when Slatebase changes the bindings of a command it writes that command's list from
 * the usable entries only: an entry it could not read (see {@link describeHotkeysDeviations}) is lost then.
 */
export function readHotkeys(fields: Record<string, unknown>): Map<string, string[]> {
  const result = new Map<string, string[]>()
  let count = 0
  for (const [id, value] of Object.entries(fields)) {
    if (!isValidHotkeyCommandId(id) || !Array.isArray(value)) continue
    if (++count > MAX_HOTKEY_COMMANDS) break
    const hotkeys = value.filter(isHotkey).slice(0, MAX_HOTKEYS_PER_COMMAND)
    // Nothing usable in a non-empty list (all entries unknown to us): not "unbound", the default stays.
    if (value.length > 0 && hotkeys.length === 0) continue
    result.set(fromFileCommandId(id), hotkeys.map(hotkeyToShortcut))
  }
  return result
}

/** The file entry for a command's shortcuts (`[]` = unbound). */
export function shortcutsToFileValue(shortcuts: string[]): Hotkey[] {
  return shortcuts.map(shortcutToHotkey).filter((h): h is Hotkey => h !== null)
}
