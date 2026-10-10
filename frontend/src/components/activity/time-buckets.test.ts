import { describe, it, expect } from 'vitest'
import { groupIntoTimeBuckets } from './time-buckets'
import type { ActivityEvent } from '../../types'

function evt(id: string, timestamp: string): ActivityEvent {
  return { id, type: 'note.created', timestamp, lastModified: timestamp, path: `${id}.md`, user: 'a' }
}

describe('groupIntoTimeBuckets', () => {
  const now = new Date('2026-10-10T12:00:00.000Z')

  it('places events into today / yesterday / this-week / older', () => {
    const events = [
      evt('today', '2026-10-10T09:00:00.000Z'),
      evt('yesterday', '2026-10-09T09:00:00.000Z'),
      evt('thisweek', '2026-10-06T09:00:00.000Z'),
      evt('older', '2026-09-01T09:00:00.000Z'),
    ]
    const buckets = groupIntoTimeBuckets(events, now)
    expect(buckets.map(b => b.key)).toEqual(['today', 'yesterday', 'this-week', 'older'])
    expect(buckets[0]?.events[0]?.id).toBe('today')
    expect(buckets[3]?.events[0]?.id).toBe('older')
  })

  it('omits empty buckets', () => {
    const buckets = groupIntoTimeBuckets([evt('a', '2026-10-10T08:00:00.000Z')], now)
    expect(buckets).toHaveLength(1)
    expect(buckets[0]?.key).toBe('today')
  })

  it('returns no buckets for an empty event list', () => {
    expect(groupIntoTimeBuckets([], now)).toEqual([])
  })

  it('treats an unparseable timestamp as older', () => {
    const buckets = groupIntoTimeBuckets([evt('bad', 'not-a-date')], now)
    expect(buckets).toHaveLength(1)
    expect(buckets[0]?.key).toBe('older')
  })
})
