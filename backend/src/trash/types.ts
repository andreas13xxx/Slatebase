// ─── Data Models ─────────────────────────────────────────────────────────────

/**
 * A single entry in the trash index representing a deleted file or folder.
 */
export interface TrashEntry {
  /** Unique identifier for the trash entry (12-char hex). */
  id: string
  /** Original relative path within the vault. */
  originalPath: string
  /** ISO 8601 timestamp of when the item was deleted. */
  deletedAt: string
  /** Whether the deleted item is a directory. */
  isDirectory: boolean
}

/**
 * The trash index file structure persisted as `.trash/_index.json`.
 */
export interface TrashIndex {
  /** All trash entries for this vault. */
  entries: TrashEntry[]
}

// ─── Service Interface ───────────────────────────────────────────────────────

/**
 * Service for soft-delete operations.
 * Manages moving files to `.trash/`, restoring them, and purging expired entries.
 */
export interface ITrashService {
  /** Moves a file or folder into the `.trash/` directory and records metadata. */
  moveToTrash(vaultId: string, relativePath: string): Promise<TrashEntry>

  /** Lists all trash entries for a vault, sorted by `deletedAt` descending. */
  listTrash(vaultId: string): Promise<TrashEntry[]>

  /** Restores a file from trash to its original path (with suffix if occupied). */
  restore(vaultId: string, entryId: string): Promise<{ restoredPath: string }>

  /** Permanently deletes a trash entry and its associated files. */
  deletePermanently(vaultId: string, entryId: string): Promise<void>

  /** Removes entries older than `retentionDays` and returns the number purged. */
  purgeExpired(vaultId: string, retentionDays: number): Promise<number>

  /** Permanently deletes a file immediately (when retentionDays is 0). */
  deleteImmediately(vaultId: string, relativePath: string): Promise<void>
}
