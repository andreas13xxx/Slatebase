import { describe, expect, it, vi } from 'vitest'
import type { ILogger } from '../logger/index.js'
import type { GuardedFetchResult } from '../shared/guarded-fetch.js'
import { GuardedFetchError } from '../shared/guarded-fetch.js'
import { ReleaseInfoService, ReleaseInfoUnavailableError } from './release-info-service.js'

function createMockLogger(): ILogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function release(tag: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { tag_name: tag, name: tag, body: `notes ${tag}`, html_url: `https://github.com/andreas13xxx/Slatebase/releases/tag/${tag}`, ...extra }
}

function ok(payload: unknown): GuardedFetchResult {
  return { status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify(payload)), finalUrl: '' }
}

function setup(responses: Array<GuardedFetchResult | Error>) {
  const queue = [...responses]
  const fetcher = vi.fn(async () => {
    const next = queue.shift()
    if (next === undefined) throw new Error('no more responses')
    if (next instanceof Error) throw next
    return next
  })
  let time = 1_000
  const service = new ReleaseInfoService(createMockLogger(), fetcher, () => time)
  return { service, fetcher, advance: (ms: number) => { time += ms } }
}

describe('ReleaseInfoService', () => {
  it('returns the releases and the newest non-prerelease as latest', async () => {
    const { service } = setup([ok([release('v1.2.0-rc.1', { prerelease: true }), release('v1.1.0'), release('v1.0.0')])])

    const result = await service.getReleases()

    expect(result.releases.map((r) => r.tagName)).toEqual(['v1.2.0-rc.1', 'v1.1.0', 'v1.0.0'])
    expect(result.latest?.tagName).toBe('v1.1.0')
    expect(result.stale).toBe(false)
  })

  it('only talks to api.github.com', async () => {
    const { service, fetcher } = setup([ok([release('v1.0.0')])])

    await service.getReleases()

    const [url, options] = fetcher.mock.calls[0] as unknown as [string, { allowedHosts: Set<string> }]
    expect(url.startsWith('https://api.github.com/')).toBe(true)
    expect([...options.allowedHosts]).toEqual(['api.github.com'])
  })

  it('drops drafts and entries without a tag or with a foreign release URL, and keeps at most five', async () => {
    const entries = [
      release('v9', { draft: true }),
      { name: 'no tag', html_url: 'https://github.com/x/y' },
      release('v8', { html_url: 'https://evil.example/x' }),
      ...['v7', 'v6', 'v5', 'v4', 'v3', 'v2'].map((t) => release(t)),
    ]
    const { service } = setup([ok(entries)])

    const result = await service.getReleases()

    expect(result.releases.map((r) => r.tagName)).toEqual(['v7', 'v6', 'v5', 'v4', 'v3'])
  })

  it('serves from the cache for an hour, then asks again', async () => {
    const { service, fetcher, advance } = setup([ok([release('v1.0.0')]), ok([release('v1.1.0')])])

    await service.getReleases()
    advance(59 * 60 * 1000)
    expect((await service.getReleases()).latest?.tagName).toBe('v1.0.0')
    expect(fetcher).toHaveBeenCalledTimes(1)

    advance(2 * 60 * 1000)
    expect((await service.getReleases()).latest?.tagName).toBe('v1.1.0')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('shares one request between concurrent callers', async () => {
    const { service, fetcher } = setup([ok([release('v1.0.0')])])

    await Promise.all([service.getReleases(), service.getReleases(), service.getReleases()])

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('serves the last known list as stale when GitHub fails after the cache expired', async () => {
    const { service, advance } = setup([ok([release('v1.0.0')]), new GuardedFetchError('network', 'u')])

    await service.getReleases()
    advance(2 * 60 * 60 * 1000)
    const result = await service.getReleases()

    expect(result.stale).toBe(true)
    expect(result.latest?.tagName).toBe('v1.0.0')
  })

  it.each([
    ['a network error', new GuardedFetchError('network', 'u')],
    ['a 404', { status: 404, headers: new Headers(), body: Buffer.alloc(0), finalUrl: '' } satisfies GuardedFetchResult],
    ['a non-array payload', ok({ message: 'nope' })],
  ])('throws ReleaseInfoUnavailableError when nothing was ever fetched (%s)', async (_label, response) => {
    const { service } = setup([response])

    await expect(service.getReleases()).rejects.toBeInstanceOf(ReleaseInfoUnavailableError)
  })

  it('does not cache a failure: the next call asks again', async () => {
    const { service, fetcher } = setup([new GuardedFetchError('timeout', 'u'), ok([release('v1.0.0')])])

    await expect(service.getReleases()).rejects.toBeInstanceOf(ReleaseInfoUnavailableError)
    expect((await service.getReleases()).latest?.tagName).toBe('v1.0.0')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
