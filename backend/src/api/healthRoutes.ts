/**
 * Health route handlers.
 * Provides `/healthz` (liveness) and `/readyz` (readiness) probes.
 * Both are public and unauthenticated — mounted outside `/api/v1` so the
 * `/api/v1/*` auth middleware never runs for them. Responses are kept to a
 * bare status: these endpoints are unauthenticated, so no vault counts,
 * version, or uptime.
 */

import { Hono } from 'hono'

/**
 * Dependencies for the readiness probe.
 */
export interface HealthRouteDeps {
  /** Returns true once startup-critical state (session index, vault registry) has loaded. */
  isReady: () => boolean
}

/**
 * Creates a Hono sub-app with the health probe routes.
 * Routes:
 *   GET /healthz — Liveness: process is running and answering HTTP. No dependency
 *                  checks, no file access, always 200.
 *   GET /readyz  — Readiness: session index and vault registry are loaded.
 *                  200 when ready, 503 otherwise.
 *
 * Intended to be mounted at the app root (`app.route('', healthRoutes)`), the
 * same way `versionRoutes` is — that keeps them outside `/api/v1/*` so the
 * auth middleware registered on that prefix does not apply to them.
 */
export function createHealthRoutes(deps: HealthRouteDeps): Hono {
  const app = new Hono()

  app.get('/healthz', (c) => c.json({ status: 'ok' }, 200))

  app.get('/readyz', (c) => {
    if (deps.isReady()) {
      return c.json({ status: 'ok' }, 200)
    }
    return c.json({ status: 'unavailable' }, 503)
  })

  return app
}
