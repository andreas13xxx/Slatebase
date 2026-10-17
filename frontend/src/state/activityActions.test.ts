import { describe, it, expect, vi } from 'vitest'
import { loadActivity, loadMoreActivity, refreshRecentActivity, loadActivityHeatmap } from './activityActions'
import type { IApiClient } from '../api'
import type { ActivityEvent, ActivityPage } from '../types'
import type { ActivityAction } from './activityState'

function evt(id: string, timestamp: string): ActivityEvent {
  return { id, type: 'note.created', timestamp, lastModified: timestamp, path: `${id}.md`, user: 'a' }
}

function mockApi(page: ActivityPage | Error): IApiClient {
  return {
    getActivity: vi.fn(async () => {
      if (page instanceof Error) throw page
      return page
    }),
  } as unknown as IApiClient
}

describe('activityActions', () => {
  it('loadActivity dispatches start then success', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    const api = mockApi({ items: [evt('a', '2026-10-10T00:00:00Z')], nextCursor: 'c1' })
    await loadActivity(dispatch, api, 'v1', [], 'week')
    expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOAD_START' })
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: 'LOAD_SUCCESS',
      events: [expect.objectContaining({ id: 'a' })],
      nextCursor: 'c1',
    })
  })

  it('loadActivity dispatches error on failure', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    const api = mockApi(new Error('boom'))
    await loadActivity(dispatch, api, 'v1', [], 'week')
    expect(dispatch).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'LOAD_ERROR' }))
  })

  it('loadActivity forwards the type filter and a range-derived from', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    const api = mockApi({ items: [], nextCursor: null })
    await loadActivity(dispatch, api, 'v1', ['note.deleted'], 'day')
    expect(api.getActivity).toHaveBeenCalledWith('v1', expect.objectContaining({ types: ['note.deleted'], from: expect.any(String) }))
  })

  it('loadActivity forwards pathPrefix when given', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    const api = mockApi({ items: [], nextCursor: null })
    await loadActivity(dispatch, api, 'v1', [], 'week', 'Projects')
    expect(api.getActivity).toHaveBeenCalledWith('v1', expect.objectContaining({ pathPrefix: 'Projects' }))
  })

  it('loadMoreActivity passes the cursor and dispatches LOAD_MORE_SUCCESS', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    const api = mockApi({ items: [evt('b', '2026-10-09T00:00:00Z')], nextCursor: null })
    await loadMoreActivity(dispatch, api, 'v1', 'cursor-1', [], 'week')
    expect(api.getActivity).toHaveBeenCalledWith('v1', expect.objectContaining({ cursor: 'cursor-1' }))
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'LOAD_MORE_SUCCESS' }))
  })

  it('refreshRecentActivity dispatches PREPEND_RECENT and swallows errors', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    await refreshRecentActivity(dispatch, mockApi({ items: [evt('c', '2026-10-10T01:00:00Z')], nextCursor: null }), 'v1', [], 'week')
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PREPEND_RECENT' }))

    const dispatch2 = vi.fn<(a: ActivityAction) => void>()
    await refreshRecentActivity(dispatch2, mockApi(new Error('x')), 'v1', [], 'week')
    expect(dispatch2).not.toHaveBeenCalled()
  })

  it('loadActivityHeatmap uses its own fixed window and dispatches HEATMAP_LOADED (L4)', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    const api = mockApi({ items: [evt('h', '2026-10-01T00:00:00Z')], nextCursor: null })
    await loadActivityHeatmap(dispatch, api, 'v1')
    // Its own from boundary, no range/type coupling.
    expect(api.getActivity).toHaveBeenCalledWith('v1', expect.objectContaining({ from: expect.any(String), limit: 200 }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'HEATMAP_LOADED' }))
  })

  it('loadActivityHeatmap does not dispatch when the signal is cancelled (vault-switch race)', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    const signal = { cancelled: true }
    await loadActivityHeatmap(dispatch, mockApi({ items: [], nextCursor: null }), 'v1', signal)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
