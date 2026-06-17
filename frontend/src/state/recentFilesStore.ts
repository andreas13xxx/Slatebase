/**
 * Recent Files Store — localStorage-based state for recently opened files.
 *
 * Stores the last 20 opened files with vault ID, path, and timestamp.
 * Persists to `localStorage` under key `slatebase:recentFiles`.
 * Falls back to in-memory storage if localStorage is not available.
 */

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

// ─── Internal State ──────────────────────────────────────────────────────────

let entries: RecentFileEntry[] = loadFromStorage()

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

  persist()
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
    persist()
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
    persist()
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
function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage not available or full — work in-memory only
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
