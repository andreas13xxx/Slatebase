import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventReplayBuffer } from './event-replay-buffer.js'
import type { SseEvent } from './types.js'

function makeEvent(id: string): SseEvent {
  return { type: 'chat:message', id, data: {}, timestamp: new Date().toISOString() }
}

describe('EventReplayBuffer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('push / getEventsSince', () => {
    it('returns events after the given lastEventId', () => {
      const buffer = new EventReplayBuffer()
      try {
        buffer.push('user-1', makeEvent(buffer.nextEventId()))
        buffer.push('user-1', makeEvent(buffer.nextEventId()))
        const third = buffer.nextEventId()
        buffer.push('user-1', makeEvent(third))

        const events = buffer.getEventsSince('user-1', '1')
        expect(events.map((e) => e.id)).toEqual(['2', third])
      } finally {
        buffer.destroy()
      }
    })

    it('returns all buffered events for an unknown lastEventId', () => {
      const buffer = new EventReplayBuffer()
      try {
        buffer.push('user-1', makeEvent(buffer.nextEventId()))
        const events = buffer.getEventsSince('user-1', 'not-a-known-id')
        expect(events).toHaveLength(1)
      } finally {
        buffer.destroy()
      }
    })
  })

  describe('sweepExpired()', () => {
    it('deletes a user entirely once all of their events have expired', () => {
      vi.useFakeTimers()
      const buffer = new EventReplayBuffer({ ttlMs: 1000 })
      try {
        buffer.push('user-1', makeEvent(buffer.nextEventId()))
        expect(buffer.getBufferSize('user-1')).toBe(1)

        vi.advanceTimersByTime(2000)
        buffer.sweepExpired()

        expect(buffer.getBufferSize('user-1')).toBe(0)
      } finally {
        buffer.destroy()
      }
    })

    it('leaves non-expired entries untouched', () => {
      vi.useFakeTimers()
      const buffer = new EventReplayBuffer({ ttlMs: 10_000 })
      try {
        buffer.push('user-1', makeEvent(buffer.nextEventId()))
        vi.advanceTimersByTime(1000)
        buffer.sweepExpired()

        expect(buffer.getBufferSize('user-1')).toBe(1)
      } finally {
        buffer.destroy()
      }
    })
  })

  describe('automatic sweep', () => {
    it('runs sweepExpired() automatically on the configured interval', () => {
      // Regression test: a user who never reconnects after their last event
      // would otherwise keep an entry in the buffer Map for the lifetime of
      // the process. The sweep must run without an external caller.
      vi.useFakeTimers()
      const buffer = new EventReplayBuffer({ sweepIntervalMs: 5000 })
      try {
        const sweepSpy = vi.spyOn(buffer, 'sweepExpired')
        vi.advanceTimersByTime(15_000)
        expect(sweepSpy.mock.calls.length).toBeGreaterThanOrEqual(3)
      } finally {
        buffer.destroy()
      }
    })

    it('destroy() stops the automatic sweep', () => {
      vi.useFakeTimers()
      const buffer = new EventReplayBuffer({ sweepIntervalMs: 1000 })
      const sweepSpy = vi.spyOn(buffer, 'sweepExpired')

      buffer.destroy()
      vi.advanceTimersByTime(10_000)

      expect(sweepSpy).not.toHaveBeenCalled()
    })
  })
})
