import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchReleaseList } from './releaseApi'

describe('fetchReleaseList', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks the own server and returns its answer', async () => {
    const list = { releases: [], latest: null, stale: true }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => list })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchReleaseList()).resolves.toEqual(list)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/releases', expect.any(Object))
  })

  it('throws on a non-2xx answer, so a failed lookup is never read as "up to date"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }))

    await expect(fetchReleaseList()).rejects.toThrow('502')
  })
})
