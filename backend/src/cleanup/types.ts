// ─── Data Models ─────────────────────────────────────────────────────────────

/**
 * Configuration for the periodic cleanup job.
 */
export interface CleanupConfig {
  /** Number of days to retain trash entries before permanent deletion. */
  trashRetentionDays: number
  /** Maximum number of versions to keep per file. */
  maxVersionsPerFile: number
  /** Interval between cleanup runs in milliseconds. */
  intervalMs: number
}

// ─── Service Interface ───────────────────────────────────────────────────────

/**
 * Periodic job that removes expired trash entries and prunes excess file versions.
 * Runs on a configurable interval and applies current configuration values on each run.
 */
export interface ICleanupJob {
  /** Starts the periodic cleanup (runs immediately, then repeats at configured interval). */
  start(): void

  /** Stops the periodic cleanup. */
  stop(): void

  /** Executes a single cleanup pass across all vaults. */
  runOnce(): Promise<void>
}
