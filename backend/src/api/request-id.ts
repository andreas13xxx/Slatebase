/**
 * Request-ID middleware for Hono.
 *
 * Generates a unique request ID (or uses the one provided by an upstream proxy
 * via the `X-Request-Id` header) and makes it available throughout the request lifecycle.
 *
 * - Sets `c.set('requestId', id)` for downstream handlers.
 * - Adds `X-Request-Id` response header for client-side correlation.
 * - The ID can be included in log entries for tracing requests across services.
 */

import { randomUUID } from 'node:crypto'
import type { Context, Next } from 'hono'

/**
 * Creates a Hono middleware that assigns a unique request ID to each request.
 *
 * If the incoming request already has an `X-Request-Id` header (e.g. from a
 * reverse proxy), it is reused. Otherwise, a new UUIDv4 is generated.
 *
 * The request ID is:
 * - Set on the Hono context: `c.get('requestId')`
 * - Added as a response header: `X-Request-Id`
 *
 * @returns A Hono middleware function.
 */
export function createRequestIdMiddleware(): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next): Promise<void> => {
    // Reuse incoming request ID from upstream proxy, or generate a new one
    const incoming = c.req.header('X-Request-Id')
    const requestId = (incoming && incoming.length > 0 && incoming.length <= 128)
      ? incoming
      : randomUUID()

    c.set('requestId', requestId)
    c.header('X-Request-Id', requestId)

    await next()
  }
}
