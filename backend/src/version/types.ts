// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Versions directory path relative to vault root, as path segments (join
 * with the vault's absolute path via path.join(vaultPath, ...VERSIONS_DIR_SEGMENTS)).
 * Shared so that anything scanning the versions directory (e.g. CleanupJob)
 * can't drift out of sync with where VersionService actually stores versions.
 */
export const VERSIONS_DIR_SEGMENTS = ['.slatebase', 'versions'] as const

// ─── Data Models ─────────────────────────────────────────────────────────────

/**
 * Metadata for a single file version.
 */
export interface VersionEntry {
  /** Timestamp in format YYYYMMDDTHHmmssSSS (UTC). */
  timestamp: string
  /** File size in bytes. */
  sizeBytes: number
}

/**
 * A list of version entries for a file.
 */
export interface VersionList {
  /** All versions for the file, sorted by timestamp descending. */
  versions: VersionEntry[]
}

// ─── Service Interface ───────────────────────────────────────────────────────

/**
 * Service for file versioning.
 * Stores previous file content under `.slatebase/versions/` before each save
 * and provides retrieval, restoration, and cleanup operations.
 */
export interface IVersionService {
  /** Creates a new version by saving the previous content before overwrite. */
  createVersion(vaultId: string, relativePath: string, previousContent: Buffer): Promise<void>

  /** Lists all versions of a file, sorted by timestamp descending. */
  listVersions(vaultId: string, relativePath: string): Promise<VersionEntry[]>

  /** Reads the content of a specific version. */
  getVersionContent(vaultId: string, relativePath: string, timestamp: string): Promise<Buffer>

  /** Restores a version: saves current file as new version, then overwrites with selected version (atomic). */
  restoreVersion(vaultId: string, relativePath: string, timestamp: string): Promise<void>

  /** Removes oldest versions exceeding `maxVersions` and returns the number pruned. */
  pruneVersions(vaultId: string, relativePath: string, maxVersions: number): Promise<number>

  /** Moves version history when a file is renamed or moved. */
  moveVersions(vaultId: string, oldPath: string, newPath: string): Promise<void>

  /** Deletes all versions of a file (when file is permanently deleted). */
  deleteVersions(vaultId: string, relativePath: string): Promise<void>
}
