import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { IAuditService } from '../audit/index.js'
import type { ITokenStore } from './token-store.js'
import type { TokenRecord, ApiTokenInfo, TokenCreateResult, McpTokenContext, McpConfig } from './types.js'
import { McpAuthenticationError, TokenLimitError, TokenValidationError, TokenNotFoundError } from './errors.js'

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Business logic for MCP API token lifecycle.
 * Handles creation, validation, revocation, and listing.
 */
export interface IMcpTokenService {
  /** Create a new API token for a user. Returns the raw token (shown once). */
  createToken(userId: string, name: string, expiryDays: number): Promise<TokenCreateResult>

  /** Validate a raw token string. Returns context if valid, throws if not. */
  validateToken(rawToken: string): Promise<McpTokenContext>

  /** List all tokens for a user (public info only). */
  listTokens(userId: string): Promise<ApiTokenInfo[]>

  /** Revoke a token by ID. Only the owning user can revoke. */
  revokeToken(userId: string, tokenId: string): Promise<void>

  /** Invalidate all tokens for a user (on account deletion/suspension). */
  invalidateAllForUser(userId: string): Promise<void>

  /** Update lastUsedAt timestamp for a token (fire-and-forget). */
  recordUsage(tokenId: string): void
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * McpTokenService implements the business logic for MCP API token lifecycle.
 * It orchestrates token creation, validation, listing, revocation, and usage tracking.
 */
export class McpTokenService implements IMcpTokenService {
  constructor(
    private readonly tokenStore: ITokenStore,
    private readonly mcpConfig: McpConfig,
    private readonly logger: ILogger,
    private readonly auditService?: IAuditService
  ) {}

  /**
   * Create a new API token for a user.
   * Validates the name (1–64 chars, unique per user), checks the active token limit (≤ 10),
   * generates a 128 hex char token, computes its SHA-256 hash, persists via TokenStore,
   * and logs the action to AuditService.
   *
   * @param userId - The ID of the user creating the token.
   * @param name - User-chosen token name (1–64 chars, unique per user).
   * @param expiryDays - Number of days until the token expires (7–365).
   * @returns The raw token value (shown only once), token ID, name, and expiry date.
   * @throws TokenValidationError if name is invalid or duplicate.
   * @throws TokenLimitError if the user already has the maximum number of active tokens.
   */
  async createToken(userId: string, name: string, expiryDays: number): Promise<TokenCreateResult> {
    // Validate name length
    if (name.length === 0) {
      throw new TokenValidationError('NAME_EMPTY', 'Token name must not be empty')
    }
    if (name.length > 64) {
      throw new TokenValidationError('NAME_TOO_LONG', 'Token name must not exceed 64 characters')
    }

    // Check name uniqueness for this user
    const existingTokenIds = await this.tokenStore.getTokenIdsForUser(userId)
    let activeCount = 0

    for (const tokenId of existingTokenIds) {
      const record = await this.tokenStore.findById(tokenId)
      if (record === null) continue

      // Check for duplicate name among non-revoked tokens
      if (record.revokedAt === null && record.name === name) {
        throw new TokenValidationError('NAME_DUPLICATE', `Token name "${name}" already exists for this user`)
      }

      // Count active (non-revoked, non-expired) tokens
      if (record.revokedAt === null && new Date(record.expiresAt).getTime() > Date.now()) {
        activeCount++
      }
    }

    // Check active token limit
    if (activeCount >= this.mcpConfig.maxTokensPerUser) {
      throw new TokenLimitError(this.mcpConfig.maxTokensPerUser)
    }

    // Generate raw token (128 hex chars)
    const rawToken = randomBytes(64).toString('hex')

    // Compute SHA-256 hash
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    // Generate token ID
    const tokenId = randomUUID()

    // Compute expiry
    const now = new Date()
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()

    // Create token record
    const record: TokenRecord = {
      tokenId,
      tokenHash,
      userId,
      name,
      createdAt: now.toISOString(),
      expiresAt,
      revokedAt: null,
      lastUsedAt: null,
    }

    // Persist
    await this.tokenStore.create(record)

    // Audit log
    this.auditService?.log({
      userId,
      action: 'CONFIG_CHANGED',
      target: tokenId,
      ipAddress: '0.0.0.0',
      success: true,
      details: JSON.stringify({ operation: 'mcp_token_created', tokenName: name }),
    })

    this.logger.info('MCP token created', { userId, tokenId, name })

    return {
      token: rawToken,
      tokenId,
      name,
      expiresAt,
    }
  }

  /**
   * Validate a raw token string.
   * Computes the SHA-256 hash, looks up in TokenStore, checks not revoked and not expired.
   *
   * @param rawToken - The raw token string to validate.
   * @returns The McpTokenContext if the token is valid.
   * @throws McpAuthenticationError if the token is invalid, expired, or revoked.
   */
  async validateToken(rawToken: string): Promise<McpTokenContext> {
    // Compute hash of the provided token
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    // Look up in TokenStore
    const record = await this.tokenStore.findByHash(tokenHash)

    if (record === null) {
      throw new McpAuthenticationError('INVALID_TOKEN')
    }

    // Check revocation
    if (record.revokedAt !== null) {
      throw new McpAuthenticationError('TOKEN_REVOKED')
    }

    // Check expiry
    if (new Date(record.expiresAt).getTime() <= Date.now()) {
      throw new McpAuthenticationError('TOKEN_EXPIRED')
    }

    return {
      userId: record.userId,
      tokenId: record.tokenId,
      tokenName: record.name,
    }
  }

  /**
   * List all tokens for a user with public info only.
   * Gets the user's token IDs, loads records, and maps to ApiTokenInfo with masked token and status.
   *
   * @param userId - The ID of the user whose tokens to list.
   * @returns Array of ApiTokenInfo objects.
   */
  async listTokens(userId: string): Promise<ApiTokenInfo[]> {
    const tokenIds = await this.tokenStore.getTokenIdsForUser(userId)
    const tokens: ApiTokenInfo[] = []

    for (const tokenId of tokenIds) {
      const record = await this.tokenStore.findById(tokenId)
      if (record === null) continue

      tokens.push({
        tokenId: record.tokenId,
        name: record.name,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        lastUsedAt: record.lastUsedAt,
        status: this.computeStatus(record),
        maskedToken: this.maskToken(record.tokenHash),
      })
    }

    return tokens
  }

  /**
   * Revoke a token by ID. Verifies ownership, marks as revoked, removes from index,
   * and logs to AuditService.
   *
   * @param userId - The ID of the user requesting revocation.
   * @param tokenId - The ID of the token to revoke.
   * @throws TokenNotFoundError if the token does not exist or does not belong to the user.
   */
  async revokeToken(userId: string, tokenId: string): Promise<void> {
    const record = await this.tokenStore.findById(tokenId)

    if (record === null) {
      throw new TokenNotFoundError(tokenId)
    }

    // Verify ownership
    if (record.userId !== userId) {
      throw new TokenNotFoundError(tokenId)
    }

    // Already revoked — still throw not found to avoid leaking state
    if (record.revokedAt !== null) {
      throw new TokenNotFoundError(tokenId)
    }

    // Mark as revoked
    const updatedRecord: TokenRecord = {
      ...record,
      revokedAt: new Date().toISOString(),
    }

    await this.tokenStore.update(updatedRecord)

    // Remove from in-memory index
    this.tokenStore.removeFromIndex(record.tokenHash)

    // Audit log
    this.auditService?.log({
      userId,
      action: 'CONFIG_CHANGED',
      target: tokenId,
      ipAddress: '0.0.0.0',
      success: true,
      details: JSON.stringify({ operation: 'mcp_token_revoked', tokenName: record.name }),
    })

    this.logger.info('MCP token revoked', { userId, tokenId, name: record.name })
  }

  /**
   * Invalidate all tokens for a user (on account deletion/suspension).
   * Delegates to TokenStore.invalidateAllForUser().
   *
   * @param userId - The ID of the user whose tokens to invalidate.
   */
  async invalidateAllForUser(userId: string): Promise<void> {
    await this.tokenStore.invalidateAllForUser(userId)
    this.logger.info('All MCP tokens invalidated for user', { userId })
  }

  /**
   * Update lastUsedAt timestamp for a token (fire-and-forget).
   * Does not await the result — errors are logged but not propagated.
   *
   * @param tokenId - The ID of the token to update.
   */
  recordUsage(tokenId: string): void {
    void this.updateLastUsedAt(tokenId)
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Asynchronously updates the lastUsedAt field for a token.
   * Errors are caught and logged to prevent unhandled rejections.
   */
  private async updateLastUsedAt(tokenId: string): Promise<void> {
    try {
      const record = await this.tokenStore.findById(tokenId)
      if (record === null) return

      const updatedRecord: TokenRecord = {
        ...record,
        lastUsedAt: new Date().toISOString(),
      }
      await this.tokenStore.update(updatedRecord)
    } catch (err) {
      this.logger.warn('Failed to update token lastUsedAt', { tokenId, error: String(err) })
    }
  }

  /**
   * Compute the status of a token based on its revocation and expiry state.
   */
  private computeStatus(record: TokenRecord): 'active' | 'expired' | 'revoked' {
    if (record.revokedAt !== null) {
      return 'revoked'
    }
    if (new Date(record.expiresAt).getTime() <= Date.now()) {
      return 'expired'
    }
    return 'active'
  }

  /**
   * Mask a token hash for display purposes.
   * Shows last 4 characters, masks the rest with asterisks.
   * Format: "****...ab3f"
   */
  private maskToken(tokenHash: string): string {
    if (tokenHash.length <= 4) {
      return tokenHash
    }
    const lastFour = tokenHash.slice(-4)
    return `****...${lastFour}`
  }
}
