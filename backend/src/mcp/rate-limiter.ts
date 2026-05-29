// ─── MCP Rate Limiter ─────────────────────────────────────────────────────────

/**
 * Sliding-window rate limiter for MCP requests, keyed by tokenId.
 * In-memory only (resets on restart, acceptable for rate limiting).
 */
export interface IMcpRateLimiter {
  /** Check if a request is allowed. Returns remaining seconds if blocked. */
  checkLimit(tokenId: string): { allowed: boolean; retryAfter: number }

  /** Record a request for the given tokenId. */
  recordRequest(tokenId: string): void

  /** Remove all entries for a token (on revocation). */
  clear(tokenId: string): void
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Sliding window duration in milliseconds (60 seconds). */
const WINDOW_MS = 60_000

// ─── McpRateLimiter Class ────────────────────────────────────────────────────

/**
 * In-memory rate limiter that tracks request timestamps per token.
 * Uses a sliding window algorithm: only timestamps within the last 60 seconds
 * are counted. After the configured limit is reached within the window,
 * further requests are blocked until the oldest timestamp expires.
 */
export class McpRateLimiter implements IMcpRateLimiter {
  private readonly store: Map<string, number[]> = new Map()
  private readonly maxRequests: number

  /**
   * Create a new McpRateLimiter.
   *
   * @param rateLimit - Maximum number of requests allowed per 60-second window.
   */
  constructor(rateLimit: number) {
    this.maxRequests = rateLimit
  }

  /**
   * Check if a request from the given token is allowed under the rate limit.
   * Filters expired timestamps from the window and returns whether the token
   * is within the configured limit.
   *
   * @param tokenId - The token ID to check.
   * @returns An object with `allowed` (boolean) and `retryAfter` (seconds until the oldest entry expires, 0 if allowed).
   */
  checkLimit(tokenId: string): { allowed: boolean; retryAfter: number } {
    const now = Date.now()
    const cutoff = now - WINDOW_MS
    const timestamps = this.store.get(tokenId)

    if (timestamps === undefined) {
      return { allowed: true, retryAfter: 0 }
    }

    // Filter to only timestamps within the sliding window (cleanup old entries)
    const valid = timestamps.filter((ts) => ts > cutoff)

    // Update stored array (automatic cleanup of expired entries)
    if (valid.length === 0) {
      this.store.delete(tokenId)
      return { allowed: true, retryAfter: 0 }
    }

    this.store.set(tokenId, valid)

    if (valid.length >= this.maxRequests) {
      // Calculate retryAfter: seconds until the oldest valid timestamp expires
      const oldest = valid[0]
      if (oldest === undefined) {
        return { allowed: true, retryAfter: 0 }
      }
      const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000)
      return { allowed: false, retryAfter }
    }

    return { allowed: true, retryAfter: 0 }
  }

  /**
   * Record a request for the given tokenId.
   * Adds the current timestamp to the sliding window.
   *
   * @param tokenId - The token ID that made a request.
   */
  recordRequest(tokenId: string): void {
    const now = Date.now()
    const timestamps = this.store.get(tokenId)

    if (timestamps === undefined) {
      this.store.set(tokenId, [now])
    } else {
      timestamps.push(now)
    }
  }

  /**
   * Remove all entries for a token (used when token is revoked).
   *
   * @param tokenId - The token ID to clear.
   */
  clear(tokenId: string): void {
    this.store.delete(tokenId)
  }

  /**
   * Get the current number of tracked tokens (for diagnostics).
   */
  get size(): number {
    return this.store.size
  }
}
