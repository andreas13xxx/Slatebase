import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChatRateLimiter, WINDOW_MS, MAX_MESSAGES } from './rate-limiter.js'

describe('ChatRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('checkLimit / recordMessage', () => {
    it('allows messages under the limit', () => {
      const limiter = new ChatRateLimiter()
      try {
        for (let i = 0; i < MAX_MESSAGES - 1; i++) {
          limiter.recordMessage('user-1')
        }
        expect(limiter.checkLimit('user-1').allowed).toBe(true)
      } finally {
        limiter.destroy()
      }
    })

    it('blocks once MAX_MESSAGES is reached within the window', () => {
      const limiter = new ChatRateLimiter()
      try {
        for (let i = 0; i < MAX_MESSAGES; i++) {
          limiter.recordMessage('user-1')
        }
        const result = limiter.checkLimit('user-1')
        expect(result.allowed).toBe(false)
        expect(result.retryAfter).toBeGreaterThan(0)
      } finally {
        limiter.destroy()
      }
    })

    it('allows again after the window expires', () => {
      vi.useFakeTimers()
      const limiter = new ChatRateLimiter()
      try {
        for (let i = 0; i < MAX_MESSAGES; i++) {
          limiter.recordMessage('user-1')
        }
        expect(limiter.checkLimit('user-1').allowed).toBe(false)

        vi.advanceTimersByTime(WINDOW_MS + 1000)
        expect(limiter.checkLimit('user-1').allowed).toBe(true)
      } finally {
        limiter.destroy()
      }
    })
  })

  describe('cleanup()', () => {
    it('removes a user entirely once all their timestamps have expired', () => {
      vi.useFakeTimers()
      const limiter = new ChatRateLimiter()
      try {
        limiter.recordMessage('user-1')
        expect(limiter.size).toBe(1)

        vi.advanceTimersByTime(WINDOW_MS + 1000)
        limiter.cleanup()

        expect(limiter.size).toBe(0)
      } finally {
        limiter.destroy()
      }
    })
  })

  describe('automatic sweep', () => {
    it('runs cleanup() automatically on the configured interval', () => {
      // Regression test: a user who sends messages and then never sends
      // another would otherwise keep an entry in the store for the lifetime
      // of the process — checkLimit() only prunes a user's own timestamps
      // when that same user is checked again.
      vi.useFakeTimers()
      const limiter = new ChatRateLimiter(5000)
      try {
        const cleanupSpy = vi.spyOn(limiter, 'cleanup')
        vi.advanceTimersByTime(15_000)
        expect(cleanupSpy.mock.calls.length).toBeGreaterThanOrEqual(3)
      } finally {
        limiter.destroy()
      }
    })

    it('destroy() stops the automatic sweep', () => {
      vi.useFakeTimers()
      const limiter = new ChatRateLimiter(1000)
      const cleanupSpy = vi.spyOn(limiter, 'cleanup')

      limiter.destroy()
      vi.advanceTimersByTime(10_000)

      expect(cleanupSpy).not.toHaveBeenCalled()
    })
  })
})
