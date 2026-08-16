// ─── CSS Snippet Error Classes ────────────────────────────────────────────────

/**
 * Thrown when a snippet cannot be found for the given vault and snippet ID.
 */
export class SnippetNotFoundError extends Error {
  constructor(public readonly vaultId: string, public readonly snippetId: string) {
    super(`Snippet "${snippetId}" not found in vault "${vaultId}"`)
    this.name = 'SnippetNotFoundError'
  }
}

/**
 * Thrown when a snippet file exceeds the maximum allowed size (512 KB).
 */
export class SnippetTooLargeError extends Error {
  constructor(public readonly maxSize: number, public readonly actualSize: number) {
    super(`Snippet exceeds maximum size of ${maxSize} bytes (actual: ${actualSize})`)
    this.name = 'SnippetTooLargeError'
  }
}

/**
 * Thrown when a snippet filename fails validation (must match `^[a-zA-Z0-9_-]+\.css$`).
 */
export class InvalidSnippetFilenameError extends Error {
  constructor(public readonly filename: string) {
    super(`Invalid snippet filename: "${filename}" — must match /^[a-zA-Z0-9_-]+\\.css$/`)
    this.name = 'InvalidSnippetFilenameError'
  }
}
