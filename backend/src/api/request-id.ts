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
/**
 * Characters allowed in a reused incoming request ID. An upstream proxy's id is
 * attacker-influenced data that ends up in log lines and the response header, so
 * a CR/LF or other control character would enable log- and header-injection.
 * Restricted to a conservative token charset; anything else forces a fresh UUID.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._~-]{1,128}$/

export function createRequestIdMiddleware(): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next): Promise<void> => {
    // Reuse the incoming request ID from an upstream proxy only when it is a safe
    // token; otherwise generate a new UUIDv4 (never echo unvalidated header bytes).
    const incoming = c.req.header('X-Request-Id')
    const requestId = (incoming !== undefined && SAFE_REQUEST_ID.test(incoming))
      ? incoming
      : randomUUID()

    c.set('requestId', requestId)
    c.header('X-Request-Id', requestId)

    await next()
  }
}
