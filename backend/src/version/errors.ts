// ─── Version Error Classes ────────────────────────────────────────────────────

/**
 * Thrown when a specific file version cannot be found by path and timestamp.
 */
export class VersionNotFoundError extends Error {
  public readonly code = 'VERSION_NOT_FOUND'

  constructor(public readonly path: string, public readonly timestamp: string) {
    super(`Version not found for "${path}" at timestamp ${timestamp}`)
    this.name = 'VersionNotFoundError'
  }
}

