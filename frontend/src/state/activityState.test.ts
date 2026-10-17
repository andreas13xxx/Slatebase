import { describe, it, expect } from 'vitest'
import { activityReducer, createInitialActivityState } from './activityState'
import type { ActivityEvent } from '../types'

function evt(id: string, timestamp: string): ActivityEvent {
  return { id, type: 'note.created', timestamp, lastModified: timestamp, path: `${id}.md`, user: 'a' }
}

describe('activityReducer', () => {
  it('LOAD_SUCCESS replaces events and clears loading/error', () => {
    const s0 = { ...createInitialActivityState(), loading: true, error: 'old' }
    const s1 = activityReducer(s0, { type: 'LOAD_SUCCESS', events: [evt('a', '2026-10-10T00:00:00Z')], nextCursor: 'c' })
    expect(s1.events).toHaveLength(1)
    expect(s1.loading).toBe(false)
    expect(s1.error).toBeNull()
    expect(s1.nextCursor).toBe('c')
  })

  it('LOAD_MORE_SUCCESS appends to existing events', () => {
    const s0 = { ...createInitialActivityState(), events: [evt('a', '2026-10-10T02:00:00Z')] }
    const s1 = activityReducer(s0, { type: 'LOAD_MORE_SUCCESS', events: [evt('b', '2026-10-10T01:00:00Z')], nextCursor: null })
    expect(s1.events.map(e => e.id)).toEqual(['a', 'b'])
    expect(s1.nextCursor).toBeNull()
  })

  it('PREPEND_RECENT merges newest-first and de-dupes by id', () => {
    const s0 = { ...createInitialActivityState(), events: [evt('a', '2026-10-10T01:00:00Z')] }
    const s1 = activityReducer(s0, {
      type: 'PREPEND_RECENT',
      events: [evt('b', '2026-10-10T03:00:00Z'), evt('a', '2026-10-10T01:00:00Z')],
    })
    expect(s1.events.map(e => e.id)).toEqual(['b', 'a'])
  })

  it('SET_ACTIVE_TYPES updates the filter', () => {
    const s1 = activityReducer(createInitialActivityState(), { type: 'SET_ACTIVE_TYPES', types: ['note.edited'] })
    expect(s1.activeTypes).toEqual(['note.edited'])
  })

  it('LOAD_ERROR records the message and stops loading', () => {
    const s1 = activityReducer({ ...createInitialActivityState(), loading: true }, { type: 'LOAD_ERROR', error: 'nope' })
    expect(s1.error).toBe('nope')
    expect(s1.loading).toBe(false)
  })

  it('SET_RANGE updates the range without touching events', () => {
    const s0 = { ...createInitialActivityState(), events: [evt('a', '2026-10-10T00:00:00Z')] }
    const s1 = activityReducer(s0, { type: 'SET_RANGE', range: 'month' })
    expect(s1.range).toBe('month')
    expect(s1.events).toBe(s0.events)
  })

  it('HEATMAP_LOADED stores heatmap events separately from the list', () => {
    const s0 = { ...createInitialActivityState(), events: [evt('list', '2026-10-10T00:00:00Z')] }
    const s1 = activityReducer(s0, { type: 'HEATMAP_LOADED', events: [evt('hm', '2026-09-01T00:00:00Z')] })
    expect(s1.heatmapEvents.map(e => e.id)).toEqual(['hm'])
    expect(s1.events).toBe(s0.events) // list untouched (L4)
  })

  it('SET_PATH_PREFIX updates the folder filter', () => {
    const s1 = activityReducer(createInitialActivityState(), { type: 'SET_PATH_PREFIX', pathPrefix: 'Projects' })
    expect(s1.pathPrefix).toBe('Projects')
  })
})
