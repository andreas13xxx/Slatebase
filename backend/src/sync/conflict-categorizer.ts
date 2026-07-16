import type { ConflictEntry, ConflictCategory, CategorizedConflictEntry } from './types.js'

// ─── Input Types ─────────────────────────────────────────────────────────────

/**
 * Describes the local file state for categorization.
 */
export interface LocalFileState {
  /** Whether the local file exists on disk. */
  exists: boolean
  /** Content hash of the local file (for rename detection). Undefined if file absent. */
  contentHash?: string
}

/**
 * Describes the remote file state for categorization.
 */
export interface RemoteFileState {
  /** Whether the remote file exists in CouchDB. */
  exists: boolean
  /** Content hash of the remote file (for rename detection). Undefined if file absent. */
  contentHash?: string
}

/**
 * Input for categorizing a single conflict, combining the conflict entry
 * with information about local/remote file state.
 */
export interface CategorizationInput {
  /** The base conflict entry. */
  conflict: ConflictEntry
  /** Local file state. */
  local: LocalFileState
  /** Remote file state. */
  remote: RemoteFileState
  /**
   * Whether the same content hash exists at a different path.
   * When true and both hashes match, indicates a rename conflict.
   */
  sameContentAtDifferentPath?: boolean
}

// ─── Categorization Logic ────────────────────────────────────────────────────

/**
 * Categorizes a single conflict based on local and remote file state.
 * Produces exactly one of the four conflict categories:
 * - `content_conflict`: both local and remote have been modified (both exist)
 * - `local_deleted`: file is absent locally but present/modified remotely
 * - `remote_deleted`: file is absent remotely but present/modified locally
 * - `rename_conflict`: same content hash found at different paths
 *
 * @param input - The conflict entry combined with local/remote state information
 * @returns A CategorizedConflictEntry with the determined category
 */
export function categorizeConflict(input: CategorizationInput): CategorizedConflictEntry {
  const { conflict, local, remote, sameContentAtDifferentPath } = input

  let category: ConflictCategory

  // Priority 1: Rename detection — same content hash at different paths
  if (
    sameContentAtDifferentPath &&
    local.contentHash != null &&
    remote.contentHash != null &&
    local.contentHash === remote.contentHash
  ) {
    category = 'rename_conflict'
  }
  // Priority 2: Local file absent, remote present → local_deleted
  else if (!local.exists && remote.exists) {
    category = 'local_deleted'
  }
  // Priority 3: Remote file absent, local present → remote_deleted
  else if (local.exists && !remote.exists) {
    category = 'remote_deleted'
  }
  // Default: Both modified (both exist) → content_conflict
  else {
    category = 'content_conflict'
  }

  const result: CategorizedConflictEntry = {
    ...conflict,
    category,
  }

  if (local.contentHash != null) {
    result.localContentHash = local.contentHash
  }

  if (remote.contentHash != null) {
    result.remoteContentHash = remote.contentHash
  }

  return result
}

/**
 * Categorizes multiple conflicts in bulk.
 * Each conflict is independently categorized — failures in one do not affect others.
 *
 * @param inputs - Array of categorization inputs
 * @returns Array of categorized conflict entries (same order as input)
 */
export function categorizeConflicts(inputs: CategorizationInput[]): CategorizedConflictEntry[] {
  return inputs.map(categorizeConflict)
}

/**
 * Assigns a default category to a ConflictEntry that lacks one.
 * Used for backward compatibility with legacy entries stored before categorization was introduced.
 *
 * @param conflict - A plain ConflictEntry without category
 * @returns A CategorizedConflictEntry with category defaulting to 'content_conflict'
 */
export function applyDefaultCategory(conflict: ConflictEntry): CategorizedConflictEntry {
  return {
    ...conflict,
    category: 'content_conflict',
  }
}
