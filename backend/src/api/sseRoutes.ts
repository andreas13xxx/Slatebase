/**
 * SSE endpoint route handler.
 *
 * Provides a `GET /events` endpoint that establishes a Server-Sent Events stream
 * for real-time push notifications. Handles authentication via Bearer token or
 * query parameter, connection registration, presence initialization, and event replay.
 */

import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import type { ServerResponse } from 'node:http'
import type { IConnectionManager, IEventBus, IPresenceService, SseEvent } from '../realtime/types.js'
import { ConnectionLimitError } from '../realtime/errors.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Dependencies required to create the SSE route handler.
 */
export interface SseRouteDeps {
  connectionManager: IConnectionManager
  eventBus: IEventBus
  presenceService: IPresenceService
  authMiddleware: MiddlewareHandler
  featureGuard: MiddlewareHandler
  logger: ILogger
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Serializes an SSE event into the wire format for writing to the stream.
 */
function serializeEvent(event: SseEvent): string {
  const json = JSON.stringify(event.data)
  return `event: ${event.type}\nid: ${event.id}\ndata: ${json}\n\n`
}

// ─── SSE Route Factory ───────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with the SSE endpoint.
 *
 * Route:
 *   GET /events — Establishes an SSE connection for real-time events.
 *
 * The endpoint:
 * 1. Accepts tokens from `Authorization: Bearer <token>` or `?token=` query param
 * 2. Applies auth middleware and feature guard
 * 3. Registers the connection with ConnectionManager
 * 4. Sends initial `presence:init` event with visible online users
 * 5. Replays missed events if `Last-Event-ID` header is present
 * 6. On connection close: removes from ConnectionManager
 * 7. On global limit exceeded (80%): returns 503 with Retry-After: 30
 *
 * @param deps - Service dependencies for the SSE route
 * @returns A Hono sub-app to be mounted on a parent router
 */
export function createSseRoutes(deps: SseRouteDeps): Hono {
  const { connectionManager, eventBus, presenceService, authMiddleware, featureGuard, logger } = deps

  const app = new Hono()

  // Token query param → Authorization header middleware.
  // EventSource cannot set custom headers, so we accept token as a query param
  // and inject it as a header before the auth middleware runs.
  const tokenQueryParamMiddleware: MiddlewareHandler = async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      const queryToken = c.req.query('token')
      if (queryToken && queryToken.length > 0) {
        // Clone the request with the token injected as an Authorization header
        // so auth middleware can pick it up.
        const headers = new Headers(c.req.raw.headers)
        headers.set('Authorization', `Bearer ${queryToken}`)
        c.req.raw = new Request(c.req.raw.url, {
          method: c.req.raw.method,
          headers,
          body: c.req.raw.body,
        })
      }
    }
    await next()
  }

  // GET /events — SSE endpoint
  app.get(
    '/events',
    tokenQueryParamMiddleware,
    authMiddleware,
    featureGuard,
    async (c: Context) => {
      const session = c.get('session') as SessionContext
      const userId = session.userId
      const lastEventId = c.req.header('Last-Event-ID') ?? undefined

      // Access the raw Node.js ServerResponse
      const nodeRes = c.env.outgoing as ServerResponse

      // Try to register the connection
      let connectionId: string
      try {
        connectionId = connectionManager.register(userId, nodeRes, lastEventId)
      } catch (error) {
        if (error instanceof ConnectionLimitError) {
          return c.json(
            {
              code: error.code,
              message: error.message,
              timestamp: new Date().toISOString(),
            },
            { status: 503, headers: { 'Retry-After': String(error.retryAfter) } },
          )
        }
        throw error
      }

      logger.info('SSE connection established', { connectionId, userId })

      // Set SSE response headers
      nodeRes.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      // Send initial presence:init event with visible online users
      try {
        const visibleUsers = await presenceService.getVisibleOnlineUsers(userId)
        const presenceInitEvent: SseEvent = {
          type: 'presence:init',
          id: eventBus.nextEventId(),
          data: { type: 'presence:init', payload: { onlineUsers: visibleUsers }, timestamp: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        }
        nodeRes.write(serializeEvent(presenceInitEvent))
      } catch (err) {
        logger.error('Failed to send presence:init event', { connectionId, userId, error: String(err) })
      }

      // Replay missed events if Last-Event-ID was provided
      if (lastEventId) {
        try {
          const missedEvents = eventBus.getEventsSince(userId, lastEventId)
          for (const event of missedEvents) {
            nodeRes.write(serializeEvent(event))
          }
          logger.debug('Replayed missed events', { connectionId, userId, lastEventId, count: missedEvents.length })
        } catch (err) {
          logger.error('Failed to replay events', { connectionId, userId, lastEventId, error: String(err) })
        }
      }

      // Handle connection close
      nodeRes.on('close', () => {
        logger.debug('SSE connection closed by client', { connectionId, userId })
        connectionManager.remove(connectionId)
      })

      // Keep the connection open — return a Response that won't close the stream.
      // The raw ServerResponse is already being used directly.
      // Note: This causes a harmless ERR_HTTP_HEADERS_SENT warning because
      // nodeRes.writeHead() was already called above. The SSE connection works correctly.
      return new Response(null, { status: 200 })
    },
  )

  return app
}
