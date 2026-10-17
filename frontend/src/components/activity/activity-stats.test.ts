import { describe, it, expect } from 'vitest'
import { countByType, buildHeatmap } from './activity-stats'
import type { ActivityEvent } from '../../types'

function evt(type: ActivityEvent['type'], timestamp: string): ActivityEvent {
  return { id: Math.random().toString(16).slice(2), type, timestamp, lastModified: timestamp, path: 'x.md', user: 'u' }
}

describe('countByType', () => {
  it('counts events per type, omitting absent types', () => {
    const counts = countByType([
      evt('note.created', '2026-01-01T00:00:00Z'),
      evt('note.created', '2026-01-01T01:00:00Z'),
      evt('note.edited', '2026-01-01T02:00:00Z'),
    ])
    expect(counts.get('note.created')).toBe(2)
    expect(counts.get('note.edited')).toBe(1)
    expect(counts.has('note.deleted')).toBe(false)
  })

  it('returns an empty map for no events', () => {
    expect(countByType([]).size).toBe(0)
  })
})

describe('buildHeatmap', () => {
  const now = new Date('2026-03-18T12:00:00') // a Wednesday (local)

  it('produces weeks × 7 cells', () => {
    const hm = buildHeatmap([], 10, now)
    expect(hm.weeks).toHaveLength(10)
    for (const week of hm.weeks) expect(week).toHaveLength(7)
    expect(hm.max).toBe(0)
  })

  it('counts an event onto its local calendar day and tracks the max', () => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0)
    const events = [
      evt('note.created', today.toISOString()),
      evt('note.edited', today.toISOString()),
    ]
    const hm = buildHeatmap(events, 10, now)
    const flat = hm.weeks.flat()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const cell = flat.find(c => c.date === todayKey)
    expect(cell?.count).toBe(2)
    expect(hm.max).toBe(2)
  })

  it('ignores events outside the window', () => {
    const old = new Date(now.getFullYear() - 1, 0, 1).toISOString()
    const hm = buildHeatmap([evt('note.created', old)], 10, now)
    expect(hm.max).toBe(0)
  })

  it('clamps weeks to at least 1', () => {
    const hm = buildHeatmap([], 0, now)
    expect(hm.weeks).toHaveLength(1)
  })
})
