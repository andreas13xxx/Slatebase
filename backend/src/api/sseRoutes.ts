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
import type { ISseTicketStore } from '../auth/sse-ticket-store.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Dependencies required to create the SSE route handler.
 */
export interface SseRouteDeps {
  connectionManager: IConnectionManager
  eventBus: IEventBus
  presenceService: IPresenceService
  authMiddleware: MiddlewareHandler
  sseTicketStore: ISseTicketStore
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
 * 1. Accepts tickets from `?ticket=` (preferred, short-lived one-time nonce)
 * 2. Falls back to `Authorization: Bearer <token>` or `?token=` query param (legacy)
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
  const { connectionManager, eventBus, presenceService, authMiddleware, sseTicketStore, logger } = deps

  const app = new Hono()

  // Ticket-based auth middleware for SSE.
  // If a `?ticket=` param is present, redeem it and set the userId directly.
  // This avoids passing the full session token in the URL.
  // Falls back to the standard token-based auth if no ticket is provided.
  const ticketOrTokenMiddleware: MiddlewareHandler = async (c, next) => {
    // 1. Try ticket-based auth first (preferred)
    const ticket = c.req.query('ticket')
    if (ticket && ticket.length > 0) {
      const result = sseTicketStore.redeem(ticket)
      if (result.valid && result.userId) {
        // Set a minimal session context with just the userId
        c.set('session', { userId: result.userId } as SessionContext)
        return next()
      }
      // Invalid or expired ticket — reject immediately
      return c.json(
        { code: 'INVALID_TICKET', message: 'SSE ticket is invalid or expired', timestamp: new Date().toISOString() },
        401,
      )
    }

    // 2. Fall back to legacy token-based auth (Authorization header or ?token= query param)
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      const queryToken = c.req.query('token')
      if (queryToken && queryToken.length > 0) {
        const headers = new Headers(c.req.raw.headers)
        headers.set('Authorization', `Bearer ${queryToken}`)
        c.req.raw = new Request(c.req.raw.url, {
          method: c.req.raw.method,
          headers,
          body: c.req.raw.body,
        })
      }
    }
    // Delegate to standard auth middleware
    return authMiddleware(c, next)
  }

  // GET /events — SSE endpoint
  app.get(
    '/events',
    ticketOrTokenMiddleware,
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
