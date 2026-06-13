// ─── Search Options ──────────────────────────────────────────────────────────

/**
 * Options for configuring a search operation.
 */
export interface ISearchOptions {
  /** The search query string (1–500 characters). */
  query: string
  /** Whether to perform a case-sensitive search. Default: false. */
  caseSensitive: boolean
  /** Whether to interpret the query as a JavaScript RegExp pattern. Default: false. */
  regex: boolean
  /** Number of context lines to include before and after each hit (0–10). Default: 2. */
  contextLines: number
  /** Maximum number of hits to return (1–500). Default: 500. */
  maxResults: number
}

// ─── Search Response Models ──────────────────────────────────────────────────

/**
 * Response from a single-vault search operation.
 */
export interface SearchResponse {
  /** Files containing hits, each with their individual matches. */
  results: SearchFileResult[]
  /** Total number of hits across all files. */
  totalHits: number
  /** Number of files actually searched (may be less than total due to limits). */
  filesSearched: number
  /** Whether the search was truncated before completion. */
  truncated: boolean
  /** Reason for truncation, if applicable. */
  truncationReason?: 'file_limit' | 'time_limit' | 'result_limit'
  /** Human-readable message explaining truncation. */
  truncationMessage?: string
  /** Files that were skipped during the search with reasons. */
  skippedFiles: SkippedFile[]
  /** Total duration of the search in milliseconds. */
  durationMs: number
}

/**
 * Search results for a single file.
 */
export interface SearchFileResult {
  /** Relative file path within the vault. */
  filePath: string
  /** File name (last segment of the path). */
  fileName: string
  /** Individual hits found in this file. */
  hits: SearchHit[]
  /** Total number of hits in this file. */
  hitCount: number
}

/**
 * A single search hit within a file.
 */
export interface SearchHit {
  /** 1-based line number where the match occurs. */
  line: number
  /** The matched text (truncated to 200 characters). */
  matchText: string
  /** Lines before the match (up to contextLines count). */
  contextBefore: string[]
  /** Lines after the match (up to contextLines count). */
  contextAfter: string[]
  /** Full line content containing the match. */
  matchLine: string
}

/**
 * A file that was skipped during the search.
 */
export interface SkippedFile {
  /** Relative file path within the vault. */
  path: string
  /** Reason why the file was skipped. */
  reason: 'binary' | 'too_large' | 'internal' | 'unreadable'
}

// ─── Multi-Vault Search Response ─────────────────────────────────────────────

/**
 * Response from a multi-vault search operation.
 */
export interface MultiVaultSearchResponse {
  /** Results grouped by vault. */
  vaults: VaultSearchResult[]
  /** Total number of hits across all vaults. */
  totalHits: number
  /** Total number of files searched across all vaults. */
  filesSearched: number
  /** Whether the search was truncated before completion. */
  truncated: boolean
  /** Reason for truncation, if applicable. */
  truncationReason?: 'file_limit' | 'time_limit' | 'result_limit'
  /** Human-readable message explaining truncation. */
  truncationMessage?: string
  /** Vaults that failed during the search. */
  failedVaults: FailedVault[]
  /** Total duration of the search in milliseconds. */
  durationMs: number
}

/**
 * Search results for a single vault in a multi-vault search.
 */
export interface VaultSearchResult {
  /** Vault identifier. */
  vaultId: string
  /** Display name of the vault. */
  vaultName: string
  /** Files containing hits in this vault. */
  results: SearchFileResult[]
  /** Total number of hits in this vault. */
  totalHits: number
}

/**
 * A vault that failed during a multi-vault search.
 */
export interface FailedVault {
  /** Vault identifier. */
  vaultId: string
  /** Display name of the vault. */
  vaultName: string
  /** Human-readable error reason. */
  reason: string
}

// ─── Search Service Interface ────────────────────────────────────────────────

/**
 * Service for performing full-text search across vault files.
 * Iterates text files linearly, matching plain-text or regex patterns.
 * Respects file limit (1000), time limit (30s), and result limit (500).
 */
export interface ISearchService {
  /**
   * Searches all text files in a vault for the given query.
   * Respects file limit (1000), time limit (30s), and result limit (maxResults).
   */
  search(vaultId: string, options: ISearchOptions): Promise<SearchResponse>

  /**
   * Searches across multiple vaults.
   * Uses the same limits globally across all vaults.
   * Filters vaults by user read access via VaultAccessControl.
   */
  searchMultiVault(userId: string, vaultIds: string[], options: ISearchOptions): Promise<MultiVaultSearchResponse>
}

// ─── Replace Models ──────────────────────────────────────────────────────────

/**
 * Options for configuring a replace operation.
 */
export interface IReplaceOptions {
  /** The search query to find occurrences (1–500 characters). */
  query: string
  /** The replacement text (0–5000 characters). */
  replacement: string
  /** Whether to match case-sensitively. */
  caseSensitive: boolean
  /** Whether to interpret the query as a JavaScript RegExp pattern. */
  regex: boolean
  /** Optional: restrict replacement to specific file paths (max 100). */
  paths?: string[]
}

/**
 * Response from a replace operation.
 */
export interface ReplaceResponse {
  /** Total number of individual text replacements made. */
  totalReplacements: number
  /** Number of files that were modified. */
  fileCount: number
  /** Details of each file that was successfully modified. */
  files: ReplaceFileResult[]
  /** Files where replacement failed. */
  failed: ReplaceFailure[]
}

/**
 * Result of a successful replacement in a single file.
 */
export interface ReplaceFileResult {
  /** Relative file path within the vault. */
  path: string
  /** Number of replacements made in this file. */
  replacements: number
}

/**
 * A file where replacement failed.
 */
export interface ReplaceFailure {
  /** Relative file path within the vault. */
  path: string
  /** Human-readable reason for the failure. */
  reason: string
}

// ─── Replace Service Interface ───────────────────────────────────────────────

/**
 * Service for performing text replacements in vault files.
 * Uses atomic writes (temp → rename) per file.
 */
export interface IReplaceService {
  /**
   * Replaces all occurrences of query with replacement in the specified vault.
   * Uses atomic writes (temp → rename) per file.
   * Skips files that changed since the search (based on ETag).
   */
  replace(vaultId: string, options: IReplaceOptions): Promise<ReplaceResponse>
}
