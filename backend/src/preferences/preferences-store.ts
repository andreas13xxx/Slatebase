/**
 * PreferencesStore — filesystem persistence for per-user preferences.
 * Each user's preferences are stored as a JSON file: `data/users/<userId>-preferences.json`.
 * Uses atomic writes (temp → rename) for crash safety.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type {
  IPreferencesService,
  UserPreferences,
  RecentFileEntry,
  FavoriteEntry,
  KeybindingEntry,
} from './types.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_RECENT_FILES = 20
const MAX_FAVORITES_TOTAL = 500
const MAX_KEYBINDINGS = 200

// ─── Implementation ──────────────────────────────────────────────────────────

export class PreferencesStore implements IPreferencesService {
  private readonly usersDir: string

  constructor(
    dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.usersDir = path.join(dataDir, 'users')
  }

  async getRecentFiles(userId: string): Promise<RecentFileEntry[]> {
    const prefs = await this.load(userId)
    return prefs.recentFiles
  }

  async saveRecentFiles(userId: string, entries: RecentFileEntry[]): Promise<void> {
    const capped = entries.slice(0, MAX_RECENT_FILES)
    const prefs = await this.load(userId)
    prefs.recentFiles = capped
    await this.persist(userId, prefs)
  }

  async getFavorites(userId: string): Promise<FavoriteEntry[]> {
    const prefs = await this.load(userId)
    return prefs.favorites
  }

  async saveFavorites(userId: string, entries: FavoriteEntry[]): Promise<void> {
    const capped = entries.slice(0, MAX_FAVORITES_TOTAL)
    const prefs = await this.load(userId)
    prefs.favorites = capped
    await this.persist(userId, prefs)
  }

  async getKeybindings(userId: string): Promise<KeybindingEntry[]> {
    const prefs = await this.load(userId)
    return prefs.keybindings
  }

  async saveKeybindings(userId: string, entries: KeybindingEntry[]): Promise<void> {
    const capped = entries.slice(0, MAX_KEYBINDINGS)
    const prefs = await this.load(userId)
    prefs.keybindings = capped
    await this.persist(userId, prefs)
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private getFilePath(userId: string): string {
    return path.join(this.usersDir, `${userId}-preferences.json`)
  }

  private async load(userId: string): Promise<UserPreferences> {
    const filePath = this.getFilePath(userId)
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<UserPreferences>
      return {
        recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        keybindings: Array.isArray(parsed.keybindings) ? parsed.keybindings : [],
      }
    } catch (error: unknown) {
      if (this.isNodeError(error) && error.code === 'ENOENT') {
        return { recentFiles: [], favorites: [], keybindings: [] }
      }
      this.logger.error('Failed to load user preferences', { userId, error: String(error) })
      return { recentFiles: [], favorites: [], keybindings: [] }
    }
  }

  private async persist(userId: string, prefs: UserPreferences): Promise<void> {
    const filePath = this.getFilePath(userId)
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })

    const tmpSuffix = crypto.randomBytes(8).toString('hex')
    const tmpPath = `${filePath}.${tmpSuffix}.tmp`

    try {
      await fs.writeFile(tmpPath, JSON.stringify(prefs, null, 2), 'utf-8')
      await fs.rename(tmpPath, filePath)
    } catch (error: unknown) {
      // Clean up temp file on failure
      try { await fs.unlink(tmpPath) } catch { /* ignore */ }
      this.logger.error('Failed to persist user preferences', { userId, error: String(error) })
      throw error
    }
  }

  private isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error
  }
}
