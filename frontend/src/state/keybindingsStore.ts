/**
 * Keybindings Store — the keyboard shortcuts of the open vault.
 *
 * The bindings live in the vault's `.obsidian/hotkeys.json` (Obsidian's format: command ID → list of
 * `{ modifiers, key }`), so they are the same for everyone who opens the vault and for Obsidian.
 * A command the file does not name has its default; an empty list means "unbound". Changes are
 * written to the file debounced; the per-user list of older versions is taken over once per vault.
 *
 * Shortcut format inside Slatebase: "Ctrl+Shift+F", "Ctrl+P", "Ctrl+,", "Ctrl+S"
 * Modifiers: Ctrl, Shift, Alt, Meta (= Cmd on macOS)
 * Use "Mod" as platform-agnostic: Ctrl on Win/Linux, Meta on macOS.
 */

import type { IApiClient } from '../api'
import {
  MAX_HOTKEYS_PER_COMMAND,
  isValidHotkeyCommandId,
  readHotkeys,
  shortcutToHotkey,
  shortcutsToFileValue,
  toFileCommandId,
  type Hotkey,
} from '@slatebase/shared-contracts'
import { reportSyncFailure, reportSyncSuccess } from './preferenceSync'

// ─── Types ───────────────────────────────────────────────────────────────────

/** A keybinding definition with metadata. */
export interface KeybindingDefinition {
  /** Command ID, e.g. "slatebase:open-command-palette" */
  commandId: string
  /** German label for the UI. */
  label: string
  /** Default shortcut string. Empty = no default binding. */
  defaultShortcut: string
  /** Category for grouping in settings UI. */
  category: KeybindingCategory
}

/** Keybinding categories for UI grouping. */
export type KeybindingCategory = 'navigation' | 'editor' | 'vault' | 'panel'

/** A single user override. */
export interface KeybindingOverride {
  commandId: string
  shortcut: string
}

/** Parsed shortcut for matching against keyboard events. */
export interface ParsedShortcut {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  key: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Where earlier versions cached the per-user overrides; read once to take them over. */
const LEGACY_STORAGE_KEY = 'slatebase:keybindings'

/** Identifies this store to the shared first-sync/failure bookkeeping. */
const SYNC_STORE_KEY = 'keybindings'

// ─── Default Keybindings ─────────────────────────────────────────────────────

/**
 * All configurable keybinding definitions with defaults.
 * "Mod" means Ctrl on Windows/Linux, Meta (Cmd) on macOS.
 */
export const DEFAULT_KEYBINDINGS: KeybindingDefinition[] = [
  // Navigation
  { commandId: 'slatebase:open-command-palette', label: 'Befehlspalette öffnen', defaultShortcut: 'Mod+P', category: 'navigation' },
  { commandId: 'slatebase:open-settings', label: 'Einstellungen öffnen', defaultShortcut: 'Ctrl+,', category: 'navigation' },
  { commandId: 'slatebase:toggle-sidebar', label: 'Seitenleiste ein-/ausblenden', defaultShortcut: '', category: 'navigation' },
  { commandId: 'slatebase:toggle-right-panel', label: 'Kontextpanel ein-/ausblenden', defaultShortcut: '', category: 'navigation' },
  { commandId: 'slatebase:toggle-toolbar', label: 'Werkzeugleiste ein-/ausblenden', defaultShortcut: '', category: 'navigation' },
  { commandId: 'slatebase:toggle-theme', label: 'Farbschema umschalten', defaultShortcut: '', category: 'navigation' },
  { commandId: 'slatebase:navigate-back', label: 'Zurück navigieren', defaultShortcut: 'Alt+ArrowLeft', category: 'navigation' },
  { commandId: 'slatebase:navigate-forward', label: 'Vor navigieren', defaultShortcut: 'Alt+ArrowRight', category: 'navigation' },
  { commandId: 'slatebase:open-quick-switcher', label: 'Schnellwechsler öffnen', defaultShortcut: 'Mod+O', category: 'navigation' },
  { commandId: 'slatebase:next-tab', label: 'Nächster Tab', defaultShortcut: 'Ctrl+Shift+]', category: 'navigation' },
  { commandId: 'slatebase:previous-tab', label: 'Vorheriger Tab', defaultShortcut: 'Ctrl+Shift+[', category: 'navigation' },

  // Panel
  { commandId: 'slatebase:open-search', label: 'Vault-Suche öffnen', defaultShortcut: 'Mod+Shift+F', category: 'panel' },
  { commandId: 'slatebase:toggle-mode', label: 'Editor-Modus wechseln', defaultShortcut: 'Mod+E', category: 'panel' },

  // Editor
  { commandId: 'slatebase:editor-save', label: 'Datei speichern', defaultShortcut: 'Mod+S', category: 'editor' },
  { commandId: 'slatebase:editor-undo', label: 'Rückgängig', defaultShortcut: 'Mod+Z', category: 'editor' },
  { commandId: 'slatebase:editor-redo', label: 'Wiederholen', defaultShortcut: 'Mod+Shift+Z', category: 'editor' },

  // Vault
  { commandId: 'slatebase:daily-note', label: 'Tagesnotiz öffnen/erstellen', defaultShortcut: '', category: 'vault' },
  // Obsidian's default (a browser keeps Ctrl+N for a new window; the installed app and a PWA do not)
  { commandId: 'slatebase:create-file', label: 'Neue Datei', defaultShortcut: 'Mod+N', category: 'vault' },
  { commandId: 'slatebase:new-from-template', label: 'Neue Notiz aus Vorlage', defaultShortcut: '', category: 'vault' },
  { commandId: 'slatebase:insert-template', label: 'Vorlage einfügen', defaultShortcut: '', category: 'vault' },
  { commandId: 'slatebase:open-random-note', label: 'Zufällige Notiz öffnen', defaultShortcut: '', category: 'vault' },
  { commandId: 'slatebase:create-unique-note', label: 'Eindeutige Notiz anlegen', defaultShortcut: '', category: 'vault' },
  { commandId: 'slatebase:open-graph', label: 'Knowledge Graph öffnen', defaultShortcut: 'Mod+G', category: 'vault' },
  { commandId: 'slatebase:open-trash', label: 'Papierkorb öffnen', defaultShortcut: '', category: 'vault' },
]

// ─── Internal State ──────────────────────────────────────────────────────────

/** Bindings the vault's hotkeys.json sets (Slatebase command ID → shortcuts; `[]` = unbound). */
let bindings: Map<string, string[]> = new Map()
let apiClient: IApiClient | null = null
let currentVaultId: string | null = null
/** Changes not yet written, per vault (file command ID → bindings, `null` = back to default). */
let pending = new Map<string, Record<string, Hotkey[] | null>>()
let writeTimer: ReturnType<typeof setTimeout> | null = null
/** The vault a write is running for. */
let writingVault: string | null = null
/** The file changed elsewhere while a change of ours was unwritten; read it again when ours is written. */
let reloadRequested = false
const changeListeners = new Set<() => void>()

const WRITE_DEBOUNCE_MS = 500
const RETRY_AFTER_FAILURE_MS = 30_000

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Give the store the API client. The bindings themselves come from the open vault's hotkeys.json
 * (see {@link loadVaultHotkeys}); the per-user list on the server is only read once, to take over.
 */
export async function initialize(client: IApiClient): Promise<void> {
  apiClient = client
}

/**
 * Disconnect from the backend (on logout).
 */
export function disconnect(): void {
  if (writeTimer !== null) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  apiClient = null
  currentVaultId = null
  pending = new Map()
  writingVault = null
  reloadRequested = false
  bindings = new Map()
  // The caches and markers belong to the account that is leaving: the next one must start clean.
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_PREFIX) || key.startsWith(TAKEN_OVER_PREFIX) || key === LEGACY_STORAGE_KEY) localStorage.removeItem(key)
    }
  } catch {
    // Silently fail
  }
}

/** Calls `cb` whenever the effective bindings may have changed. Returns the unsubscribe function. */
export function onKeybindingsChange(cb: () => void): () => void {
  changeListeners.add(cb)
  return () => { changeListeners.delete(cb) }
}

function notify(): void {
  for (const cb of changeListeners) cb()
}

/**
 * Read the vault's hotkeys.json and make it the bindings. Called when a vault is opened and when the
 * file changed elsewhere (Obsidian, a sync, another user). Not while a change of this session is
 * unwritten — the file does not have it yet. The first time a vault is read on a device, the user's
 * old per-user bindings are written into the file for every command the file does not name
 * (the file wins). Returns whether the bindings were replaced.
 */
export async function loadVaultHotkeys(vaultId: string): Promise<boolean> {
  const client = apiClient
  if (!client) return false
  if (currentVaultId !== vaultId) {
    // Another vault: its bindings, not the previous vault's, until the file is read. Unwritten
    // changes of the previous vault stay queued for it.
    currentVaultId = vaultId
    bindings = loadCache(vaultId)
    notify()
  }
  if (hasPendingWork(vaultId)) {
    reloadRequested = true
    return false
  }
  let config: Record<string, unknown>
  try {
    config = await client.getHotkeysConfig(vaultId)
  } catch {
    return false // unknown, not gone: the cache stays
  }
  if (currentVaultId !== vaultId || hasPendingWork(vaultId)) {
    if (currentVaultId === vaultId) reloadRequested = true
    return false // changed while the file was being read
  }

  bindings = readHotkeys(config)
  if (!isTakenOver(vaultId)) await takeOverUserBindings(client, vaultId)
  saveCache(vaultId)
  notify()
  return true
}

function hasPendingWork(vaultId: string): boolean {
  return writingVault === vaultId || pending.has(vaultId)
}

/** Writes the old per-user bindings into the file, for commands the file does not name. Once per vault and device. */
async function takeOverUserBindings(client: IApiClient, vaultId: string): Promise<void> {
  let legacy: Array<{ commandId: string; shortcut: string }>
  try {
    legacy = (await client.getKeybindings()).entries
  } catch {
    legacy = loadLegacyCache() // server unavailable: the cache of the old store is the same data
  }
  const patch: Record<string, Hotkey[]> = {}
  for (const { commandId, shortcut } of legacy) {
    if (bindings.has(commandId)) continue
    const fileId = toFileCommandId(commandId)
    if (!isValidHotkeyCommandId(fileId)) continue
    const value = shortcutsToFileValue(shortcut ? [shortcut] : [])
    if (shortcut && value.length === 0) continue
    patch[fileId] = value
  }
  if (Object.keys(patch).length > 0) {
    try {
      const saved = readHotkeys(await client.patchHotkeysConfig(vaultId, patch))
      // The user may have changed a shortcut meanwhile; then the change is written next and wins.
      if (currentVaultId === vaultId && !hasPendingWork(vaultId)) bindings = saved
    } catch {
      return // no write access or server down: try again the next time this vault is opened
    }
  }
  markTakenOver(vaultId)
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * All shortcuts for a command: the file's, or the default if the file does not name the command.
 */
export function getShortcuts(commandId: string): string[] {
  const set = bindings.get(commandId)
  if (set) return set
  const def = DEFAULT_KEYBINDINGS.find(d => d.commandId === commandId)
  if (!def?.defaultShortcut) return []
  // A default gives way when the file binds the same keys to another command (as Obsidian does).
  for (const shortcuts of bindings.values()) {
    if (shortcuts.some(s => sameShortcut(s, def.defaultShortcut))) return []
  }
  return [def.defaultShortcut]
}

/** The first (primary) shortcut for a command; empty if unbound. */
export function getShortcut(commandId: string): string {
  return getShortcuts(commandId)[0] ?? ''
}

/**
 * Bind a command to exactly these shortcuts. Pass an empty list to explicitly unbind.
 */
export function setShortcuts(commandId: string, shortcuts: string[]): boolean {
  // What the file's API would refuse must not get into the queue: one bad entry would hold back every
  // other change (a plugin's rebind call can send anything).
  if (!isValidHotkeyCommandId(toFileCommandId(commandId)) || shortcuts.length > MAX_HOTKEYS_PER_COMMAND) {
    console.warn(`[keybindings] Ignored bindings for "${String(commandId).slice(0, 80)}": not a usable command ID or too many shortcuts`)
    return false
  }
  const list = shortcuts.filter(s => shortcutToHotkey(s) !== null)
  bindings.set(commandId, list)
  queueWrite(commandId, shortcutsToFileValue(list))
  return true
}

/** The shortcuts the vault's file sets for a command (`[]` = unbound), or undefined if it does not name it. */
export function getFileBinding(commandId: string): string[] | undefined {
  return bindings.get(commandId)
}

/**
 * Set a user override for a command (replacing its bindings).
 * Pass empty string to explicitly unbind.
 */
export function setShortcut(commandId: string, shortcut: string): void {
  setShortcuts(commandId, shortcut ? [shortcut] : [])
}

/** Add a shortcut to a command, keeping the ones it has. */
export function addShortcut(commandId: string, shortcut: string): void {
  const current = getShortcuts(commandId)
  if (current.some(s => sameShortcut(s, shortcut))) return
  setShortcuts(commandId, [...current, shortcut])
}

/** Remove one shortcut of a command; the command stays unbound if it was the last. */
export function removeShortcut(commandId: string, shortcut: string): void {
  setShortcuts(commandId, getShortcuts(commandId).filter(s => !sameShortcut(s, shortcut)))
}

/**
 * Reset a command to its default binding (removes the entry from the file).
 */
export function resetShortcut(commandId: string): void {
  if (!bindings.delete(commandId)) return
  queueWrite(commandId, null)
}

/**
 * Reset the overrides of Slatebase's own commands. What the file binds for other commands (plugins,
 * Obsidian's) is left alone: it is not listed here and may belong to someone else.
 */
export function resetAll(): void {
  for (const { commandId } of DEFAULT_KEYBINDINGS) resetShortcut(commandId)
}

/** Every binding the vault's file sets: Slatebase command ID → shortcuts (`[]` = unbound). */
export function getFileBindings(): Array<[string, string[]]> {
  return [...bindings.entries()]
}

/** Whether the file sets this command (as opposed to the default applying). */
export function isOverridden(commandId: string): boolean {
  return bindings.has(commandId)
}

/**
 * Get all keybinding definitions with their effective shortcuts.
 */
export function getAllBindings(): Array<KeybindingDefinition & { effectiveShortcut: string; effectiveShortcuts: string[]; isOverridden: boolean }> {
  return DEFAULT_KEYBINDINGS.map(def => ({
    ...def,
    effectiveShortcut: getShortcut(def.commandId),
    effectiveShortcuts: getShortcuts(def.commandId),
    isOverridden: isOverridden(def.commandId),
  }))
}

/**
 * Check if a keyboard event matches one of the effective shortcuts for a command.
 * Handles platform-agnostic "Mod" (Ctrl on Win/Linux, Meta on macOS).
 */
export function matchesShortcut(commandId: string, event: KeyboardEvent): boolean {
  return getShortcuts(commandId).some(shortcut => {
    const parsed = parseShortcut(shortcut)
    return parsed !== null && matchesParsed(parsed, event)
  })
}

/** Whether the primary modifier (`Mod`) is Cmd rather than Ctrl. */
export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

/**
 * Parse a shortcut string into its components.
 * Handles "Mod" as platform-agnostic modifier.
 */
export function parseShortcut(shortcut: string): ParsedShortcut | null {
  const hotkey = shortcutToHotkey(shortcut)
  if (!hotkey) return null
  const isMac = isMacPlatform()
  const has = (m: string) => hotkey.modifiers.some(x => x === m)
  return {
    ctrl: has('Ctrl') || (has('Mod') && !isMac),
    shift: has('Shift'),
    alt: has('Alt'),
    meta: has('Meta') || (has('Mod') && isMac),
    key: hotkey.key === ' ' ? 'space' : hotkey.key.toLowerCase(),
  }
}

/** The key name of an event as shortcuts spell it (space is `space`). */
function eventKey(event: KeyboardEvent): string {
  const key = event.key.toLowerCase()
  return key === ' ' ? 'space' : key
}

/**
 * Check if a keyboard event matches a parsed shortcut.
 */
export function matchesParsed(parsed: ParsedShortcut, event: KeyboardEvent): boolean {
  if (event.ctrlKey !== parsed.ctrl) return false
  if (event.shiftKey !== parsed.shift) return false
  if (event.altKey !== parsed.alt) return false
  if (event.metaKey !== parsed.meta) return false
  if (eventKey(event) === parsed.key) return true
  // A digit with Shift or Alt held reports another character (`!`, `¡`); the physical key still says which.
  return /^\d$/.test(parsed.key) && (event.code === `Digit${parsed.key}` || event.code === `Numpad${parsed.key}`)
}

/**
 * Format a shortcut string for display (replaces Mod with platform-specific label).
 */
export function formatShortcut(shortcut: string): string {
  if (!shortcut) return ''
  if (isMacPlatform()) {
    return shortcut
      .replace(/Mod\+/g, '⌘')
      .replace(/Ctrl\+/g, '⌃')
      .replace(/Shift\+/g, '⇧')
      .replace(/Alt\+/g, '⌥')
      .replace(/Meta\+/g, '⌘')
  }
  return shortcut.replace(/Mod\+/g, 'Ctrl+').replace(/Meta\+/g, 'Win+')
}

/** Whether two shortcut strings press the same keys on this platform (`Mod+P` = `Ctrl+P` on Windows). */
function sameShortcut(a: string, b: string): boolean {
  const pa = parseShortcut(a)
  const pb = parseShortcut(b)
  if (!pa || !pb) return a.toLowerCase() === b.toLowerCase()
  return pa.ctrl === pb.ctrl && pa.shift === pb.shift && pa.alt === pb.alt && pa.meta === pb.meta && pa.key === pb.key
}

/**
 * Check if a shortcut is already in use by another command: one with a definition here, or any
 * other command the vault's file binds (plugins). Returns the conflicting command ID or null.
 */
export function findConflict(shortcut: string, excludeCommandId: string): string | null {
  if (!shortcut) return null
  const ids = new Set([...DEFAULT_KEYBINDINGS.map(d => d.commandId), ...bindings.keys()])
  for (const commandId of ids) {
    if (commandId === excludeCommandId) continue
    if (getShortcuts(commandId).some(s => sameShortcut(s, shortcut))) return commandId
  }
  return null
}

// ─── Writing the file ────────────────────────────────────────────────────────

function queueWrite(commandId: string, value: Hotkey[] | null): void {
  const vaultId = currentVaultId
  if (!vaultId) {
    console.warn('[keybindings] No vault is open: the binding applies for now but is not saved')
    return
  }
  pending.set(vaultId, { ...pending.get(vaultId), [toFileCommandId(commandId)]: value })
  saveCache(vaultId)
  notify()
  scheduleWrite(WRITE_DEBOUNCE_MS)
}

function scheduleWrite(delay: number): void {
  if (!apiClient) return
  if (writeTimer !== null) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    void flush()
  }, delay)
}

/** Write the queued changes to the file, vault by vault (a vault switched away from keeps its queue). */
async function flush(): Promise<void> {
  const client = apiClient
  if (!client || writingVault !== null) return
  const next = pending.entries().next()
  if (next.done) return
  const [vaultId, sent] = next.value
  pending.delete(vaultId)
  writingVault = vaultId
  let failed = false
  try {
    const saved = await client.patchHotkeysConfig(vaultId, sent)
    reportSyncSuccess(SYNC_STORE_KEY)
    // Take the file's answer unless something was changed meanwhile (that change is written next).
    if (currentVaultId === vaultId && !pending.has(vaultId)) {
      bindings = readHotkeys(saved)
      saveCache(vaultId)
      notify()
    }
  } catch (error) {
    // The file did not take it: keep it queued (what was changed since wins) and try again later.
    failed = true
    pending.set(vaultId, { ...sent, ...pending.get(vaultId) })
    reportSyncFailure(SYNC_STORE_KEY, error, 'Tastaturkürzel')
  } finally {
    writingVault = null
  }
  if (apiClient !== client) return // logged out meanwhile
  if (pending.size > 0) scheduleWrite(failed ? RETRY_AFTER_FAILURE_MS : WRITE_DEBOUNCE_MS)
  // The file changed elsewhere while ours was unwritten: read it now that ours is in.
  if (!failed && reloadRequested && currentVaultId && !hasPendingWork(currentVaultId)) {
    reloadRequested = false
    void loadVaultHotkeys(currentVaultId)
  }
}

// ─── Local cache (so shortcuts work before the file is read) ─────────────────

const CACHE_PREFIX = 'slatebase:hotkeys:'
const TAKEN_OVER_PREFIX = 'slatebase:hotkeys-taken-over:'

function loadCache(vaultId: string): Map<string, string[]> {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + vaultId)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return new Map()
    const map = new Map<string, string[]>()
    for (const item of parsed) {
      if (Array.isArray(item) && typeof item[0] === 'string' && Array.isArray(item[1]) && item[1].every((s: unknown) => typeof s === 'string')) {
        map.set(item[0], item[1])
      }
    }
    return map
  } catch {
    return new Map()
  }
}

function saveCache(vaultId: string): void {
  try {
    localStorage.setItem(CACHE_PREFIX + vaultId, JSON.stringify([...bindings.entries()]))
  } catch {
    // Silently fail
  }
}

function isTakenOver(vaultId: string): boolean {
  try {
    return localStorage.getItem(TAKEN_OVER_PREFIX + vaultId) !== null
  } catch {
    return false
  }
}

function markTakenOver(vaultId: string): void {
  try {
    localStorage.setItem(TAKEN_OVER_PREFIX + vaultId, '1')
  } catch {
    // Silently fail
  }
}

/** The per-user overrides of earlier versions, as they were cached in this browser. */
function loadLegacyCache(): Array<{ commandId: string; shortcut: string }> {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is { commandId: string; shortcut: string } =>
        typeof item === 'object' && item !== null && typeof item.commandId === 'string' && typeof item.shortcut === 'string',
    )
  } catch {
    return []
  }
}

/**
 * Forget all in-memory state; used by tests, which share
 * this module-level store across cases.
 * @internal
 */
export function _reset(): void {
  disconnect()
  changeListeners.clear()
}
