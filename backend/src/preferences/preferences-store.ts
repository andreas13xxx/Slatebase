/**
 * PreferencesStore — filesystem persistence for per-user preferences.
 * Each user's preferences are stored as a JSON file: `data/users/<userId>-preferences.json`.
 * Uses atomic writes (temp → rename) for crash safety.
 */

import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type {
  IPreferencesService,
  UserPreferences,
  RecentFileEntry,
  FavoriteEntry,
  KeybindingEntry,
  UserUiSettings,
  UserVaultSettings,
  UserUiSettingsPatch,
  UserVaultSettingsPatch,
} from './types.js'
import { DEFAULT_UI_SETTINGS, DEFAULT_VAULT_SETTINGS } from './types.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_RECENT_FILES = 20
const MAX_FAVORITES_TOTAL = 500
const MAX_KEYBINDINGS = 200

const MAX_VAULT_SETTINGS = 200

const EMPTY_PREFERENCES: UserPreferences = {
  recentFiles: [],
  favorites: [],
  keybindings: [],
  uiSettings: DEFAULT_UI_SETTINGS,
  vaultSettings: {},
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A patch with every `undefined` removed from both the value and the type. */
type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> }

/**
 * Drops keys whose value is `undefined` before a patch is spread over the
 * stored settings. Without this, a caller sending `{ zoom: undefined }` would
 * erase the stored zoom instead of leaving it alone — and the spread result
 * would no longer satisfy the non-optional settings interface.
 */
function definedOnly<T extends object>(patch: T): Defined<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Defined<T>
}

/**
 * Coerces a stored UI settings object onto the current shape, filling anything
 * missing from the defaults. Files written before these fields existed parse
 * cleanly this way instead of needing a migration step.
 */
function sanitizeUiSettings(raw: unknown): UserUiSettings {
  const parsed = isRecord(raw) ? raw : {}
  const toolbarRaw = isRecord(parsed['toolbar']) ? parsed['toolbar'] : {}
  const position = toolbarRaw['position']

  return {
    statusBarVisible: typeof parsed['statusBarVisible'] === 'boolean'
      ? parsed['statusBarVisible']
      : DEFAULT_UI_SETTINGS.statusBarVisible,
    statusBarItems: isRecord(parsed['statusBarItems'])
      ? Object.fromEntries(
          Object.entries(parsed['statusBarItems']).filter(([, v]) => typeof v === 'boolean'),
        ) as Record<string, boolean>
      : {},
    explorerFollowActiveFile: typeof parsed['explorerFollowActiveFile'] === 'boolean'
      ? parsed['explorerFollowActiveFile']
      : DEFAULT_UI_SETTINGS.explorerFollowActiveFile,
    toolbar: {
      visible: typeof toolbarRaw['visible'] === 'boolean'
        ? toolbarRaw['visible']
        : DEFAULT_UI_SETTINGS.toolbar.visible,
      position: position === 'left' || position === 'right' ? position : 'left',
      order: Array.isArray(toolbarRaw['order'])
        ? toolbarRaw['order'].filter((v): v is string => typeof v === 'string')
        : [],
      hidden: Array.isArray(toolbarRaw['hidden'])
        ? toolbarRaw['hidden'].filter((v): v is string => typeof v === 'string')
        : [...DEFAULT_UI_SETTINGS.toolbar.hidden],
      colors: isRecord(toolbarRaw['colors'])
        ? Object.fromEntries(
            Object.entries(toolbarRaw['colors']).filter(([, v]) => typeof v === 'string'),
          ) as Record<string, string>
        : {},
    },
  }
}

/** Same idea as `sanitizeUiSettings`, for one vault's entry. */
function sanitizeVaultSettings(raw: unknown): UserVaultSettings {
  const parsed = isRecord(raw) ? raw : {}
  const bool = (key: keyof UserVaultSettings, fallback: boolean): boolean =>
    typeof parsed[key] === 'boolean' ? parsed[key] : fallback
  const zoom = parsed['zoom']

  return {
    lineNumbers: bool('lineNumbers', DEFAULT_VAULT_SETTINGS.lineNumbers),
    readableLineLength: bool('readableLineLength', DEFAULT_VAULT_SETTINGS.readableLineLength),
    spellcheck: bool('spellcheck', DEFAULT_VAULT_SETTINGS.spellcheck),
    spellcheckLanguage: typeof parsed['spellcheckLanguage'] === 'string' && parsed['spellcheckLanguage'].length <= 16
      ? parsed['spellcheckLanguage']
      : DEFAULT_VAULT_SETTINGS.spellcheckLanguage,
    zoom: typeof zoom === 'number' && Number.isFinite(zoom) && zoom >= 0.5 && zoom <= 2
      ? zoom
      : DEFAULT_VAULT_SETTINGS.zoom,
    graph: isRecord(parsed['graph']) ? parsed['graph'] : null,
    sidebarPanel: isRecord(parsed['sidebarPanel']) ? parsed['sidebarPanel'] : null,
    contextPanel: isRecord(parsed['contextPanel']) ? parsed['contextPanel'] : null,
  }
}

function sanitizePreferences(raw: unknown): UserPreferences {
  const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<UserPreferences>
  const vaultSettingsRaw = isRecord(parsed.vaultSettings) ? parsed.vaultSettings : {}

  return {
    recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
    favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    keybindings: Array.isArray(parsed.keybindings) ? parsed.keybindings : [],
    uiSettings: sanitizeUiSettings(parsed.uiSettings),
    vaultSettings: Object.fromEntries(
      Object.entries(vaultSettingsRaw)
        .slice(0, MAX_VAULT_SETTINGS)
        .map(([vaultId, value]) => [vaultId, sanitizeVaultSettings(value)]),
    ),
  }
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class PreferencesStore implements IPreferencesService {
  private readonly store: KeyedJsonFileStore<UserPreferences>

  constructor(
    dataDir: string,
    private readonly logger: ILogger,
  ) {
    const usersDir = path.join(dataDir, 'users')
    this.store = new KeyedJsonFileStore<UserPreferences>(
      (userId) => path.join(usersDir, `${userId}-preferences.json`),
      EMPTY_PREFERENCES,
      sanitizePreferences,
      (error) => this.logger.error('Failed to load user preferences', { error: String(error) }),
    )
  }

  async getRecentFiles(userId: string): Promise<RecentFileEntry[]> {
    return (await this.store.read(userId)).recentFiles
  }

  async saveRecentFiles(userId: string, entries: RecentFileEntry[]): Promise<void> {
    const capped = entries.slice(0, MAX_RECENT_FILES)
    await this.store.mutate(userId, (prefs) => ({ ...prefs, recentFiles: capped }))
  }

  async getFavorites(userId: string): Promise<FavoriteEntry[]> {
    return (await this.store.read(userId)).favorites
  }

  async saveFavorites(userId: string, entries: FavoriteEntry[]): Promise<void> {
    const capped = entries.slice(0, MAX_FAVORITES_TOTAL)
    await this.store.mutate(userId, (prefs) => ({ ...prefs, favorites: capped }))
  }

  async getKeybindings(userId: string): Promise<KeybindingEntry[]> {
    return (await this.store.read(userId)).keybindings
  }

  async saveKeybindings(userId: string, entries: KeybindingEntry[]): Promise<void> {
    const capped = entries.slice(0, MAX_KEYBINDINGS)
    await this.store.mutate(userId, (prefs) => ({ ...prefs, keybindings: capped }))
  }

  async getUiSettings(userId: string): Promise<UserUiSettings> {
    return (await this.store.read(userId)).uiSettings
  }

  async saveUiSettings(userId: string, patch: UserUiSettingsPatch): Promise<UserUiSettings> {
    const updated = await this.store.mutate(userId, (prefs) => ({
      ...prefs,
      uiSettings: {
        ...prefs.uiSettings,
        ...definedOnly(patch),
        // The toolbar is the one nested object a caller may patch partially —
        // a spread alone would drop the sibling keys it did not send.
        toolbar: { ...prefs.uiSettings.toolbar, ...definedOnly(patch.toolbar ?? {}) },
      },
    }))
    return updated.uiSettings
  }

  async getVaultSettings(userId: string, vaultId: string): Promise<UserVaultSettings> {
    const prefs = await this.store.read(userId)
    return prefs.vaultSettings[vaultId] ?? structuredClone(DEFAULT_VAULT_SETTINGS)
  }

  async saveVaultSettings(
    userId: string,
    vaultId: string,
    patch: UserVaultSettingsPatch,
  ): Promise<UserVaultSettings> {
    const updated = await this.store.mutate(userId, (prefs) => {
      const current = prefs.vaultSettings[vaultId] ?? structuredClone(DEFAULT_VAULT_SETTINGS)
      const next: Record<string, UserVaultSettings> = {
        ...prefs.vaultSettings,
        [vaultId]: { ...current, ...definedOnly(patch) },
      }

      // Bound the map so a user who opens many vaults cannot grow this file
      // without limit; the oldest keys go first, and a dropped vault simply
      // falls back to defaults next time it is opened.
      const entries = Object.entries(next)
      const bounded = entries.length > MAX_VAULT_SETTINGS
        ? Object.fromEntries(entries.slice(entries.length - MAX_VAULT_SETTINGS))
        : next

      return { ...prefs, vaultSettings: bounded }
    })
    return updated.vaultSettings[vaultId] ?? structuredClone(DEFAULT_VAULT_SETTINGS)
  }

  async deleteVaultSettings(vaultId: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      await this.store.mutate(userId, (prefs) => {
        if (!(vaultId in prefs.vaultSettings)) return prefs
        const { [vaultId]: _removed, ...rest } = prefs.vaultSettings
        return { ...prefs, vaultSettings: rest }
      })
    }
  }
}
