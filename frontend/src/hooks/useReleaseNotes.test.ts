import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useReleaseNotes } from './useReleaseNotes'

describe('useReleaseNotes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not fetch while inactive', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useReleaseNotes(false))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toEqual({ releases: [], loading: true, error: false })
  })

  it('fetches and maps GitHub releases when active', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { tag_name: 'v1.2.0', name: 'v1.2.0', body: '### Fixed\n- a bug', html_url: 'https://github.com/x/y/releases/tag/v1.2.0' },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useReleaseNotes(true))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe(false)
    expect(result.current.releases).toEqual([
      { tagName: 'v1.2.0', name: 'v1.2.0', body: '### Fixed\n- a bug', htmlUrl: 'https://github.com/x/y/releases/tag/v1.2.0' },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api.github.com/repos/andreas13xxx/Slatebase/releases'),
      expect.any(Object),
    )
  })

  it('sets error=true when the GitHub API responds with a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))

    const { result } = renderHook(() => useReleaseNotes(true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(true)
    expect(result.current.releases).toEqual([])
  })

  it('sets error=true when fetch throws (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const { result } = renderHook(() => useReleaseNotes(true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(true)
  })
})
