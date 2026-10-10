import { describe, it, expect, vi } from 'vitest'
import { loadActivity, loadMoreActivity, refreshRecentActivity } from './activityActions'
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
    await loadActivity(dispatch, api, 'v1', [])
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
    await loadActivity(dispatch, api, 'v1', [])
    expect(dispatch).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'LOAD_ERROR' }))
  })

  it('loadActivity forwards the type filter', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    const api = mockApi({ items: [], nextCursor: null })
    await loadActivity(dispatch, api, 'v1', ['note.deleted'])
    expect(api.getActivity).toHaveBeenCalledWith('v1', expect.objectContaining({ types: ['note.deleted'] }))
  })

  it('loadMoreActivity passes the cursor and dispatches LOAD_MORE_SUCCESS', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    const api = mockApi({ items: [evt('b', '2026-10-09T00:00:00Z')], nextCursor: null })
    await loadMoreActivity(dispatch, api, 'v1', 'cursor-1', [])
    expect(api.getActivity).toHaveBeenCalledWith('v1', expect.objectContaining({ cursor: 'cursor-1' }))
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'LOAD_MORE_SUCCESS' }))
  })

  it('refreshRecentActivity dispatches PREPEND_RECENT and swallows errors', async () => {
    const dispatch = vi.fn<(a: ActivityAction) => void>()
    await refreshRecentActivity(dispatch, mockApi({ items: [evt('c', '2026-10-10T01:00:00Z')], nextCursor: null }), 'v1', [])
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PREPEND_RECENT' }))

    const dispatch2 = vi.fn<(a: ActivityAction) => void>()
    await refreshRecentActivity(dispatch2, mockApi(new Error('x')), 'v1', [])
    expect(dispatch2).not.toHaveBeenCalled()
  })
})
