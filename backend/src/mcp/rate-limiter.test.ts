import { describe, it, expect, vi, afterEach } from 'vitest'
import { McpRateLimiter } from './rate-limiter.js'

const WINDOW_MS = 60_000

describe('McpRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('checkLimit / recordRequest', () => {
    it('allows requests under the limit', () => {
      const limiter = new McpRateLimiter(3)
      try {
        limiter.recordRequest('token-1')
        limiter.recordRequest('token-1')
        expect(limiter.checkLimit('token-1').allowed).toBe(true)
      } finally {
        limiter.destroy()
      }
    })

    it('blocks once the configured limit is reached within the window', () => {
      const limiter = new McpRateLimiter(2)
      try {
        limiter.recordRequest('token-1')
        limiter.recordRequest('token-1')
        const result = limiter.checkLimit('token-1')
        expect(result.allowed).toBe(false)
        expect(result.retryAfter).toBeGreaterThan(0)
      } finally {
        limiter.destroy()
      }
    })
  })

  describe('clear()', () => {
    it('removes all entries for a token', () => {
      const limiter = new McpRateLimiter(1)
      try {
        limiter.recordRequest('token-1')
        expect(limiter.size).toBe(1)

        limiter.clear('token-1')

        expect(limiter.size).toBe(0)
        expect(limiter.checkLimit('token-1').allowed).toBe(true)
      } finally {
        limiter.destroy()
      }
    })
  })

  describe('cleanup()', () => {
    it('removes a token entirely once all its timestamps have expired', () => {
      vi.useFakeTimers()
      const limiter = new McpRateLimiter(5)
      try {
        limiter.recordRequest('token-1')
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
      // Regression test: a token that's left idle without being explicitly
      // revoked (which would call clear()) would otherwise keep an entry in
      // the store for the lifetime of the process.
      vi.useFakeTimers()
      const limiter = new McpRateLimiter(5, 5000)
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
      const limiter = new McpRateLimiter(5, 1000)
      const cleanupSpy = vi.spyOn(limiter, 'cleanup')

      limiter.destroy()
      vi.advanceTimersByTime(10_000)

      expect(cleanupSpy).not.toHaveBeenCalled()
    })
  })
})
