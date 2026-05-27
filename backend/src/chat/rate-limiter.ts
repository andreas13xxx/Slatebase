/**
 * In-memory rate limiter for chat message sending.
 * Enforces a sliding window limit of MAX_MESSAGES per WINDOW_MS per user.
 * Resets on server restart (no filesystem persistence needed).
 */

import type { IChatRateLimiter } from './types.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Sliding window duration in milliseconds (60 seconds). */
export const WINDOW_MS = 60_000

/** Maximum number of messages allowed within the sliding window. */
export const MAX_MESSAGES = 30

// ─── ChatRateLimiter Class ───────────────────────────────────────────────────

/**
 * In-memory rate limiter that tracks sent message timestamps per user.
 * Uses a sliding window algorithm: only timestamps within the last WINDOW_MS
 * are counted. After MAX_MESSAGES within the window, further messages are blocked
 * until the oldest timestamp expires out of the window.
 */
export class ChatRateLimiter implements IChatRateLimiter {
  private readonly store: Map<string, number[]> = new Map()

  /**
   * Check if a user is allowed to send a message.
   * Filters expired timestamps and returns whether the user is within the limit.
   *
   * @param userId - The user ID to check.
   * @returns An object indicating whether sending is allowed, and optionally how many seconds until retry.
   */
  checkLimit(userId: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now()
    const cutoff = now - WINDOW_MS
    const timestamps = this.store.get(userId)

    if (timestamps === undefined) {
      return { allowed: true }
    }

    // Filter to only timestamps within the sliding window
    const valid = timestamps.filter((ts) => ts > cutoff)

    // Update stored array (cleanup expired timestamps)
    if (valid.length === 0) {
      this.store.delete(userId)
    } else {
      this.store.set(userId, valid)
    }

    if (valid.length >= MAX_MESSAGES) {
      // Calculate retryAfter: time until the oldest valid timestamp expires
      const oldest = valid[0]
      if (oldest === undefined) {
        return { allowed: true }
      }
      const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000)
      return { allowed: false, retryAfter }
    }

    return { allowed: true }
  }

  /**
   * Record a sent message for rate tracking.
   * Pushes the current timestamp to the user's timestamp array.
   *
   * @param userId - The user ID that sent a message.
   */
  recordMessage(userId: string): void {
    const now = Date.now()
    const timestamps = this.store.get(userId)

    if (timestamps === undefined) {
      this.store.set(userId, [now])
    } else {
      timestamps.push(now)
    }
  }

  /**
   * Get the current number of tracked users (for diagnostics).
   */
  get size(): number {
    return this.store.size
  }
}
