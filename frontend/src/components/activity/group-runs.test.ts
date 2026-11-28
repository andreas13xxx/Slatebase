import { describe, it, expect } from 'vitest'
import type { ActivityEvent } from '../../types'
import { groupLookAlikeRuns } from './group-runs'

const T0 = Date.parse('2026-11-28T12:00:00Z')

function evt(id: string, secondsAgo: number, over: Partial<ActivityEvent> = {}): ActivityEvent {
  const ts = new Date(T0 - secondsAgo * 1000).toISOString()
  return { id, type: 'note.deleted', timestamp: ts, lastModified: ts, path: `${id}.md`, user: 'anna', ...over }
}

function kinds(events: ActivityEvent[]): string[] {
  return groupLookAlikeRuns(events).map(r => r.kind)
}

describe('groupLookAlikeRuns', () => {
  it('folds neighbouring look-alike events into one group', () => {
    const rows = groupLookAlikeRuns([evt('c', 0), evt('b', 5), evt('a', 10)])
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row?.kind).toBe('group')
    if (row?.kind === 'group') {
      expect(row.key).toBe('a')
      expect(row.events.map(e => e.id)).toEqual(['c', 'b', 'a'])
    }
  })

  it('keeps a lone event single', () => {
    expect(kinds([evt('a', 0)])).toEqual(['single'])
  })

  it('splits on a long pause', () => {
    expect(kinds([evt('c', 0), evt('b', 5), evt('a', 500)])).toEqual(['group', 'single'])
  })

  it('splits on another type, user or origin', () => {
    expect(kinds([evt('b', 0), evt('a', 5, { type: 'note.created' })])).toEqual(['single', 'single'])
    expect(kinds([evt('b', 0), evt('a', 5, { user: 'bob' })])).toEqual(['single', 'single'])
    expect(kinds([evt('b', 0), evt('a', 5, { origin: 'mcp' })])).toEqual(['single', 'single'])
  })

  it('treats a missing origin as web', () => {
    expect(kinds([evt('b', 0), evt('a', 5, { origin: 'web' })])).toEqual(['group'])
  })

  it('does not fold around an unrelated event', () => {
    expect(kinds([evt('c', 0), evt('x', 2, { type: 'note.created' }), evt('a', 4)])).toEqual(['single', 'single', 'single'])
  })

  it('never nests sync summaries', () => {
    expect(kinds([evt('b', 0, { type: 'sync.completed' }), evt('a', 5, { type: 'sync.completed' })])).toEqual(['single', 'single'])
  })
})
