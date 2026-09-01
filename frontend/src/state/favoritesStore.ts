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
import {
  hasSyncedBefore,
  markSyncedBefore,
  clearSyncedBefore,
  reportSyncFailure,
  reportSyncSuccess,
} from './preferenceSync'

// ─── Data Models ─────────────────────────────────────────────────────────────

/** Discriminates what a bookmark points at. Absent means 'file' (legacy entries). */
export type BookmarkType = 'file' | 'heading' | 'block' | 'search'

/** A single favorite (bookmark) entry. */
export interface FavoriteEntry {
  /** Unique per entry. Primary key for reorder/rename/removal of non-file bookmarks. */
  id: string
  vaultId: string
  /** Empty string for type='search' (no file target). */
  path: string
  addedAt: string // ISO 8601
  /** Ascending sort position — determines display order (ties broken by insertion order). */
  order: number
  /** Optional user-chosen display name overriding the filename/default label. */
  label?: string
  /** Defaults to 'file' when absent (legacy entries and the plain add()/remove() API). */
  type?: BookmarkType
  /** Only for type='heading': the heading text. */
  heading?: string
  /** Only for type='block': the block ID (without leading ^). */
  blockId?: string
  /** Only for type='search': the search query. */
  searchQuery?: string
  /** Only for type='search'. */
  searchCaseSensitive?: boolean
  /** Only for type='search'. */
  searchRegex?: boolean
}

/** Public interface for the favorites store. */
export interface IFavoritesStore {
  /** Mark a file as favorite. Rejects silently if cap (50) reached. No-op if already favorited. */
  add(vaultId: string, path: string): void
  /** Remove the file-type favorite at this path (does not touch heading/block bookmarks on the same file). */
  remove(vaultId: string, path: string): void
  /** Get all entries for a vault, ordered by `order` ascending. */
  getForVault(vaultId: string): FavoriteEntry[]
  /** Check if a file has a file-type favorite. */
  isFavorite(vaultId: string, path: string): boolean
  /** Update the path on every entry (any type) referencing it when a file is renamed or moved. */
  updatePath(vaultId: string, oldPath: string, newPath: string): void
  /** Remove every entry (any type) referencing this path when the file is deleted. */
  removeByPath(vaultId: string, path: string): void
  /** Move an entry to a new position (0-indexed within the vault's sorted list). */
  reorder(vaultId: string, id: string, newIndex: number): void
  /** Set or clear (pass null) an entry's display label. */
  setLabel(vaultId: string, id: string, label: string | null): void
  /** Remove any entry (any type) by its unique id. */
  removeById(vaultId: string, id: string): void
  /** Add a bookmark for a heading within a file. */
  addHeadingBookmark(vaultId: string, path: string, heading: string): void
  /** Add a bookmark for a block within a file. */
  addBlockBookmark(vaultId: string, path: string, blockId: string): void
  /** Add a bookmark for a saved search query. */
  addSearchBookmark(vaultId: string, query: string, caseSensitive: boolean, regex: boolean): void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'slatebase:favorites:'
const MAX_FAVORITES_PER_VAULT = 50
const SYNC_DEBOUNCE_MS = 2000

/** Identifies this store to the shared first-sync/failure bookkeeping. */
const SYNC_STORE_KEY = 'favorites'
const MAX_LABEL_LENGTH = 100

/** Shape tolerated when reading raw (possibly pre-migration) storage/server data. */
interface RawFavoriteEntry {
  id?: unknown
  vaultId?: unknown
  path?: unknown
  addedAt?: unknown
  order?: unknown
  label?: unknown
  type?: unknown
  heading?: unknown
  blockId?: unknown
  searchQuery?: unknown
  searchCaseSensitive?: unknown
  searchRegex?: unknown
}

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
 *
 * Once this device has synced before, the server list *replaces* the local
 * cache rather than merging into it. Merging kept local-only entries alive,
 * which resurrected favorites deleted on another device — the older state
 * winning, not the newer one. See preferenceSync.ts for why an empty server
 * response is only treated as "no record" before the first successful upload.
 *
 * Called on login / app mount.
 */
export async function initialize(client: IApiClient): Promise<void> {
  apiClient = client
  try {
    const response = await client.getFavorites()

    if (response.entries.length === 0 && !hasSyncedBefore(SYNC_STORE_KEY) && collectAllFavorites().length > 0) {
      await syncToServer()
      return
    }

    // Group server entries by vault
    const serverByVault = new Map<string, ApiFavoriteEntry[]>()
    for (const entry of response.entries) {
      const existing = serverByVault.get(entry.vaultId) ?? []
      existing.push(entry)
      serverByVault.set(entry.vaultId, existing)
    }

    for (const [vaultId, rawServerEntries] of serverByVault) {
      const { migrated } = migrateEntries(rawServerEntries)
      saveFavoritesLocal(vaultId, migrated.slice(0, MAX_FAVORITES_PER_VAULT))
    }

    // Vaults the server no longer lists have had their last favorite removed
    // elsewhere; drop the stale local copies so they aren't pushed back up.
    for (const vaultId of listLocalVaultIds()) {
      if (!serverByVault.has(vaultId)) {
        saveFavoritesLocal(vaultId, [])
      }
    }

    markSyncedBefore(SYNC_STORE_KEY)
  } catch {
    // Server unavailable — continue with localStorage data. No marker is set,
    // so a later successful init can still seed from this cache.
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
  // The marker is per device *and* account: the next user to log in here must
  // not inherit this one's "already synced" state.
  clearSyncedBefore(SYNC_STORE_KEY)
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

/** Generate a unique id for a new entry. */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for environments without Web Crypto (older test runners).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Loosely validate a raw (possibly legacy/pre-migration) entry shape. */
function isRawFavoriteEntry(entry: unknown): entry is RawFavoriteEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const e = entry as RawFavoriteEntry
  return (
    typeof e.vaultId === 'string' &&
    typeof e.path === 'string' &&
    typeof e.addedAt === 'string'
  )
}

/**
 * Backfill `id` and `order` on entries that predate this feature (Requirement 1.5).
 * Idempotent: entries that already have both fields are returned unchanged.
 * Entries missing `order` are assigned fresh values in their previous display
 * order (addedAt descending — newest first), matching pre-existing behavior.
 */
function migrateEntries(entries: RawFavoriteEntry[]): { migrated: FavoriteEntry[]; changed: boolean } {
  let changed = false

  const needsOrder = entries.some((e) => typeof e.order !== 'number')
  let ordered: RawFavoriteEntry[] = entries
  if (needsOrder) {
    changed = true
    ordered = [...entries].sort(
      (a, b) => new Date(b.addedAt as string).getTime() - new Date(a.addedAt as string).getTime()
    )
  }

  const migrated = ordered.map((e, index): FavoriteEntry => {
    if (typeof e.id !== 'string') changed = true
    return {
      id: typeof e.id === 'string' ? e.id : generateId(),
      vaultId: e.vaultId as string,
      path: e.path as string,
      addedAt: e.addedAt as string,
      order: typeof e.order === 'number' ? e.order : index,
      label: typeof e.label === 'string' ? e.label : undefined,
      type: isBookmarkType(e.type) ? e.type : undefined,
      heading: typeof e.heading === 'string' ? e.heading : undefined,
      blockId: typeof e.blockId === 'string' ? e.blockId : undefined,
      searchQuery: typeof e.searchQuery === 'string' ? e.searchQuery : undefined,
      searchCaseSensitive: typeof e.searchCaseSensitive === 'boolean' ? e.searchCaseSensitive : undefined,
      searchRegex: typeof e.searchRegex === 'boolean' ? e.searchRegex : undefined,
    }
  })

  return { migrated, changed }
}

function isBookmarkType(value: unknown): value is BookmarkType {
  return value === 'file' || value === 'heading' || value === 'block' || value === 'search'
}

/** Read favorites for a vault from storage, migrating legacy entries as needed. */
function loadFavorites(vaultId: string): FavoriteEntry[] {
  const key = STORAGE_PREFIX + vaultId

  let raw: RawFavoriteEntry[]
  if (!isLocalStorageAvailable()) {
    raw = (memoryStore.get(key) as unknown as RawFavoriteEntry[] | undefined) ?? []
  } else {
    try {
      const rawJson = localStorage.getItem(key)
      if (!rawJson) return []
      const parsed: unknown = JSON.parse(rawJson)
      if (!Array.isArray(parsed)) return []
      raw = parsed.filter(isRawFavoriteEntry)
    } catch {
      return []
    }
  }

  const { migrated, changed } = migrateEntries(raw)
  if (changed) {
    // Persist the migration locally so subsequent loads are idempotent (Property 2).
    // No backend sync is scheduled here — the next explicit mutation will sync the full list.
    saveFavoritesLocal(vaultId, migrated)
  }
  return migrated
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
      id: e.id,
      vaultId: e.vaultId,
      path: e.path,
      addedAt: e.addedAt,
      order: e.order,
      label: e.label,
      type: e.type,
      heading: e.heading,
      blockId: e.blockId,
      searchQuery: e.searchQuery,
      searchCaseSensitive: e.searchCaseSensitive,
      searchRegex: e.searchRegex,
    }))
    await apiClient.saveFavorites(apiEntries)
    markSyncedBefore(SYNC_STORE_KEY)
    reportSyncSuccess(SYNC_STORE_KEY)
  } catch (error) {
    // Data remains in localStorage and retries on the next change; the user is
    // told once per failure streak so a silent divergence can't build up.
    reportSyncFailure(SYNC_STORE_KEY, error, 'Favoriten')
  } finally {
    syncInProgress = false
  }
}

/** Vault IDs that currently have a favorites entry in local storage. */
function listLocalVaultIds(): string[] {
  if (!isLocalStorageAvailable()) {
    return Array.from(memoryStore.keys(), (key) => key.slice(STORAGE_PREFIX.length))
  }

  const vaultIds: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(STORAGE_PREFIX)) {
        vaultIds.push(key.slice(STORAGE_PREFIX.length))
      }
    }
  } catch { /* ignore */ }
  return vaultIds
}

/** Collect all favorites from localStorage across all vault keys (migrated). */
function collectAllFavorites(): FavoriteEntry[] {
  const all: FavoriteEntry[] = []
  for (const vaultId of listLocalVaultIds()) {
    all.push(...loadFavorites(vaultId))
  }
  return all
}

// ─── Store Implementation ────────────────────────────────────────────────────

/** Next `order` value for a vault's entries (appends to the end). */
function nextOrder(entries: FavoriteEntry[]): number {
  if (entries.length === 0) return 0
  return Math.max(...entries.map((e) => e.order)) + 1
}

/**
 * Add a file to favorites for a vault.
 * If already a file-type favorite at this path, does nothing.
 * If cap of 50 (across all bookmark types) is reached, rejects the add silently.
 */
export function add(vaultId: string, path: string): void {
  const entries = loadFavorites(vaultId)

  // Already a file-type favorite at this path — no-op
  if (entries.some(e => e.path === path && (e.type ?? 'file') === 'file')) return

  // Cap reached — reject
  if (entries.length >= MAX_FAVORITES_PER_VAULT) return

  const entry: FavoriteEntry = {
    id: generateId(),
    vaultId,
    path,
    addedAt: new Date().toISOString(),
    order: nextOrder(entries),
    type: 'file',
  }

  entries.push(entry) // Appended — order (not array position) drives display order
  saveFavorites(vaultId, entries)
}

/**
 * Remove the file-type favorite at this path for a vault.
 * Does not remove heading/block/search bookmarks (use removeById for those).
 */
export function remove(vaultId: string, path: string): void {
  const entries = loadFavorites(vaultId)
  const filtered = entries.filter(e => !(e.path === path && (e.type ?? 'file') === 'file'))
  if (filtered.length !== entries.length) {
    saveFavorites(vaultId, filtered)
  }
}

/**
 * Get all entries for a vault, ordered by `order` ascending.
 */
export function getForVault(vaultId: string): FavoriteEntry[] {
  const entries = loadFavorites(vaultId)
  return [...entries].sort((a, b) => a.order - b.order)
}

/**
 * Check if a file has a file-type favorite for a given vault.
 */
export function isFavorite(vaultId: string, path: string): boolean {
  const entries = loadFavorites(vaultId)
  return entries.some(e => e.path === path && (e.type ?? 'file') === 'file')
}

/**
 * Update the path on every entry (any bookmark type) referencing it, when the
 * underlying file is renamed or moved. If no entry references the old path, does nothing.
 */
export function updatePath(vaultId: string, oldPath: string, newPath: string): void {
  const entries = loadFavorites(vaultId)
  let changed = false
  for (const entry of entries) {
    if (entry.path === oldPath) {
      entry.path = newPath
      changed = true
    }
  }
  if (changed) {
    saveFavorites(vaultId, entries)
  }
}

/**
 * Remove every entry (any bookmark type) referencing this path when the file is deleted.
 */
export function removeByPath(vaultId: string, path: string): void {
  const entries = loadFavorites(vaultId)
  const filtered = entries.filter(e => e.path !== path)
  if (filtered.length !== entries.length) {
    saveFavorites(vaultId, filtered)
  }
}

/**
 * Move an entry to a new position within its vault's sorted list.
 * Out-of-range indices are clamped to the nearest valid position (Requirement 1 error handling).
 * No-op if the id does not exist.
 */
export function reorder(vaultId: string, id: string, newIndex: number): void {
  const sorted = getForVault(vaultId)
  const fromIndex = sorted.findIndex(e => e.id === id)
  if (fromIndex === -1) return

  const clampedIndex = Math.max(0, Math.min(newIndex, sorted.length - 1))
  const [moved] = sorted.splice(fromIndex, 1)
  sorted.splice(clampedIndex, 0, moved!)

  const reindexed = sorted.map((e, index) => ({ ...e, order: index }))
  saveFavorites(vaultId, reindexed)
}

/**
 * Set (non-empty, trimmed, max 100 chars) or clear (null/empty/whitespace-only) an entry's label.
 * No-op if the id does not exist.
 */
export function setLabel(vaultId: string, id: string, label: string | null): void {
  const entries = loadFavorites(vaultId)
  const entry = entries.find(e => e.id === id)
  if (!entry) return

  const trimmed = label?.trim()
  if (!trimmed) {
    delete entry.label
  } else {
    entry.label = trimmed.slice(0, MAX_LABEL_LENGTH)
  }
  saveFavorites(vaultId, entries)
}

/**
 * Remove any entry (any bookmark type) by its unique id.
 */
export function removeById(vaultId: string, id: string): void {
  const entries = loadFavorites(vaultId)
  const filtered = entries.filter(e => e.id !== id)
  if (filtered.length !== entries.length) {
    saveFavorites(vaultId, filtered)
  }
}

/** Shared creation path for the three non-file bookmark types. Respects the 50-entry cap. */
function addTypedEntry(
  vaultId: string,
  partial: Pick<FavoriteEntry, 'path' | 'type' | 'heading' | 'blockId' | 'searchQuery' | 'searchCaseSensitive' | 'searchRegex'>
): void {
  const entries = loadFavorites(vaultId)
  if (entries.length >= MAX_FAVORITES_PER_VAULT) return

  const entry: FavoriteEntry = {
    id: generateId(),
    vaultId,
    addedAt: new Date().toISOString(),
    order: nextOrder(entries),
    ...partial,
  }
  entries.push(entry)
  saveFavorites(vaultId, entries)
}

/** Add a bookmark for a heading within a file (Requirement 11). */
export function addHeadingBookmark(vaultId: string, path: string, heading: string): void {
  addTypedEntry(vaultId, { path, type: 'heading', heading, blockId: undefined, searchQuery: undefined, searchCaseSensitive: undefined, searchRegex: undefined })
}

/** Add a bookmark for a block within a file (Requirement 12). */
export function addBlockBookmark(vaultId: string, path: string, blockId: string): void {
  addTypedEntry(vaultId, { path, type: 'block', blockId, heading: undefined, searchQuery: undefined, searchCaseSensitive: undefined, searchRegex: undefined })
}

/** Add a bookmark for a saved search query (Requirement 13). */
export function addSearchBookmark(vaultId: string, query: string, caseSensitive: boolean, regex: boolean): void {
  addTypedEntry(vaultId, { path: '', type: 'search', searchQuery: query, searchCaseSensitive: caseSensitive, searchRegex: regex, heading: undefined, blockId: undefined })
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
  reorder,
  setLabel,
  removeById,
  addHeadingBookmark,
  addBlockBookmark,
  addSearchBookmark,
}
