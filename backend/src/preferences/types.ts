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

/** Discriminates what a favorite entry points at. Absent means 'file' (legacy entries). */
export type BookmarkType = 'file' | 'heading' | 'block' | 'search'

/**
 * A single favorite entry.
 * Optional fields are typed `| undefined` (not just `?:`) because this interface
 * must structurally accept the Zod-inferred output of `favoriteEntrySchema`'s
 * `.optional()` fields under the project's `exactOptionalPropertyTypes: true`.
 */
export interface FavoriteEntry {
  /** Unique per entry. Absent on legacy entries the client hasn't migrated yet. */
  id?: string | undefined
  vaultId: string
  /** Empty string for type='search' (no file target). */
  path: string
  /** ISO 8601 timestamp of when the file was favorited. */
  addedAt: string
  /** Ascending sort position. Absent on legacy entries the client hasn't migrated yet. */
  order?: number | undefined
  /** Optional user-chosen display name overriding the filename/default label. */
  label?: string | undefined
  /** Defaults to 'file' when absent (legacy entries). */
  type?: BookmarkType | undefined
  /** Only for type='heading': the heading text. */
  heading?: string | undefined
  /** Only for type='block': the block ID (without leading ^). */
  blockId?: string | undefined
  /** Only for type='search': the search query. */
  searchQuery?: string | undefined
  /** Only for type='search'. */
  searchCaseSensitive?: boolean | undefined
  /** Only for type='search'. */
  searchRegex?: boolean | undefined
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
