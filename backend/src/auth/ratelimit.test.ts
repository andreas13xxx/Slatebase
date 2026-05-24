import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  RateLimiter,
  MAX_ATTEMPTS,
  WINDOW_MS,
  BLOCK_DURATION_MS,
} from './ratelimit.js'

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('checkRateLimit', () => {
    it('allows attempts for unknown usernames', () => {
      const result = limiter.checkRateLimit('unknown-user')
      expect(result).toEqual({ allowed: true })
    })

    it('allows attempts when fewer than MAX_ATTEMPTS failures recorded', () => {
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        limiter.recordFailedAttempt('user1')
      }
      const result = limiter.checkRateLimit('user1')
      expect(result.allowed).toBe(true)
    })

    it('blocks after exactly MAX_ATTEMPTS failures', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        limiter.recordFailedAttempt('user1')
      }
      const result = limiter.checkRateLimit('user1')
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeDefined()
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('returns retryAfter in seconds', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        limiter.recordFailedAttempt('user1')
      }
      const result = limiter.checkRateLimit('user1')
      expect(result.allowed).toBe(false)
      // Should be approximately BLOCK_DURATION_MS / 1000 seconds
      expect(result.retryAfter).toBeLessThanOrEqual(BLOCK_DURATION_MS / 1000)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('resets after block duration expires', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        limiter.recordFailedAttempt('user1')
      }

      // Advance time past the block duration
      vi.advanceTimersByTime(BLOCK_DURATION_MS + 1)

      const result = limiter.checkRateLimit('user1')
      expect(result.allowed).toBe(true)
    })

    it('resets when window expires and not blocked', () => {
      // Record fewer than MAX_ATTEMPTS
      limiter.recordFailedAttempt('user1')
      limiter.recordFailedAttempt('user1')

      // Advance time past the window
      vi.advanceTimersByTime(WINDOW_MS + 1)

      const result = limiter.checkRateLimit('user1')
      expect(result.allowed).toBe(true)
    })

    it('does not affect other usernames', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        limiter.recordFailedAttempt('user1')
      }

      const result = limiter.checkRateLimit('user2')
      expect(result.allowed).toBe(true)
    })

    it('retryAfter decreases as time passes', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        limiter.recordFailedAttempt('user1')
      }

      const result1 = limiter.checkRateLimit('user1')

      // Advance 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000)

      const result2 = limiter.checkRateLimit('user1')
      expect(result2.allowed).toBe(false)
      expect(result2.retryAfter).toBeDefined()
      expect(result2.retryAfter!).toBeLessThan(result1.retryAfter!)
    })
  })

  describe('recordFailedAttempt', () => {
    it('creates a new entry for first failure', () => {
      limiter.recordFailedAttempt('user1')
      expect(limiter.size).toBe(1)
    })

    it('increments attempts on subsequent failures', () => {
      limiter.recordFailedAttempt('user1')
      limiter.recordFailedAttempt('user1')
      limiter.recordFailedAttempt('user1')

      // Still allowed (3 < 5)
      const result = limiter.checkRateLimit('user1')
      expect(result.allowed).toBe(true)
    })

    it('blocks on the 5th failure', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordFailedAttempt('user1')
      }

      const result = limiter.checkRateLimit('user1')
      expect(result.allowed).toBe(false)
    })

    it('tracks multiple usernames independently', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        limiter.recordFailedAttempt('user1')
      }
      limiter.recordFailedAttempt('user2')

      expect(limiter.checkRateLimit('user1').allowed).toBe(false)
      expect(limiter.checkRateLimit('user2').allowed).toBe(true)
    })
  })

  describe('reset', () => {
    it('clears rate-limit state for a username', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        limiter.recordFailedAttempt('user1')
      }
      expect(limiter.checkRateLimit('user1').allowed).toBe(false)

      limiter.reset('user1')
      expect(limiter.checkRateLimit('user1').allowed).toBe(true)
    })

    it('does not affect other usernames', () => {
      limiter.recordFailedAttempt('user1')
      limiter.recordFailedAttempt('user2')

      limiter.reset('user1')
      expect(limiter.size).toBe(1)
    })

    it('is a no-op for unknown usernames', () => {
      limiter.reset('nonexistent')
      expect(limiter.size).toBe(0)
    })
  })

  describe('auto-cleanup on access', () => {
    it('removes expired window entries when checked', () => {
      limiter.recordFailedAttempt('user1')
      expect(limiter.size).toBe(1)

      vi.advanceTimersByTime(WINDOW_MS + 1)

      limiter.checkRateLimit('user1')
      expect(limiter.size).toBe(0)
    })

    it('removes expired block entries when checked', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        limiter.recordFailedAttempt('user1')
      }
      expect(limiter.size).toBe(1)

      vi.advanceTimersByTime(BLOCK_DURATION_MS + 1)

      limiter.checkRateLimit('user1')
      expect(limiter.size).toBe(0)
    })
  })

  describe('size', () => {
    it('returns 0 for empty limiter', () => {
      expect(limiter.size).toBe(0)
    })

    it('reflects number of tracked usernames', () => {
      limiter.recordFailedAttempt('user1')
      limiter.recordFailedAttempt('user2')
      limiter.recordFailedAttempt('user3')
      expect(limiter.size).toBe(3)
    })
  })
})
