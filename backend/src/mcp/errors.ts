// ─── MCP Error Classes ───────────────────────────────────────────────────────

/**
 * Thrown when a token is invalid, expired, or revoked.
 */
export class McpAuthenticationError extends Error {
  constructor(public readonly code: 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'TOKEN_REVOKED') {
    super(`MCP authentication failed: ${code}`)
    this.name = 'McpAuthenticationError'
  }
}

/**
 * Thrown when the token limit per user is reached.
 */
export class TokenLimitError extends Error {
  constructor(public readonly maxTokens: number) {
    super(`Token limit reached: maximum ${maxTokens} active tokens per user`)
    this.name = 'TokenLimitError'
  }
}

/**
 * Thrown when token name or expiry validation fails.
 */
export class TokenValidationError extends Error {
  constructor(
    public readonly code: 'NAME_EMPTY' | 'NAME_TOO_LONG' | 'NAME_DUPLICATE' | 'EXPIRY_INVALID',
    message: string
  ) {
    super(message)
    this.name = 'TokenValidationError'
  }
}

/**
 * Thrown when rate limit is exceeded for a token.
 */
export class McpRateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`MCP rate limit exceeded. Retry after ${retryAfter} seconds`)
    this.name = 'McpRateLimitError'
  }
}

/**
 * Thrown when MCP functionality is disabled via configuration.
 */
export class McpDisabledError extends Error {
  constructor() {
    super('MCP functionality is disabled')
    this.name = 'McpDisabledError'
  }
}

/**
 * Thrown when a token is not found (for revocation or lookup).
 */
export class TokenNotFoundError extends Error {
  constructor(public readonly tokenId: string) {
    super(`Token not found: ${tokenId}`)
    this.name = 'TokenNotFoundError'
  }
}
