// SlidingWindowRateLimiter — generic in-memory sliding-window request limiter, keyed by string.
// Same algorithm as McpRateLimiter/ChatRateLimiter, generalized for reuse at
// new call sites (e.g. password change, MCP token creation) instead of
// duplicating the sliding-window bookkeeping again.

/** Result of a rate-limit check. */
export interface RateLimitCheckResult {
  /** Whether the request is allowed. */
  allowed: boolean
  /** Seconds until the oldest request in the window expires (0 if allowed). */
  retryAfter: number
}

/** Default interval between automatic cleanup sweeps (5 minutes). */
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60_000

/**
 * In-memory rate limiter that tracks request timestamps per key.
 * Uses a sliding window algorithm: only timestamps within the last `windowMs`
 * are counted. After `maxRequests` within the window, further requests are
 * blocked until the oldest timestamp expires out of the window.
 *
 * checkLimit() only prunes a key's own expired timestamps when that key is
 * checked again — a key used for a while and then left idle would otherwise
 * keep an entry in the store forever. A periodic sweep (unref'd, doesn't keep
 * the process alive) removes fully-expired entries. Call destroy() during
 * shutdown to stop it.
 */
export class SlidingWindowRateLimiter {
  private readonly store: Map<string, number[]> = new Map()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  /**
   * @param maxRequests - Maximum number of requests allowed per window per key.
   * @param windowMs - Sliding window duration in milliseconds.
   * @param cleanupIntervalMs - Interval between automatic cleanup sweeps. Default: 5 minutes.
   */
  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    cleanupIntervalMs: number = DEFAULT_CLEANUP_INTERVAL_MS,
  ) {
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs)
    this.cleanupTimer.unref?.()
  }

  /**
   * Check if a request for the given key is allowed under the rate limit.
   * Filters expired timestamps from the window as a side effect.
   */
  checkLimit(key: string): RateLimitCheckResult {
    const now = Date.now()
    const cutoff = now - this.windowMs
    const timestamps = this.store.get(key)

    if (timestamps === undefined) {
      return { allowed: true, retryAfter: 0 }
    }

    const valid = timestamps.filter((ts) => ts > cutoff)

    if (valid.length === 0) {
      this.store.delete(key)
      return { allowed: true, retryAfter: 0 }
    }

    this.store.set(key, valid)

    if (valid.length >= this.maxRequests) {
      const oldest = valid[0]
      const retryAfter = oldest === undefined ? 0 : Math.ceil((oldest + this.windowMs - now) / 1000)
      return { allowed: false, retryAfter }
    }

    return { allowed: true, retryAfter: 0 }
  }

  /** Record a request for the given key. */
  recordRequest(key: string): void {
    const now = Date.now()
    const timestamps = this.store.get(key)

    if (timestamps === undefined) {
      this.store.set(key, [now])
    } else {
      timestamps.push(now)
    }
  }

  /** Remove all tracked requests for a key. */
  clear(key: string): void {
    this.store.delete(key)
  }

  /** Get the current number of tracked keys (for diagnostics). */
  get size(): number {
    return this.store.size
  }

  /**
   * Removes entries whose timestamps have all fallen out of the sliding
   * window. Runs automatically on an interval; exposed for testing.
   */
  cleanup(): void {
    const now = Date.now()
    const cutoff = now - this.windowMs

    for (const [key, timestamps] of this.store) {
      const valid = timestamps.filter((ts) => ts > cutoff)
      if (valid.length === 0) {
        this.store.delete(key)
      } else if (valid.length !== timestamps.length) {
        this.store.set(key, valid)
      }
    }
  }

  /** Stops the automatic cleanup sweep. Call during graceful shutdown. */
  destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }
}
