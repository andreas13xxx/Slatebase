// ─── MCP Data Models ─────────────────────────────────────────────────────────

/**
 * Persisted token record (stored as JSON file).
 * Each token is stored individually under `data/mcp/tokens/<tokenId>.json`.
 */
export interface TokenRecord {
  /** Unique token identifier (UUID v4). */
  tokenId: string
  /** SHA-256 hash of the raw token (hex-encoded). */
  tokenHash: string
  /** User ID of the token owner. */
  userId: string
  /** User-chosen name, 1–64 chars, unique per user. */
  name: string
  /** ISO 8601 timestamp of creation. */
  createdAt: string
  /** ISO 8601 timestamp of expiration. */
  expiresAt: string
  /** ISO 8601 timestamp of revocation, or null if active. */
  revokedAt: string | null
  /** ISO 8601 timestamp of last usage, or null if never used. */
  lastUsedAt: string | null
}

/**
 * Per-user index file content.
 * Stored under `data/mcp/tokens/_by-user/<userId>.json`.
 */
export interface UserTokenIndex {
  /** Array of token IDs belonging to this user. */
  tokenIds: string[]
}

/**
 * Public token info returned to the user (no hash).
 * Used in token listing responses.
 */
export interface ApiTokenInfo {
  /** Unique token identifier. */
  tokenId: string
  /** User-chosen token name. */
  name: string
  /** ISO 8601 timestamp of creation. */
  createdAt: string
  /** ISO 8601 timestamp of expiration. */
  expiresAt: string
  /** ISO 8601 timestamp of last usage, or null if never used. */
  lastUsedAt: string | null
  /** Current token status. */
  status: 'active' | 'expired' | 'revoked'
  /** Masked token value, e.g. "****...ab3f". */
  maskedToken: string
}

/**
 * Result of token creation (includes raw token, shown only once).
 */
export interface TokenCreateResult {
  /** Raw token value (128 hex chars). Shown only once at creation. */
  token: string
  /** Unique token identifier. */
  tokenId: string
  /** User-chosen token name. */
  name: string
  /** ISO 8601 timestamp of expiration. */
  expiresAt: string
}

/**
 * Validated token context (result of successful authentication).
 * Passed to downstream handlers after token validation.
 */
export interface McpTokenContext {
  /** User ID associated with the token. */
  userId: string
  /** Token ID used for this request. */
  tokenId: string
  /** User-chosen name of the token. */
  tokenName: string
}

/**
 * MCP module configuration.
 * Loaded from environment variables with sensible defaults.
 */
export interface McpConfig {
  /** Whether MCP functionality is enabled. Default: true. */
  enabled: boolean
  /** Maximum file size in bytes for MCP reads. Default: from server config. */
  maxFileSize: number
  /** Maximum requests per minute per token. Default: 60. */
  rateLimit: number
  /** Maximum number of active tokens per user. Fixed: 10. */
  maxTokensPerUser: number
}
