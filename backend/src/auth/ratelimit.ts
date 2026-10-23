/**
 * In-memory rate limiter for login attempts.
 * Tracks failed login attempts per composite key (username:ip) and blocks after threshold.
 * Using a composite key prevents account lockout attacks where an attacker blocks
 * another user's account by sending failed logins — the legitimate user from a
 * different IP can still log in.
 * Resets on server restart (no filesystem persistence needed).
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of failed attempts before blocking. */
export const MAX_ATTEMPTS = 5

/** Time window in milliseconds for counting attempts (15 minutes). */
export const WINDOW_MS = 15 * 60 * 1000

/** Duration in milliseconds to block a username after exceeding max attempts (15 minutes). */
export const BLOCK_DURATION_MS = 15 * 60 * 1000

/**
 * Upper bound for an escalated block (24 hours). Each repeated block doubles the
 * previous duration (15m → 30m → 1h → …) up to this cap, so an attacker cannot
 * simply wait out a fixed 15-minute block and get a fresh batch of free attempts
 * indefinitely.
 */
export const MAX_BLOCK_DURATION_MS = 24 * 60 * 60 * 1000

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Tracks the rate-limit state for a single key (username:ip combination).
 */
export interface RateLimitEntry {
  /** Number of failed attempts recorded in the current window. */
  attempts: number
  /** Unix timestamp (ms) of the first failed attempt in the current window. */
  firstAttemptAt: number
  /** Unix timestamp (ms) until which the username is blocked, or null if not blocked. */
  blockedUntil: number | null
  /**
   * How many times this key has been blocked. Drives exponential backoff: the
   * next block lasts BLOCK_DURATION_MS * 2^(blockCount-1), capped at
   * MAX_BLOCK_DURATION_MS. Survives a block's expiry so repeated offenders face
   * progressively longer blocks instead of resetting to a fresh 5 attempts.
   */
  blockCount: number
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
 * In-memory rate limiter that tracks failed login attempts per key.
 * The key is typically a composite of username and IP address (e.g. "user:192.168.1.1").
 * After MAX_ATTEMPTS failures within WINDOW_MS, the key is blocked for BLOCK_DURATION_MS.
 * Expired entries are automatically cleaned up on access.
 */
export class RateLimiter {
  private readonly store: Map<string, RateLimitEntry> = new Map()

  /**
   * Check whether a login attempt is allowed for the given key.
   * Performs auto-cleanup of expired entries.
   *
   * @param key - The rate-limit key (typically "username:ip").
   * @returns An object indicating whether the attempt is allowed, and optionally how many seconds until retry.
   */
  checkRateLimit(key: string): RateLimitResult {
    const now = Date.now()
    const entry = this.store.get(key)

    if (entry === undefined) {
      return { allowed: true }
    }

    // Window expired and not currently blocked → reset only if this key has
    // never been blocked. A previously-blocked key keeps its entry (and its
    // blockCount) so the next offence escalates; it is finally cleared once it
    // has sat idle for longer than the maximum block (nothing new recorded).
    if (now - entry.firstAttemptAt > WINDOW_MS && entry.blockedUntil === null) {
      if (entry.blockCount === 0 || now - entry.firstAttemptAt > MAX_BLOCK_DURATION_MS) {
        this.store.delete(key)
        return { allowed: true }
      }
      // Keep the entry (retain blockCount) but allow a fresh window of attempts.
      entry.attempts = 0
      entry.firstAttemptAt = now
      return { allowed: true }
    }

    // Currently blocked and block has not expired
    if (entry.blockedUntil !== null && now < entry.blockedUntil) {
      return {
        allowed: false,
        retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
      }
    }

    // Block has expired → clear the block but KEEP the entry so blockCount
    // survives; a renewed burst then escalates the next block instead of
    // getting a fresh unpenalised batch of attempts.
    if (entry.blockedUntil !== null && now >= entry.blockedUntil) {
      entry.blockedUntil = null
      entry.attempts = 0
      entry.firstAttemptAt = now
      return { allowed: true }
    }

    return { allowed: true }
  }

  /**
   * Record a failed login attempt for the given key.
   * If the attempt count reaches MAX_ATTEMPTS, the key is blocked for BLOCK_DURATION_MS.
   *
   * @param key - The rate-limit key (typically "username:ip").
   */
  recordFailedAttempt(key: string): void {
    const now = Date.now()
    const entry = this.store.get(key)

    if (entry === undefined) {
      this.store.set(key, {
        attempts: 1,
        firstAttemptAt: now,
        blockedUntil: null,
        blockCount: 0,
      })
      return
    }

    entry.attempts++

    if (entry.attempts >= MAX_ATTEMPTS) {
      // Exponential backoff: each successive block doubles the previous one,
      // capped at MAX_BLOCK_DURATION_MS. blockCount persists across block
      // expiries (see checkRateLimit), so a repeat offender is blocked longer.
      const duration = Math.min(BLOCK_DURATION_MS * 2 ** entry.blockCount, MAX_BLOCK_DURATION_MS)
      entry.blockedUntil = now + duration
      entry.blockCount++
    }
  }

  /**
   * Reset the rate-limit state for a specific key.
   * Useful after a successful login to clear any accumulated failed attempts.
   *
   * @param key - The rate-limit key to reset.
   */
  reset(key: string): void {
    this.store.delete(key)
  }

  /**
   * Get the current number of tracked keys (for diagnostics).
   */
  get size(): number {
    return this.store.size
  }
}
