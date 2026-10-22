// Release routes — Slatebase's own GitHub releases, fetched server-side (the browser talks only to Slatebase).

import { Hono } from 'hono'
import type { ILogger } from '../logger/index.js'
import { ReleaseInfoUnavailableError } from '../release-info/index.js'
import type { IReleaseInfoService } from '../release-info/index.js'

export interface ReleaseRouteDependencies {
  releaseInfoService: IReleaseInfoService
  logger: ILogger
}

/**
 * Mounted at `/api/v1/releases` (session auth applies via the `/api/v1/*` middleware).
 *
 *   GET /  → { releases, latest, stale }, or 502 `RELEASE_INFO_UNAVAILABLE` if GitHub was never reachable
 */
export function createReleaseRoutes(deps: ReleaseRouteDependencies): Hono {
  const routes = new Hono()

  routes.get('/', async (c) => {
    try {
      return c.json(await deps.releaseInfoService.getReleases())
    } catch (error: unknown) {
      if (error instanceof ReleaseInfoUnavailableError) {
        return c.json({ code: 'RELEASE_INFO_UNAVAILABLE', message: error.message, timestamp: new Date().toISOString() }, 502)
      }
      deps.logger.error('Unexpected release route error', { error: error instanceof Error ? error.message : String(error) })
      return c.json({ code: 'INTERNAL_ERROR', message: 'Internal server error', timestamp: new Date().toISOString() }, 500)
    }
  })

  return routes
}
