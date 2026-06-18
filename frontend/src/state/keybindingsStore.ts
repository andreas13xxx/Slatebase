/**
 * Keybindings Store — configurable keyboard shortcuts with per-user overrides.
 *
 * Provides default keybindings for all commands and merges with user overrides
 * loaded from the backend. Uses localStorage as immediate cache.
 * Syncs with backend API for cross-device persistence (debounced).
 *
 * Shortcut format: "Ctrl+Shift+F", "Ctrl+P", "Ctrl+,", "Ctrl+S"
 * Modifiers: Ctrl, Shift, Alt, Meta (= Cmd on macOS)
 * Use "Mod" as platform-agnostic: Ctrl on Win/Linux, Meta on macOS.
 */

import type { IApiClient, KeybindingEntry as ApiKeybindingEntry } from '../api'

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

const STORAGE_KEY = 'slatebase:keybindings'
const SYNC_DEBOUNCE_MS = 2000

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
  { commandId: 'slatebase:toggle-theme', label: 'Farbschema umschalten', defaultShortcut: '', category: 'navigation' },

  // Panel
  { commandId: 'slatebase:open-search', label: 'Vault-Suche öffnen', defaultShortcut: 'Mod+Shift+F', category: 'panel' },

  // Editor
  { commandId: 'slatebase:editor-save', label: 'Datei speichern', defaultShortcut: 'Mod+S', category: 'editor' },
  { commandId: 'slatebase:editor-undo', label: 'Rückgängig', defaultShortcut: 'Mod+Z', category: 'editor' },
  { commandId: 'slatebase:editor-redo', label: 'Wiederholen', defaultShortcut: 'Mod+Shift+Z', category: 'editor' },

  // Vault
  { commandId: 'slatebase:daily-note', label: 'Tagesnotiz öffnen/erstellen', defaultShortcut: '', category: 'vault' },
  { commandId: 'slatebase:create-file', label: 'Neue Datei', defaultShortcut: '', category: 'vault' },
  { commandId: 'slatebase:new-from-template', label: 'Neue Notiz aus Vorlage', defaultShortcut: '', category: 'vault' },
  { commandId: 'slatebase:open-graph', label: 'Knowledge Graph öffnen', defaultShortcut: '', category: 'vault' },
  { commandId: 'slatebase:open-trash', label: 'Papierkorb öffnen', defaultShortcut: '', category: 'vault' },
]

// ─── Internal State ──────────────────────────────────────────────────────────

/** User overrides (commandId → shortcut). */
let overrides: Map<string, string> = loadFromStorage()
let apiClient: IApiClient | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncInProgress = false

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the keybindings store with an API client and load user overrides.
 * Called on login / app mount.
 */
export async function initialize(client: IApiClient): Promise<void> {
  apiClient = client
  try {
    const response = await client.getKeybindings()
    if (response.entries.length > 0) {
      overrides = new Map(response.entries.map(e => [e.commandId, e.shortcut]))
      persistLocal()
    }
  } catch {
    // Server unavailable — continue with localStorage data
  }
}

/**
 * Disconnect from the backend (on logout).
 */
export function disconnect(): void {
  if (syncTimer !== null) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
  apiClient = null
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the effective shortcut for a command (user override or default).
 */
export function getShortcut(commandId: string): string {
  if (overrides.has(commandId)) {
    return overrides.get(commandId)!
  }
  const def = DEFAULT_KEYBINDINGS.find(d => d.commandId === commandId)
  return def?.defaultShortcut ?? ''
}

/**
 * Set a user override for a command.
 * Pass empty string to explicitly unbind.
 */
export function setShortcut(commandId: string, shortcut: string): void {
  overrides.set(commandId, shortcut)
  persistLocal()
  scheduleSyncToServer()
}

/**
 * Reset a command to its default binding (removes override).
 */
export function resetShortcut(commandId: string): void {
  overrides.delete(commandId)
  persistLocal()
  scheduleSyncToServer()
}

/**
 * Reset all overrides.
 */
export function resetAll(): void {
  overrides.clear()
  persistLocal()
  scheduleSyncToServer()
}

/**
 * Get all keybinding definitions with their effective shortcuts.
 */
export function getAllBindings(): Array<KeybindingDefinition & { effectiveShortcut: string; isOverridden: boolean }> {
  return DEFAULT_KEYBINDINGS.map(def => ({
    ...def,
    effectiveShortcut: getShortcut(def.commandId),
    isOverridden: overrides.has(def.commandId),
  }))
}

/**
 * Check if a keyboard event matches the effective shortcut for a command.
 * Handles platform-agnostic "Mod" (Ctrl on Win/Linux, Meta on macOS).
 */
export function matchesShortcut(commandId: string, event: KeyboardEvent): boolean {
  const shortcut = getShortcut(commandId)
  if (!shortcut) return false
  const parsed = parseShortcut(shortcut)
  if (!parsed) return false
  return matchesParsed(parsed, event)
}

/**
 * Parse a shortcut string into its components.
 * Handles "Mod" as platform-agnostic modifier.
 */
export function parseShortcut(shortcut: string): ParsedShortcut | null {
  if (!shortcut) return null
  const parts = shortcut.split('+').map(p => p.trim())
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0

  let ctrl = false
  let shift = false
  let alt = false
  let meta = false
  let key = ''

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'ctrl') {
      ctrl = true
    } else if (lower === 'shift') {
      shift = true
    } else if (lower === 'alt') {
      alt = true
    } else if (lower === 'meta' || lower === 'cmd') {
      meta = true
    } else if (lower === 'mod') {
      if (isMac) {
        meta = true
      } else {
        ctrl = true
      }
    } else {
      key = part.toLowerCase()
    }
  }

  if (!key) return null
  return { ctrl, shift, alt, meta, key }
}

/**
 * Check if a keyboard event matches a parsed shortcut.
 */
function matchesParsed(parsed: ParsedShortcut, event: KeyboardEvent): boolean {
  if (event.ctrlKey !== parsed.ctrl) return false
  if (event.shiftKey !== parsed.shift) return false
  if (event.altKey !== parsed.alt) return false
  if (event.metaKey !== parsed.meta) return false
  return event.key.toLowerCase() === parsed.key
}

/**
 * Format a shortcut string for display (replaces Mod with platform-specific label).
 */
export function formatShortcut(shortcut: string): string {
  if (!shortcut) return ''
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  if (isMac) {
    return shortcut
      .replace(/Mod\+/g, '⌘')
      .replace(/Ctrl\+/g, '⌃')
      .replace(/Shift\+/g, '⇧')
      .replace(/Alt\+/g, '⌥')
      .replace(/Meta\+/g, '⌘')
  }
  return shortcut.replace(/Mod\+/g, 'Ctrl+').replace(/Meta\+/g, 'Win+')
}

/**
 * Check if a shortcut is already in use by another command.
 * Returns the conflicting commandId or null.
 */
export function findConflict(shortcut: string, excludeCommandId: string): string | null {
  if (!shortcut) return null
  for (const def of DEFAULT_KEYBINDINGS) {
    if (def.commandId === excludeCommandId) continue
    const effective = getShortcut(def.commandId)
    if (effective && effective.toLowerCase() === shortcut.toLowerCase()) {
      return def.commandId
    }
  }
  return null
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/** Load overrides from localStorage. */
function loadFromStorage(): Map<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Map()
    const map = new Map<string, string>()
    for (const item of parsed) {
      if (typeof item === 'object' && item !== null &&
          typeof item.commandId === 'string' && typeof item.shortcut === 'string') {
        map.set(item.commandId, item.shortcut)
      }
    }
    return map
  } catch {
    return new Map()
  }
}

/** Persist overrides to localStorage. */
function persistLocal(): void {
  try {
    const arr = Array.from(overrides.entries()).map(([commandId, shortcut]) => ({ commandId, shortcut }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
  } catch {
    // Silently fail
  }
}

/** Schedule a debounced sync to the backend. */
function scheduleSyncToServer(): void {
  if (!apiClient) return
  if (syncTimer !== null) {
    clearTimeout(syncTimer)
  }
  syncTimer = setTimeout(() => {
    syncTimer = null
    syncToServer()
  }, SYNC_DEBOUNCE_MS)
}

/** Sync current overrides to the backend. */
async function syncToServer(): Promise<void> {
  if (!apiClient || syncInProgress) return
  syncInProgress = true
  try {
    const entries: ApiKeybindingEntry[] = Array.from(overrides.entries()).map(([commandId, shortcut]) => ({
      commandId,
      shortcut,
    }))
    await apiClient.saveKeybindings(entries)
  } catch {
    // Sync failed — data remains in localStorage, will retry on next change
  } finally {
    syncInProgress = false
  }
}
