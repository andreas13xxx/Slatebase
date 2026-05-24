/**
 * In-memory rate limiter for login attempts.
 * Tracks failed login attempts per username and blocks after threshold.
 * Resets on server restart (no filesystem persistence needed).
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of failed attempts before blocking. */
export const MAX_ATTEMPTS = 5

/** Time window in milliseconds for counting attempts (15 minutes). */
export const WINDOW_MS = 15 * 60 * 1000

/** Duration in milliseconds to block a username after exceeding max attempts (15 minutes). */
export const BLOCK_DURATION_MS = 15 * 60 * 1000

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Tracks the rate-limit state for a single username.
 */
export interface RateLimitEntry {
  /** Number of failed attempts recorded in the current window. */
  attempts: number
  /** Unix timestamp (ms) of the first failed attempt in the current window. */
  firstAttemptAt: number
  /** Unix timestamp (ms) until which the username is blocked, or null if not blocked. */
  blockedUntil: number | null
}

/**
 * Result of a rate-limit check.
 */
export interface RateLimitResult {
  /** Whether the login attempt is allowed. */
  allowed: boolean
  /** Seconds until the block expires (only present when blocked). */
  retryAfter?: number
}

// ─── RateLimiter Class ───────────────────────────────────────────────────────

/**
 * In-memory rate limiter that tracks failed login attempts per username.
 * After MAX_ATTEMPTS failures within WINDOW_MS, the username is blocked for BLOCK_DURATION_MS.
 * Expired entries are automatically cleaned up on access.
 */
export class RateLimiter {
  private readonly store: Map<string, RateLimitEntry> = new Map()

  /**
   * Check whether a login attempt is allowed for the given username.
   * Performs auto-cleanup of expired entries.
   *
   * @param username - The username to check.
   * @returns An object indicating whether the attempt is allowed, and optionally how many seconds until retry.
   */
  checkRateLimit(username: string): RateLimitResult {
    const now = Date.now()
    const entry = this.store.get(username)

    if (entry === undefined) {
      return { allowed: true }
    }

    // Window expired and not currently blocked → reset
    if (now - entry.firstAttemptAt > WINDOW_MS && entry.blockedUntil === null) {
      this.store.delete(username)
      return { allowed: true }
    }

    // Currently blocked and block has not expired
    if (entry.blockedUntil !== null && now < entry.blockedUntil) {
      return {
        allowed: false,
        retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
      }
    }

    // Block has expired → reset
    if (entry.blockedUntil !== null && now >= entry.blockedUntil) {
      this.store.delete(username)
      return { allowed: true }
    }

    return { allowed: true }
  }

  /**
   * Record a failed login attempt for the given username.
   * If the attempt count reaches MAX_ATTEMPTS, the username is blocked for BLOCK_DURATION_MS.
   *
   * @param username - The username that failed to authenticate.
   */
  recordFailedAttempt(username: string): void {
    const now = Date.now()
    const entry = this.store.get(username)

    if (entry === undefined) {
      this.store.set(username, {
        attempts: 1,
        firstAttemptAt: now,
        blockedUntil: null,
      })
      return
    }

    entry.attempts++

    if (entry.attempts >= MAX_ATTEMPTS) {
      entry.blockedUntil = now + BLOCK_DURATION_MS
    }
  }

  /**
   * Reset the rate-limit state for a specific username.
   * Useful after a successful login to clear any accumulated failed attempts.
   *
   * @param username - The username to reset.
   */
  reset(username: string): void {
    this.store.delete(username)
  }

  /**
   * Get the current number of tracked usernames (for diagnostics).
   */
  get size(): number {
    return this.store.size
  }
}
