// ─── Search Error Classes ─────────────────────────────────────────────────────

/**
 * Thrown when a search query fails validation (empty, too long, or whitespace-only).
 */
export class SearchQueryValidationError extends Error {
  public readonly code = 'INVALID_QUERY'

  constructor(message = 'Search query is invalid') {
    super(message)
    this.name = 'SearchQueryValidationError'
  }
}

/**
 * Thrown when a regex pattern is invalid (includes the engine error message).
 */
export class RegexValidationError extends Error {
  public readonly code = 'INVALID_REGEX'

  constructor(public readonly pattern: string, public readonly reason: string) {
    super(`Invalid regex pattern: ${reason}`)
    this.name = 'RegexValidationError'
  }
}

/**
 * Thrown when a regex pattern exceeds the maximum allowed length of 1000 characters.
 */
export class RegexTooLongError extends Error {
  public readonly code = 'REGEX_TOO_LONG'

  constructor(public readonly length: number) {
    super(`Regex pattern too long: ${length} characters (maximum: 1000)`)
    this.name = 'RegexTooLongError'
  }
}

/**
 * Thrown internally when a per-file regex evaluation exceeds the 5-second timeout.
 * This error is not exposed to the client — the file is skipped and search continues.
 */
export class SearchTimeoutError extends Error {
  public readonly code = 'SEARCH_TIMEOUT'

  constructor(public readonly filePath: string) {
    super(`Search timeout for file: ${filePath}`)
    this.name = 'SearchTimeoutError'
  }
}

/**
 * Thrown when the replace request body fails validation.
 */
export class ReplaceValidationError extends Error {
  public readonly code = 'INVALID_REPLACE'

  constructor(message = 'Replace request validation failed') {
    super(message)
    this.name = 'ReplaceValidationError'
  }
}

/**
 * Thrown when a file has been modified since the last search (ETag mismatch during replace).
 */
export class FileChangedError extends Error {
  public readonly code = 'FILE_CHANGED'

  constructor(public readonly filePath: string) {
    super(`File has been modified since last search: ${filePath}`)
    this.name = 'FileChangedError'
  }
}
