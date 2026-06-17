// ─── Data Models ─────────────────────────────────────────────────────────────

/**
 * Aggregated statistics for a vault (file count, folder count, total size).
 */
export interface VaultStatistics {
  /** Total number of files in the vault. */
  fileCount: number
  /** Total number of folders in the vault. */
  folderCount: number
  /** Total size in bytes of all files in the vault. */
  totalSizeBytes: number
}

// ─── Service Interface ───────────────────────────────────────────────────────

/**
 * Service for computing and caching vault statistics.
 * Performs recursive directory scans with a 5-second timeout and
 * invalidates cached results on `vault:change` events.
 */
export interface IVaultStatisticsService {
  /** Computes statistics for a vault (uses cache if available). */
  getStatistics(vaultId: string): Promise<VaultStatistics>

  /** Invalidates the cached statistics for a vault (called on vault:change events). */
  invalidateCache(vaultId: string): void
}
