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

/**
 * Thrown when the maximum number of versions per file has been exceeded.
 */
export class VersionLimitError extends Error {
  public readonly code = 'VERSION_LIMIT_EXCEEDED'

  constructor(public readonly path: string, public readonly maxVersions: number) {
    super(`Version limit (${maxVersions}) exceeded for "${path}"`)
    this.name = 'VersionLimitError'
  }
}
