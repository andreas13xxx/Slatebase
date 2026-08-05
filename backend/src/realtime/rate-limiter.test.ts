import { describe, it, expect, vi, afterEach } from 'vitest'
import { RateLimiter } from './rate-limiter.js'

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('shouldAllow / recordEvent', () => {
    it('allows events under the limit', () => {
      const limiter = new RateLimiter({ maxPerSecond: 3, windowMs: 1000 })
      try {
        limiter.recordEvent('user-1', 'chat:message')
        limiter.recordEvent('user-1', 'chat:message')
        expect(limiter.shouldAllow('user-1', 'chat:message')).toBe(true)
      } finally {
        limiter.destroy()
      }
    })

    it('blocks events once the limit is reached within the window', () => {
      const limiter = new RateLimiter({ maxPerSecond: 2, windowMs: 1000 })
      try {
        limiter.recordEvent('user-1', 'chat:message')
        limiter.recordEvent('user-1', 'chat:message')
        expect(limiter.shouldAllow('user-1', 'chat:message')).toBe(false)
      } finally {
        limiter.destroy()
      }
    })

    it('tracks different event types independently', () => {
      const limiter = new RateLimiter({ maxPerSecond: 1, windowMs: 1000 })
      try {
        limiter.recordEvent('user-1', 'chat:message')
        expect(limiter.shouldAllow('user-1', 'chat:message')).toBe(false)
        expect(limiter.shouldAllow('user-1', 'presence:update')).toBe(true)
      } finally {
        limiter.destroy()
      }
    })
  })

  describe('cleanup()', () => {
    it('removes expired entries and empty user maps', () => {
      vi.useFakeTimers()
      const limiter = new RateLimiter({ maxPerSecond: 5, windowMs: 1000 })
      try {
        limiter.recordEvent('user-1', 'chat:message')
        vi.advanceTimersByTime(2000) // past the window

        limiter.cleanup()

        // Internal store is private; verify indirectly via behavior: a fresh
        // event should be allowed and treated as starting a brand-new window
        // (no leftover state affecting the count).
        expect(limiter.shouldAllow('user-1', 'chat:message')).toBe(true)
      } finally {
        limiter.destroy()
      }
    })
  })

  describe('automatic sweep', () => {
    it('runs cleanup() automatically on the configured interval', () => {
      // Regression test: cleanup() must not require an external caller to
      // remember to invoke it — otherwise expired entries accumulate in
      // memory for the lifetime of the process.
      vi.useFakeTimers()
      const limiter = new RateLimiter({ maxPerSecond: 5, windowMs: 1000, cleanupIntervalMs: 5000 })
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
      const limiter = new RateLimiter({ cleanupIntervalMs: 1000 })
      const cleanupSpy = vi.spyOn(limiter, 'cleanup')

      limiter.destroy()
      vi.advanceTimersByTime(10_000)

      expect(cleanupSpy).not.toHaveBeenCalled()
    })
  })
})
