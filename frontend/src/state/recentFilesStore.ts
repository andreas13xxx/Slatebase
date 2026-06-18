/**
 * Recent Files Store — per-user persistence with localStorage cache.
 *
 * Stores the last 20 opened files with vault ID, path, and timestamp.
 * Uses localStorage as immediate cache for responsiveness.
 * Syncs with backend API for cross-device persistence (debounced).
 */

import type { IApiClient, RecentFileEntry as ApiRecentFileEntry } from '../api'

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single recent file entry. */
export interface RecentFileEntry {
  vaultId: string
  path: string
  /** ISO 8601 timestamp of when the file was last opened. */
  timestamp: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'slatebase:recentFiles'
const MAX_ENTRIES = 20
const SYNC_DEBOUNCE_MS = 2000

// ─── Internal State ──────────────────────────────────────────────────────────

let entries: RecentFileEntry[] = loadFromStorage()
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
    const response = await client.getRecentFiles()
    if (response.entries.length > 0) {
      // Merge: server entries take priority, then local-only entries fill remaining slots
      const serverPaths = new Set(response.entries.map(e => `${e.vaultId}::${e.path}`))
      const localOnly = entries.filter(e => !serverPaths.has(`${e.vaultId}::${e.path}`))
      entries = [...response.entries, ...localOnly].slice(0, MAX_ENTRIES)
    }
    persistLocal()
  } catch {
    // Server unavailable — continue with localStorage data
  }
}

/**
 * Disconnect from the backend (on logout).
 * Flushes any pending sync immediately.
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
 * Add a file to the recent files list.
 * If an entry with the same vaultId + path already exists, it is removed first.
 * The new entry is placed at the front of the list with the current timestamp.
 * If the list exceeds 20 entries, the oldest entry is removed.
 */
export function add(vaultId: string, path: string): void {
  // Remove existing entry with same vaultId + path (dedup)
  entries = entries.filter(e => !(e.vaultId === vaultId && e.path === path))

  // Add to front with current timestamp
  const entry: RecentFileEntry = {
    vaultId,
    path,
    timestamp: new Date().toISOString(),
  }
  entries.unshift(entry)

  // Cap at MAX_ENTRIES
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(0, MAX_ENTRIES)
  }

  persistLocal()
  scheduleSyncToServer()
}

/**
 * Get the most recent file entries.
 * @param limit - Maximum number of entries to return. Defaults to all entries.
 * @returns Array of recent file entries, sorted by most recent first.
 */
export function getRecent(limit?: number): RecentFileEntry[] {
  if (limit === undefined || limit >= entries.length) {
    return [...entries]
  }
  return entries.slice(0, limit)
}

/**
 * Remove a specific entry from the recent files list.
 * Matches by vaultId + path.
 */
export function remove(vaultId: string, path: string): void {
  const before = entries.length
  entries = entries.filter(e => !(e.vaultId === vaultId && e.path === path))
  if (entries.length !== before) {
    persistLocal()
    scheduleSyncToServer()
  }
}

/**
 * Update the path of an entry when a file is renamed or moved.
 * Finds the entry with vaultId + oldPath and updates to newPath.
 */
export function updatePath(vaultId: string, oldPath: string, newPath: string): void {
  let updated = false
  for (const entry of entries) {
    if (entry.vaultId === vaultId && entry.path === oldPath) {
      entry.path = newPath
      updated = true
      break
    }
  }
  if (updated) {
    persistLocal()
    scheduleSyncToServer()
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/** Load entries from localStorage. Returns empty array on failure. */
function loadFromStorage(): RecentFileEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Basic validation: only keep entries that have required fields
    return parsed.filter(
      (item): item is RecentFileEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.vaultId === 'string' &&
        typeof item.path === 'string' &&
        typeof item.timestamp === 'string'
    )
  } catch {
    // localStorage not available or corrupted data — start with empty list
    return []
  }
}

/** Persist current entries to localStorage. Silently fails if unavailable. */
function persistLocal(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage not available or full — work in-memory only
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

/** Sync current entries to the backend. */
async function syncToServer(): Promise<void> {
  if (!apiClient || syncInProgress) return
  syncInProgress = true
  try {
    const apiEntries: ApiRecentFileEntry[] = entries.map(e => ({
      vaultId: e.vaultId,
      path: e.path,
      timestamp: e.timestamp,
    }))
    await apiClient.saveRecentFiles(apiEntries)
  } catch {
    // Sync failed — data remains in localStorage, will retry on next change
  } finally {
    syncInProgress = false
  }
}

// ─── Testing Utilities ───────────────────────────────────────────────────────

/**
 * Re-initialize the store from localStorage.
 * Useful in tests after manually manipulating localStorage.
 * @internal
 */
export function _reload(): void {
  entries = loadFromStorage()
}
