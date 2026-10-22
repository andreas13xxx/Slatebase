import { describe, expect, it, vi } from 'vitest'
import type { ILogger } from '../logger/index.js'
import { ReleaseInfoUnavailableError } from '../release-info/index.js'
import type { IReleaseInfoService, ReleaseList } from '../release-info/index.js'
import { createReleaseRoutes } from './releaseRoutes.js'

function createMockLogger(): ILogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function createMockService(impl: () => Promise<ReleaseList>): IReleaseInfoService {
  return { getReleases: vi.fn(impl) }
}

describe('GET /releases', () => {
  it('returns the release list', async () => {
    const list: ReleaseList = {
      releases: [{ tagName: 'v1.0.0', name: 'v1.0.0', body: 'notes', htmlUrl: 'https://github.com/a/b/releases/tag/v1.0.0', prerelease: false }],
      latest: null,
      stale: false,
    }
    const routes = createReleaseRoutes({ releaseInfoService: createMockService(async () => list), logger: createMockLogger() })

    const res = await routes.request('/')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(list)
  })

  it('answers 502 RELEASE_INFO_UNAVAILABLE when GitHub was never reachable', async () => {
    const routes = createReleaseRoutes({
      releaseInfoService: createMockService(async () => { throw new ReleaseInfoUnavailableError() }),
      logger: createMockLogger(),
    })

    const res = await routes.request('/')

    expect(res.status).toBe(502)
    expect(((await res.json()) as { code: string }).code).toBe('RELEASE_INFO_UNAVAILABLE')
  })

  it('answers 500 without leaking details for an unexpected error', async () => {
    const logger = createMockLogger()
    const routes = createReleaseRoutes({
      releaseInfoService: createMockService(async () => { throw new Error('secret detail') }),
      logger,
    })

    const res = await routes.request('/')

    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret detail')
    expect(logger.error).toHaveBeenCalled()
  })
})
