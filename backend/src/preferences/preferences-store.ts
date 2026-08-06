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
} from './types.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_RECENT_FILES = 20
const MAX_FAVORITES_TOTAL = 500
const MAX_KEYBINDINGS = 200

const EMPTY_PREFERENCES: UserPreferences = { recentFiles: [], favorites: [], keybindings: [] }

function sanitizePreferences(raw: unknown): UserPreferences {
  const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<UserPreferences>
  return {
    recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
    favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    keybindings: Array.isArray(parsed.keybindings) ? parsed.keybindings : [],
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
}
