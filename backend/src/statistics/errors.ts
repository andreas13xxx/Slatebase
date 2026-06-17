// ─── Statistics Error Classes ─────────────────────────────────────────────────

/**
 * Thrown when a vault statistics computation exceeds the allowed timeout.
 */
export class StatisticsTimeoutError extends Error {
  public readonly code = 'STATISTICS_TIMEOUT'

  constructor(public readonly vaultId: string) {
    super(`Statistics computation timed out for vault: ${vaultId}`)
    this.name = 'StatisticsTimeoutError'
  }
}
