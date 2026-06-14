import type { SseEventType, IRateLimiter, RateLimiterEntry } from './types.js'

/** Configuration options for the rate limiter. */
export interface RateLimiterConfig {
  /** Maximum number of events allowed per window per user per type. Default: 10. */
  maxPerSecond?: number
  /** Window size in milliseconds. Default: 1000 (1 second). */
  windowMs?: number
}

/**
 * Per-user per-event-type sliding window rate limiter.
 * Enforces a maximum number of events per type within a configurable time window.
 * When the limit is exceeded, older events are discarded (only the most recent is kept).
 */
export class RateLimiter implements IRateLimiter {
  private readonly maxPerSecond: number
  private readonly windowMs: number
  private readonly store: Map<string, Map<SseEventType, RateLimiterEntry>>

  constructor(config: RateLimiterConfig = {}) {
    this.maxPerSecond = config.maxPerSecond ?? 10
    this.windowMs = config.windowMs ?? 1000
    this.store = new Map()
  }

  /**
   * Check whether an event of the given type should be allowed for a user.
   * Resets the window if the current one has expired.
   */
  shouldAllow(userId: string, eventType: SseEventType): boolean {
    const now = Date.now()
    const userMap = this.store.get(userId)

    if (!userMap) {
      return true
    }

    const entry = userMap.get(eventType)
    if (!entry) {
      return true
    }

    // If the window has expired, reset — event is allowed
    if (now - entry.windowStart > this.windowMs) {
      return true
    }

    return entry.count < this.maxPerSecond
  }

  /**
   * Record an event occurrence for rate tracking.
   * Starts a new window if the previous one has expired.
   */
  recordEvent(userId: string, eventType: SseEventType): void {
    const now = Date.now()
    let userMap = this.store.get(userId)

    if (!userMap) {
      userMap = new Map()
      this.store.set(userId, userMap)
    }

    const entry = userMap.get(eventType)

    if (!entry || now - entry.windowStart > this.windowMs) {
      // Start a new window
      userMap.set(eventType, { count: 1, windowStart: now })
    } else {
      // Increment within current window
      entry.count++
    }
  }

  /**
   * Remove expired entries from the store to prevent memory leaks.
   * Should be called periodically or on each check.
   */
  cleanup(): void {
    const now = Date.now()

    for (const [userId, userMap] of this.store) {
      for (const [eventType, entry] of userMap) {
        if (now - entry.windowStart > this.windowMs) {
          userMap.delete(eventType)
        }
      }

      if (userMap.size === 0) {
        this.store.delete(userId)
      }
    }
  }
}
