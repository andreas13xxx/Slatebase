/**
 * User preferences data models.
 * Persisted per-user as JSON files in `data/users/<userId>-preferences.json`.
 */

// ─── Recent Files ────────────────────────────────────────────────────────────

/** A single recent file entry. */
export interface RecentFileEntry {
  vaultId: string
  path: string
  /** ISO 8601 timestamp of when the file was last opened. */
  timestamp: string
}

// ─── Favorites ───────────────────────────────────────────────────────────────

/** A single favorite entry. */
export interface FavoriteEntry {
  vaultId: string
  path: string
  /** ISO 8601 timestamp of when the file was favorited. */
  addedAt: string
}

// ─── Keybindings ─────────────────────────────────────────────────────────────

/**
 * A single keybinding override.
 * Shortcut format: modifier keys joined with `+`, e.g. "Ctrl+Shift+P", "Ctrl+S".
 * Use "Meta" for Cmd on macOS.
 */
export interface KeybindingEntry {
  /** The command ID this binding applies to, e.g. "slatebase:open-command-palette". */
  commandId: string
  /** The shortcut string, e.g. "Ctrl+P" or "Ctrl+Shift+F". Empty string means unbound. */
  shortcut: string
}

// ─── Aggregate ───────────────────────────────────────────────────────────────

/** Full user preferences structure stored on disk. */
export interface UserPreferences {
  recentFiles: RecentFileEntry[]
  favorites: FavoriteEntry[]
  keybindings: KeybindingEntry[]
}

// ─── Service Interface ───────────────────────────────────────────────────────

/** Service for reading and writing user preferences. */
export interface IPreferencesService {
  /** Get the recent files list for a user. */
  getRecentFiles(userId: string): Promise<RecentFileEntry[]>
  /** Save the recent files list for a user. Capped at 20 entries. */
  saveRecentFiles(userId: string, entries: RecentFileEntry[]): Promise<void>

  /** Get the favorites for a user. */
  getFavorites(userId: string): Promise<FavoriteEntry[]>
  /** Save the favorites for a user. Capped at 50 entries per vault. */
  saveFavorites(userId: string, entries: FavoriteEntry[]): Promise<void>

  /** Get the keybinding overrides for a user. */
  getKeybindings(userId: string): Promise<KeybindingEntry[]>
  /** Save the keybinding overrides for a user. */
  saveKeybindings(userId: string, entries: KeybindingEntry[]): Promise<void>
}
