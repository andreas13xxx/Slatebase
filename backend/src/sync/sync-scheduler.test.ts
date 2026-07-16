import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncScheduler } from './sync-scheduler.js'
import { SchedulerAlreadyPausedError } from './errors.js'

describe('SyncScheduler', () => {
  let scheduler: SyncScheduler

  beforeEach(() => {
    vi.useFakeTimers()
    scheduler = new SyncScheduler()
  })

  afterEach(() => {
    scheduler.stopAll()
    vi.useRealTimers()
  })

  describe('start', () => {
    it('creates an interval timer for a vault', () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)

      expect(scheduler.isActive('vault-1')).toBe(true)
    })

    it('calls the callback after the interval elapses', async () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)

      // Advance 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('calls the callback repeatedly at each interval', async () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 10, callback)

      // Advance 30 minutes (3 intervals)
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000)

      expect(callback).toHaveBeenCalledTimes(3)
    })

    it('does not call the callback before the interval elapses', async () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)

      // Advance 4 minutes (less than interval)
      await vi.advanceTimersByTimeAsync(4 * 60 * 1000)

      expect(callback).toHaveBeenCalledTimes(0)
    })

    it('stops existing timer before starting a new one for the same vault', async () => {
      const callback1 = vi.fn().mockResolvedValue(undefined)
      const callback2 = vi.fn().mockResolvedValue(undefined)

      scheduler.start('vault-1', 5, callback1)
      scheduler.start('vault-1', 10, callback2)

      // Advance 10 minutes
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

      // callback1 should never fire (its timer was cleared)
      expect(callback1).toHaveBeenCalledTimes(0)
      // callback2 should fire once at 10 minutes
      expect(callback2).toHaveBeenCalledTimes(1)
    })
  })

  describe('stop', () => {
    it('clears the interval timer for a vault', async () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)
      scheduler.stop('vault-1')

      expect(scheduler.isActive('vault-1')).toBe(false)

      // Advance time — callback should not fire
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(callback).toHaveBeenCalledTimes(0)
    })

    it('does not throw when stopping a non-existent timer', () => {
      expect(() => scheduler.stop('non-existent')).not.toThrow()
    })
  })

  describe('reset', () => {
    it('clears and restarts the timer with the same interval and callback', async () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 10, callback)

      // Advance 7 minutes (not yet fired)
      await vi.advanceTimersByTimeAsync(7 * 60 * 1000)
      expect(callback).toHaveBeenCalledTimes(0)

      // Reset the timer — interval restarts from now
      scheduler.reset('vault-1')

      // Advance 7 more minutes (total 14 from start, but only 7 from reset)
      await vi.advanceTimersByTimeAsync(7 * 60 * 1000)
      expect(callback).toHaveBeenCalledTimes(0)

      // Advance 3 more minutes (10 from reset)
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000)
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('keeps the timer active after reset', () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)
      scheduler.reset('vault-1')

      expect(scheduler.isActive('vault-1')).toBe(true)
    })

    it('is a no-op when no timer exists for the vault', () => {
      expect(() => scheduler.reset('non-existent')).not.toThrow()
      expect(scheduler.isActive('non-existent')).toBe(false)
    })
  })

  describe('isActive', () => {
    it('returns true when a timer is active', () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)

      expect(scheduler.isActive('vault-1')).toBe(true)
    })

    it('returns false when no timer exists', () => {
      expect(scheduler.isActive('vault-1')).toBe(false)
    })

    it('returns false after stop', () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)
      scheduler.stop('vault-1')

      expect(scheduler.isActive('vault-1')).toBe(false)
    })
  })

  describe('stopAll', () => {
    it('stops all active timers', async () => {
      const callback1 = vi.fn().mockResolvedValue(undefined)
      const callback2 = vi.fn().mockResolvedValue(undefined)
      const callback3 = vi.fn().mockResolvedValue(undefined)

      scheduler.start('vault-1', 5, callback1)
      scheduler.start('vault-2', 10, callback2)
      scheduler.start('vault-3', 15, callback3)

      scheduler.stopAll()

      expect(scheduler.isActive('vault-1')).toBe(false)
      expect(scheduler.isActive('vault-2')).toBe(false)
      expect(scheduler.isActive('vault-3')).toBe(false)

      // Advance time — no callbacks should fire
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
      expect(callback1).toHaveBeenCalledTimes(0)
      expect(callback2).toHaveBeenCalledTimes(0)
      expect(callback3).toHaveBeenCalledTimes(0)
    })

    it('does not throw when no timers exist', () => {
      expect(() => scheduler.stopAll()).not.toThrow()
    })
  })

  describe('multiple vaults', () => {
    it('manages timers independently per vault', async () => {
      const callback1 = vi.fn().mockResolvedValue(undefined)
      const callback2 = vi.fn().mockResolvedValue(undefined)

      scheduler.start('vault-1', 5, callback1)
      scheduler.start('vault-2', 10, callback2)

      // Advance 5 minutes — only vault-1 fires
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(0)

      // Advance 5 more minutes — vault-1 fires again, vault-2 fires once
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(callback1).toHaveBeenCalledTimes(2)
      expect(callback2).toHaveBeenCalledTimes(1)
    })

    it('stopping one vault does not affect others', async () => {
      const callback1 = vi.fn().mockResolvedValue(undefined)
      const callback2 = vi.fn().mockResolvedValue(undefined)

      scheduler.start('vault-1', 5, callback1)
      scheduler.start('vault-2', 5, callback2)

      scheduler.stop('vault-1')

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(callback1).toHaveBeenCalledTimes(0)
      expect(callback2).toHaveBeenCalledTimes(1)
    })
  })

  describe('callback error handling', () => {
    it('does not crash when callback rejects', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('sync failed'))
      scheduler.start('vault-1', 5, callback)

      // Should not throw
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

      expect(callback).toHaveBeenCalledTimes(1)
      // Timer should still be active
      expect(scheduler.isActive('vault-1')).toBe(true)
    })
  })

  describe('pause', () => {
    it('marks a vault as paused', () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)
      scheduler.pause('vault-1')

      expect(scheduler.isPaused('vault-1')).toBe(true)
    })

    it('throws SchedulerAlreadyPausedError when pausing an already-paused vault', () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)
      scheduler.pause('vault-1')

      expect(() => scheduler.pause('vault-1')).toThrow(SchedulerAlreadyPausedError)
    })

    it('skips callback execution while paused', async () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)
      scheduler.pause('vault-1')

      // Advance past multiple intervals
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

      expect(callback).toHaveBeenCalledTimes(0)
    })

    it('keeps the timer registered while paused', () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)
      scheduler.pause('vault-1')

      expect(scheduler.isActive('vault-1')).toBe(true)
    })

    it('can pause a vault without a timer (no-timer scenario)', () => {
      // Pausing without a timer is allowed — useful if pause is called before start
      scheduler.pause('vault-no-timer')
      expect(scheduler.isPaused('vault-no-timer')).toBe(true)
    })
  })

  describe('resume', () => {
    it('removes pause state from a vault', () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)
      scheduler.pause('vault-1')
      scheduler.resume('vault-1')

      expect(scheduler.isPaused('vault-1')).toBe(false)
    })

    it('is idempotent — no-op on non-paused vault', () => {
      expect(() => scheduler.resume('vault-1')).not.toThrow()
      expect(scheduler.isPaused('vault-1')).toBe(false)
    })

    it('resumes callback execution after resume', async () => {
      const callback = vi.fn().mockResolvedValue(undefined)
      scheduler.start('vault-1', 5, callback)
      scheduler.pause('vault-1')

      // Advance while paused — no calls
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(callback).toHaveBeenCalledTimes(0)

      // Resume
      scheduler.resume('vault-1')

      // Next interval fires
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('isPaused', () => {
    it('returns false for a vault that has never been paused', () => {
      expect(scheduler.isPaused('vault-1')).toBe(false)
    })

    it('returns true after pause', () => {
      scheduler.pause('vault-1')
      expect(scheduler.isPaused('vault-1')).toBe(true)
    })

    it('returns false after pause + resume', () => {
      scheduler.pause('vault-1')
      scheduler.resume('vault-1')
      expect(scheduler.isPaused('vault-1')).toBe(false)
    })
  })

  describe('pause does not affect other vaults', () => {
    it('pausing one vault does not affect another', async () => {
      const callback1 = vi.fn().mockResolvedValue(undefined)
      const callback2 = vi.fn().mockResolvedValue(undefined)

      scheduler.start('vault-1', 5, callback1)
      scheduler.start('vault-2', 5, callback2)

      scheduler.pause('vault-1')

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

      expect(callback1).toHaveBeenCalledTimes(0)
      expect(callback2).toHaveBeenCalledTimes(1)
    })
  })
})
