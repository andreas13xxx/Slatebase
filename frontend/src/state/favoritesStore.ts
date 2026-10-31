/**
 * Favorites (bookmarks) store — the vault's bookmarks, with a localStorage cache.
 *
 * The bookmarks of a vault live in `.obsidian/bookmarks.json`, like in Obsidian: the same for
 * everyone who opens the vault, and changing them needs write access (see bookmarksFile.ts for the
 * mapping). localStorage is the immediate cache for responsiveness; a change is written to the file
 * debounced, and `loadVaultBookmarks()` replaces the cache with the file's content when a vault is
 * opened or the file changes elsewhere.
 *
 * The bookmarks used to be per user, on the server (`/users/me/favorites`). That copy is only read
 * now: the first time a vault whose file has no bookmarks is opened, the entries found there are
 * written into the file.
 *
 * localStorage key format: `slatebase:favorites:<vaultId>`
 * Entries are ordered by `order`; at most MAX_BOOKMARK_ITEMS per vault.
 */

import { MAX_BOOKMARK_ITEMS } from '@slatebase/shared-contracts'
import type { IApiClient, FavoriteEntry as ApiFavoriteEntry } from '../api'
import { entriesToItems, itemsToEntries, type LoadedBookmarks } from './bookmarksFile'
import {
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
const MAX_FAVORITES_PER_VAULT = MAX_BOOKMARK_ITEMS
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

/** Vaults with a change that is not in the file yet, with a counter that goes up with every change. */
const dirtyVaults = new Map<string, number>()
/** After a failed write, the next try comes after this long. */
const RETRY_AFTER_FAILURE_MS = 30_000
/** What the file held when it was last read or written, per vault (to write back what Slatebase does not show). */
const loadedFiles = new Map<string, LoadedBookmarks>()
const changeListeners = new Set<() => void>()

/** Calls `cb` after the cache of any vault was replaced by the file's content. Returns the function that stops it. */
export function onFavoritesChange(cb: () => void): () => void {
  changeListeners.add(cb)
  return () => { changeListeners.delete(cb) }
}

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the store with an API client and read the old per-user list from the server.
 *
 * That list is only read, never written: it fills the local cache so that a vault whose
 * bookmarks.json has no bookmarks yet can take them over (see `loadVaultBookmarks`). The vault's
 * file replaces the cache of each vault as it is opened.
 *
 * Called on login / app mount.
 */
export async function initialize(client: IApiClient): Promise<void> {
  apiClient = client
  try {
    const response = await client.getFavorites()

    // Group server entries by vault
    const serverByVault = new Map<string, ApiFavoriteEntry[]>()
    for (const entry of response.entries) {
      const existing = serverByVault.get(entry.vaultId) ?? []
      existing.push(entry)
      serverByVault.set(entry.vaultId, existing)
    }

    for (const [vaultId, rawServerEntries] of serverByVault) {
      if (dirtyVaults.has(vaultId)) continue // unsaved changes of this session are newer than the old list
      const { migrated } = migrateEntries(rawServerEntries)
      saveFavoritesLocal(vaultId, migrated.slice(0, MAX_FAVORITES_PER_VAULT))
    }

    // A vault the old list does not mention has no entries to take over; its cache is replaced
    // by the vault's file when it is opened (and not wiped here, it may hold unsaved changes).
  } catch {
    // Server unavailable — continue with localStorage data.
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
  dirtyVaults.clear()
  loadedFiles.clear()
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

/** Save favorites locally AND schedule the write into the vault's file. */
function saveFavorites(vaultId: string, entries: FavoriteEntry[]): void {
  saveFavoritesLocal(vaultId, entries)
  dirtyVaults.set(vaultId, (dirtyVaults.get(vaultId) ?? 0) + 1)
  scheduleSyncToServer()
}

// ─── Vault file sync ─────────────────────────────────────────────────────────

/** Schedule a debounced write of the changed vaults' bookmarks into their files. */
function scheduleSyncToServer(delayMs: number = SYNC_DEBOUNCE_MS): void {
  if (!apiClient) return
  if (syncTimer !== null) {
    clearTimeout(syncTimer)
  }
  syncTimer = setTimeout(() => {
    syncTimer = null
    void syncToServer()
  }, delayMs)
}

/** An empty view of a file nothing is known about yet: no items, so nothing is kept and everything is new. */
function emptyFile(): LoadedBookmarks {
  return { entries: [], items: [], rawById: new Map() }
}

/** Writes the bookmarks of every changed vault into its `.obsidian/bookmarks.json`. */
async function syncToServer(): Promise<void> {
  const client = apiClient
  if (!client) return
  if (syncInProgress) {
    scheduleSyncToServer() // a change came in during a write: try again once that one is done
    return
  }
  syncInProgress = true
  let failed = false
  try {
    for (const [vaultId, version] of [...dirtyVaults]) {
      const previous = loadedFiles.get(vaultId) ?? emptyFile()
      // What is written is fixed here; changes made while the request runs are written next time.
      const written = [...loadFavorites(vaultId)].sort((a, b) => a.order - b.order)
      const items = entriesToItems(written, previous)
      try {
        const saved = await client.patchBookmarksConfig(vaultId, { items })
        const savedItems = Array.isArray(saved['items']) ? saved['items'] : items
        // What is in the file now, with the ids the cache already has for the entries that were written
        // (they were written in `order`, so they line up with the entries read back).
        const fresh = itemsToEntries(vaultId, savedItems)
        const rawById = new Map<string, Record<string, unknown>>()
        written.forEach((entry, index) => {
          const freshEntry = fresh.entries[index]
          const raw = freshEntry ? fresh.rawById.get(freshEntry.id) : undefined
          if (raw !== undefined) rawById.set(entry.id, raw)
        })
        loadedFiles.set(vaultId, { entries: fresh.entries, items: fresh.items, rawById })
        // Only a vault nobody changed meanwhile is clean again.
        if (dirtyVaults.get(vaultId) === version) dirtyVaults.delete(vaultId)
        reportSyncSuccess(SYNC_STORE_KEY)
      } catch (error) {
        // The cache keeps the change and the vault stays dirty; it is tried again later. The user is
        // told once per failure streak (typically: no write access).
        failed = true
        reportSyncFailure(SYNC_STORE_KEY, error, 'Lesezeichen')
      }
    }
  } finally {
    syncInProgress = false
  }
  if (failed) scheduleSyncToServer(RETRY_AFTER_FAILURE_MS)
  else if (dirtyVaults.size > 0) scheduleSyncToServer()
}

/**
 * Replaces the cache of a vault with the content of its `bookmarks.json`, and tells the listeners.
 * Does nothing while the vault has a change that is not in the file yet (it would be lost).
 *
 * A vault whose file has no bookmarks yet (no list, or an empty one) takes over the entries found in
 * the cache (from the old per-user list) by writing them into the file. That happens once per vault
 * and device (a marker in localStorage), so bookmarks deleted in the file later do not come back.
 * Returns whether the cache was replaced.
 */
export async function loadVaultBookmarks(vaultId: string): Promise<boolean> {
  const client = apiClient
  if (!client || dirtyVaults.has(vaultId)) return false
  let config: Record<string, unknown>
  try {
    config = await client.getBookmarksConfig(vaultId)
  } catch {
    return false // unknown, not gone: the cache stays
  }
  if (dirtyVaults.has(vaultId)) return false // changed while the file was being read

  const items: unknown[] = Array.isArray(config['items']) ? config['items'] : []
  const takenOver = isTakenOver(vaultId)
  if (items.length === 0 && !takenOver) {
    markTakenOver(vaultId)
    // No bookmarks in the file yet: hand over what the old list had.
    if (loadFavorites(vaultId).length > 0) {
      loadedFiles.set(vaultId, { entries: [], items: [], rawById: new Map() })
      dirtyVaults.set(vaultId, 1)
      await syncToServer()
      return false
    }
  }
  markTakenOver(vaultId)

  // Not cut to the limit: entries beyond it stay in the file, they are just not added to.
  const loaded = itemsToEntries(vaultId, items)
  loadedFiles.set(vaultId, loaded)
  saveFavoritesLocal(vaultId, loaded.entries)
  for (const cb of changeListeners) cb()
  return true
}

const TAKEN_OVER_PREFIX = 'slatebase:favorites-taken-over:'

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
    // Without localStorage the old list would be offered again next session; harmless for a vault with bookmarks.
  }
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
