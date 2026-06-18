/**
 * Favorites store — per-user persistence with localStorage cache.
 *
 * Persists per-vault favorite file entries.
 * Uses localStorage as immediate cache for responsiveness.
 * Syncs with backend API for cross-device persistence (debounced).
 *
 * localStorage key format: `slatebase:favorites:<vaultId>`
 * Max 50 favorites per vault. Ordered by addedAt descending (newest first).
 */

import type { IApiClient, FavoriteEntry as ApiFavoriteEntry } from '../api'

// ─── Data Models ─────────────────────────────────────────────────────────────

/** A single favorite entry. */
export interface FavoriteEntry {
  vaultId: string
  path: string
  addedAt: string // ISO 8601
}

/** Public interface for the favorites store. */
export interface IFavoritesStore {
  /** Mark a file as favorite. Rejects silently if cap (50) reached. */
  add(vaultId: string, path: string): void
  /** Remove a favorite. */
  remove(vaultId: string, path: string): void
  /** Get all favorites for a vault, ordered by addedAt descending (newest first). */
  getForVault(vaultId: string): FavoriteEntry[]
  /** Check if a file is a favorite. */
  isFavorite(vaultId: string, path: string): boolean
  /** Update path when a file is renamed or moved. */
  updatePath(vaultId: string, oldPath: string, newPath: string): void
  /** Remove favorite entry when file is deleted. */
  removeByPath(vaultId: string, path: string): void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'slatebase:favorites:'
const MAX_FAVORITES_PER_VAULT = 50
const SYNC_DEBOUNCE_MS = 2000

// ─── Internal State ──────────────────────────────────────────────────────────

/** In-memory fallback when localStorage is unavailable. */
const memoryStore = new Map<string, FavoriteEntry[]>()

/** API client reference for backend sync. */
let apiClient: IApiClient | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncInProgress = false

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the store with an API client and load server-side data.
 * Merges server data with local cache (server wins for conflicts).
 * Called on login / app mount.
 */
export async function initialize(client: IApiClient): Promise<void> {
  apiClient = client
  try {
    const response = await client.getFavorites()
    if (response.entries.length > 0) {
      // Group server entries by vault
      const serverByVault = new Map<string, FavoriteEntry[]>()
      for (const entry of response.entries) {
        const existing = serverByVault.get(entry.vaultId) ?? []
        existing.push(entry)
        serverByVault.set(entry.vaultId, existing)
      }

      // For each vault with server data, merge with local
      for (const [vaultId, serverEntries] of serverByVault) {
        const localEntries = loadFavorites(vaultId)
        const serverPaths = new Set(serverEntries.map(e => e.path))
        const localOnly = localEntries.filter(e => !serverPaths.has(e.path))
        const merged = [...serverEntries, ...localOnly].slice(0, MAX_FAVORITES_PER_VAULT)
        saveFavoritesLocal(vaultId, merged)
      }
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

// ─── Storage Helpers ─────────────────────────────────────────────────────────

/**
 * Detect whether localStorage is available and functional.
 */
function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__slatebase_ls_test__'
    localStorage.setItem(testKey, '1')
    localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/** Read favorites for a vault from storage. */
function loadFavorites(vaultId: string): FavoriteEntry[] {
  const key = STORAGE_PREFIX + vaultId

  if (!isLocalStorageAvailable()) {
    return memoryStore.get(key) ?? []
  }

  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Validate shape loosely — filter invalid entries
    return parsed.filter(
      (entry): entry is FavoriteEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.vaultId === 'string' &&
        typeof entry.path === 'string' &&
        typeof entry.addedAt === 'string'
    )
  } catch {
    return []
  }
}

/** Write favorites for a vault to local storage only. */
function saveFavoritesLocal(vaultId: string, entries: FavoriteEntry[]): void {
  const key = STORAGE_PREFIX + vaultId

  if (!isLocalStorageAvailable()) {
    memoryStore.set(key, entries)
    return
  }

  try {
    localStorage.setItem(key, JSON.stringify(entries))
  } catch {
    // Quota exceeded or other error — fall back to memory silently
    memoryStore.set(key, entries)
  }
}

/** Save favorites locally AND schedule backend sync. */
function saveFavorites(vaultId: string, entries: FavoriteEntry[]): void {
  saveFavoritesLocal(vaultId, entries)
  scheduleSyncToServer()
}

// ─── Backend Sync ────────────────────────────────────────────────────────────

/** Schedule a debounced sync of ALL favorites to the backend. */
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

/** Sync all favorites across all vaults to the backend. */
async function syncToServer(): Promise<void> {
  if (!apiClient || syncInProgress) return
  syncInProgress = true
  try {
    // Collect all favorites from all vault keys in localStorage
    const allEntries = collectAllFavorites()
    const apiEntries: ApiFavoriteEntry[] = allEntries.map(e => ({
      vaultId: e.vaultId,
      path: e.path,
      addedAt: e.addedAt,
    }))
    await apiClient.saveFavorites(apiEntries)
  } catch {
    // Sync failed — data remains in localStorage, will retry on next change
  } finally {
    syncInProgress = false
  }
}

/** Collect all favorites from localStorage across all vault keys. */
function collectAllFavorites(): FavoriteEntry[] {
  const all: FavoriteEntry[] = []

  if (!isLocalStorageAvailable()) {
    for (const entries of memoryStore.values()) {
      all.push(...entries)
    }
    return all
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const raw = localStorage.getItem(key)
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as FavoriteEntry[]
            if (Array.isArray(parsed)) {
              all.push(...parsed.filter(
                (e): e is FavoriteEntry =>
                  typeof e === 'object' && e !== null &&
                  typeof e.vaultId === 'string' &&
                  typeof e.path === 'string' &&
                  typeof e.addedAt === 'string'
              ))
            }
          } catch { /* skip malformed */ }
        }
      }
    }
  } catch { /* ignore */ }

  return all
}

// ─── Store Implementation ────────────────────────────────────────────────────

/**
 * Add a file to favorites for a vault.
 * If already a favorite, does nothing.
 * If cap of 50 is reached, rejects the add silently.
 */
export function add(vaultId: string, path: string): void {
  const entries = loadFavorites(vaultId)

  // Already a favorite — no-op
  if (entries.some(e => e.path === path)) return

  // Cap reached — reject
  if (entries.length >= MAX_FAVORITES_PER_VAULT) return

  const entry: FavoriteEntry = {
    vaultId,
    path,
    addedAt: new Date().toISOString(),
  }

  entries.unshift(entry) // Newest first
  saveFavorites(vaultId, entries)
}

/**
 * Remove a file from favorites for a vault.
 */
export function remove(vaultId: string, path: string): void {
  const entries = loadFavorites(vaultId)
  const filtered = entries.filter(e => e.path !== path)
  if (filtered.length !== entries.length) {
    saveFavorites(vaultId, filtered)
  }
}

/**
 * Get all favorites for a vault, ordered by addedAt descending (newest first).
 */
export function getForVault(vaultId: string): FavoriteEntry[] {
  const entries = loadFavorites(vaultId)
  return [...entries].sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  )
}

/**
 * Check if a file is a favorite for a given vault.
 */
export function isFavorite(vaultId: string, path: string): boolean {
  const entries = loadFavorites(vaultId)
  return entries.some(e => e.path === path)
}

/**
 * Update the path of a favorite entry when a file is renamed or moved.
 * If the old path is not found, does nothing.
 */
export function updatePath(vaultId: string, oldPath: string, newPath: string): void {
  const entries = loadFavorites(vaultId)
  let changed = false
  for (const entry of entries) {
    if (entry.path === oldPath) {
      entry.path = newPath
      changed = true
      break
    }
  }
  if (changed) {
    saveFavorites(vaultId, entries)
  }
}

/**
 * Remove a favorite entry when the file is deleted.
 * Alias for remove — semantically distinct for clarity.
 */
export function removeByPath(vaultId: string, path: string): void {
  remove(vaultId, path)
}

// ─── Bundled Store Object ────────────────────────────────────────────────────

/** Bundled favorites store implementing IFavoritesStore. */
export const favoritesStore: IFavoritesStore = {
  add,
  remove,
  getForVault,
  isFavorite,
  updatePath,
  removeByPath,
}
