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

// ─── UI Settings ─────────────────────────────────────────────────────────────

/**
 * Account-wide UI settings — everything under Einstellungen → Darstellung.
 *
 * These were device-local `localStorage` values, which meant "my settings"
 * silently differed per browser. They are stored here so they follow the
 * account, exactly like keybindings do.
 *
 * The shape is deliberately open (`Record<string, unknown>` for the toolbar's
 * per-entry maps) only where the client owns the vocabulary — plugin ribbon
 * icon ids cannot be enumerated server-side.
 */
export interface UserUiSettings {
  /** Whether the bottom status bar is rendered. */
  statusBarVisible: boolean
  /** Visibility per built-in status bar item, keyed by item id. */
  statusBarItems: Record<string, boolean>
  /** Whether the file explorer auto-reveals the active tab's file. */
  explorerFollowActiveFile: boolean
  /** Toolbar preferences: visibility, docking side, order, hidden ids, colors. */
  toolbar: {
    visible: boolean
    position: 'left' | 'right'
    order: string[]
    hidden: string[]
    colors: Record<string, string>
  }
}

/** Defaults applied when a user has never changed a UI setting. */
export const DEFAULT_UI_SETTINGS: UserUiSettings = {
  statusBarVisible: true,
  statusBarItems: {},
  explorerFollowActiveFile: false,
  toolbar: {
    visible: true,
    position: 'left',
    order: [],
    // The toolbar's own "ausblenden" button is off by default; the client
    // mirrors this list in `toolbarStore.DEFAULT_TOOLBAR_PREFS`.
    hidden: ['toggle-toolbar'],
    colors: {},
  },
}

// ─── Per-Vault Settings ──────────────────────────────────────────────────────

/**
 * Settings scoped to one user *and* one vault. Reading preferences like line
 * numbers or a graph layout belong to the person, not to everyone who can open
 * the vault — but they are worth remembering per vault, because a code-heavy
 * vault and a prose vault want different answers.
 *
 * Not exposed in the settings panel by design: these are reached through the
 * editor context menu, the toolbar context menu and the command palette.
 */
export interface UserVaultSettings {
  /** Editor gutter line numbers. */
  lineNumbers: boolean
  /** Constrain the editor to a readable measure. */
  readableLineLength: boolean
  /** Spellchecking in the editor. */
  spellcheck: boolean
  /**
   * Dictionary the spellchecker loads. The client owns the language codes
   * (see `editor/spellcheck/protocol.ts`), so this is stored as a bounded
   * string rather than an enum the server would have to keep in step.
   */
  spellcheckLanguage: string
  /** App zoom factor (0.5–2.0). */
  zoom: number
  /** Knowledge-graph configuration; shape owned by the client. */
  graph: Record<string, unknown> | null
  /** Left sidebar panel layout; shape owned by the client. */
  sidebarPanel: Record<string, unknown> | null
  /** Right context panel layout; shape owned by the client. */
  contextPanel: Record<string, unknown> | null
}

// ─── Patch Types ─────────────────────────────────────────────────────────────

/*
 * Under `exactOptionalPropertyTypes` a plain `Partial<T>` rejects an object
 * that carries a key with an explicit `undefined` value, which is exactly what
 * a Zod-inferred request body is typed as. These patch types spell out the
 * `| undefined` so the route handlers can hand their parsed body straight to
 * the store without a cast.
 */

/** Partial toolbar update. */
export type ToolbarSettingsPatch = {
  visible?: boolean | undefined
  position?: 'left' | 'right' | undefined
  order?: string[] | undefined
  hidden?: string[] | undefined
  colors?: Record<string, string> | undefined
}

/** Partial account-wide UI settings update. */
export type UserUiSettingsPatch = {
  statusBarVisible?: boolean | undefined
  statusBarItems?: Record<string, boolean> | undefined
  explorerFollowActiveFile?: boolean | undefined
  toolbar?: ToolbarSettingsPatch | undefined
}

/** Partial per-vault settings update. */
export type UserVaultSettingsPatch = {
  [K in keyof UserVaultSettings]?: UserVaultSettings[K] | undefined
}

/** Defaults applied when a user has never changed a setting in a vault. */
export const DEFAULT_VAULT_SETTINGS: UserVaultSettings = {
  lineNumbers: false,
  readableLineLength: true,
  spellcheck: true,
  spellcheckLanguage: 'de',
  zoom: 1,
  graph: null,
  sidebarPanel: null,
  contextPanel: null,
}

// ─── Aggregate ───────────────────────────────────────────────────────────────

/** Full user preferences structure stored on disk. */
export interface UserPreferences {
  recentFiles: RecentFileEntry[]
  favorites: FavoriteEntry[]
  keybindings: KeybindingEntry[]
  /** Account-wide UI settings. Absent on files written before this existed. */
  uiSettings: UserUiSettings
  /** Per-vault settings, keyed by vault ID. */
  vaultSettings: Record<string, UserVaultSettings>
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

  /** Get the account-wide UI settings, merged over the defaults. */
  getUiSettings(userId: string): Promise<UserUiSettings>
  /**
   * Merge a partial UI settings update into the stored value.
   * Partial so one control can save without racing the rest of the form.
   */
  saveUiSettings(userId: string, patch: UserUiSettingsPatch): Promise<UserUiSettings>

  /** Get a user's settings for one vault, merged over the defaults. */
  getVaultSettings(userId: string, vaultId: string): Promise<UserVaultSettings>
  /** Merge a partial per-vault settings update into the stored value. */
  saveVaultSettings(
    userId: string,
    vaultId: string,
    patch: UserVaultSettingsPatch,
  ): Promise<UserVaultSettings>
  /** Remove all per-vault settings for a vault (called when a vault is deleted). */
  deleteVaultSettings(vaultId: string, userIds: string[]): Promise<void>
}
