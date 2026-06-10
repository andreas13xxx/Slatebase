// MCP Routes — Streamable HTTP transport endpoint for MCP protocol
//
// Handles POST /api/v1/mcp (JSON-RPC requests), GET (SSE streams), DELETE (session termination).
// Authentication via Bearer token, rate limiting per token, forwarding to MCP SDK transport.

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Hono } from 'hono'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { IMcpTokenService } from '../mcp/token-service.js'
import type { IMcpRateLimiter } from '../mcp/rate-limiter.js'
import type { IMcpServerFactory } from '../mcp/server-factory.js'
import type { McpConfig } from '../mcp/config.js'
import { McpAuthenticationError } from '../mcp/errors.js'
import type { McpTokenContext } from '../mcp/types.js'
import type { ILogger } from '../logger/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Dependencies required by the MCP route module. */
export interface McpRouteDependencies {
  tokenService: IMcpTokenService
  rateLimiter: IMcpRateLimiter
  serverFactory: IMcpServerFactory
  mcpConfig: McpConfig
  logger: ILogger
}

/** Node.js HTTP bindings exposed by @hono/node-server via c.env. */
interface HttpBindings {
  incoming: IncomingMessage
  outgoing: ServerResponse
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a structured API error response object.
 */
function createApiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Extracts the Bearer token from the Authorization header.
 * Returns null if the header is missing or malformed.
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  const token = parts[1]
  if (!token || token.length === 0) return null
  return token
}

// ─── Transport Session Map ───────────────────────────────────────────────────

/**
 * In-memory map of active MCP sessions (sessionId → transport + server).
 * Used for GET (SSE) and DELETE (session termination) requests.
 */
const sessions = new Map<string, {
  transport: StreamableHTTPServerTransport
  tokenContext: McpTokenContext
}>()

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Creates Hono routes for the MCP Streamable HTTP transport.
 * Handles:
 * - Bearer token authentication (before passing to SDK)
 * - Rate limiting per token
 * - Forwarding to StreamableHTTPServerTransport
 *
 * Note: MCP enabled/disabled is now controlled by the FeatureToggleService at a higher level.
 * This function assumes MCP is enabled when called (guarded by the composition root).
 *
 * @param deps - Dependencies for the MCP route module.
 * @returns A Hono instance with MCP routes registered.
 */
export function createMcpRoutes(deps: McpRouteDependencies): Hono {
  const { tokenService, rateLimiter, serverFactory, mcpConfig, logger } = deps
  const app = new Hono()

  /**
   * Authenticates the request by extracting and validating the Bearer token.
   * Returns the token context on success, or sends an error response and returns null.
   */
  async function authenticateRequest(
    authHeader: string | undefined,
    res: ServerResponse,
  ): Promise<McpTokenContext | null> {
    const rawToken = extractBearerToken(authHeader)

    if (rawToken === null) {
      const error = createApiError('UNAUTHORIZED', 'Invalid or missing API token')
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(error))
      return null
    }

    try {
      const tokenContext = await tokenService.validateToken(rawToken)
      return tokenContext
    } catch (err) {
      if (err instanceof McpAuthenticationError) {
        const error = createApiError('UNAUTHORIZED', 'Invalid or missing API token')
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(error))
        return null
      }
      throw err
    }
  }

  /**
   * Checks the rate limit for the given token.
   * Returns true if allowed, or sends a 429 response and returns false.
   */
  function checkRateLimit(tokenId: string, res: ServerResponse): boolean {
    const { allowed, retryAfter } = rateLimiter.checkLimit(tokenId)

    if (!allowed) {
      const error = createApiError('RATE_LIMITED', `MCP rate limit exceeded. Retry after ${retryAfter} seconds`)
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      })
      res.end(JSON.stringify(error))
      return false
    }

    return true
  }

  // ─── POST /api/v1/mcp — Main JSON-RPC endpoint ──────────────────────────

  app.post('/', async (c) => {
    const env = c.env as HttpBindings
    const req = env.incoming
    const res = env.outgoing

    // 1. Authenticate
    const authHeader = c.req.header('Authorization')
    const tokenContext = await authenticateRequest(authHeader, res)
    if (tokenContext === null) return new Response(null, { status: 401 })

    // 2. Rate limit check
    if (!checkRateLimit(tokenContext.tokenId, res)) {
      return new Response(null, { status: 429 })
    }

    // 3. Record the request for rate limiting
    rateLimiter.recordRequest(tokenContext.tokenId)

    // 4. Record token usage (fire-and-forget)
    tokenService.recordUsage(tokenContext.tokenId)

    // 5. Log the MCP access
    logger.info('MCP request', {
      userId: tokenContext.userId,
      tokenId: tokenContext.tokenId,
      tokenName: tokenContext.tokenName,
      method: 'POST',
    })

    // 6. Parse the request body
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      // Let the SDK handle parse errors via the transport
      body = undefined
    }

    // 7. Create transport and server, forward request
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId: string) => {
          sessions.set(sessionId, { transport, tokenContext })
          logger.debug('MCP session initialized', { sessionId, userId: tokenContext.userId })
        },
      })

      // Clean up session on transport close
      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid && sessions.has(sid)) {
          sessions.delete(sid)
          logger.debug('MCP session closed', { sessionId: sid })
        }
      }

      // Create a new McpServer with the authenticated user's context
      const server = serverFactory.createServer()

      // Connect transport to server
      await server.connect(transport)

      // Forward the request to the SDK transport
      await transport.handleRequest(req, res, body)

      // If the response was already sent by the transport, return an empty response
      // to prevent Hono from trying to send another response
      return new Response(null, { status: 200 })
    } catch (err) {
      logger.error('MCP request processing error', {
        userId: tokenContext.userId,
        error: err instanceof Error ? err.message : String(err),
      })

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        }))
      }
      return new Response(null, { status: 500 })
    }
  })

  // ─── GET /api/v1/mcp — SSE stream for existing sessions ─────────────────

  app.get('/', async (c) => {
    const env = c.env as HttpBindings
    const req = env.incoming
    const res = env.outgoing

    // 1. Authenticate
    const authHeader = c.req.header('Authorization')
    const tokenContext = await authenticateRequest(authHeader, res)
    if (tokenContext === null) return new Response(null, { status: 401 })

    // 2. Rate limit check
    if (!checkRateLimit(tokenContext.tokenId, res)) {
      return new Response(null, { status: 429 })
    }

    // 3. Record the request for rate limiting
    rateLimiter.recordRequest(tokenContext.tokenId)

    // 4. Look up existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing session ID' },
        id: null,
      }))
      return new Response(null, { status: 400 })
    }

    const session = sessions.get(sessionId)!

    // Verify the session belongs to the same token
    if (session.tokenContext.tokenId !== tokenContext.tokenId) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(createApiError('FORBIDDEN', 'Session does not belong to this token')))
      return new Response(null, { status: 403 })
    }

    logger.debug('MCP SSE stream request', {
      sessionId,
      userId: tokenContext.userId,
    })

    // 5. Forward to transport
    try {
      await session.transport.handleRequest(req, res)
      return new Response(null, { status: 200 })
    } catch (err) {
      logger.error('MCP GET request error', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      })
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        }))
      }
      return new Response(null, { status: 500 })
    }
  })

  // ─── DELETE /api/v1/mcp — Session termination ────────────────────────────

  app.delete('/', async (c) => {
    const env = c.env as HttpBindings
    const req = env.incoming
    const res = env.outgoing

    // 1. Authenticate
    const authHeader = c.req.header('Authorization')
    const tokenContext = await authenticateRequest(authHeader, res)
    if (tokenContext === null) return new Response(null, { status: 401 })

    // 2. Look up existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing session ID' },
        id: null,
      }))
      return new Response(null, { status: 400 })
    }

    const session = sessions.get(sessionId)!

    // Verify the session belongs to the same token
    if (session.tokenContext.tokenId !== tokenContext.tokenId) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(createApiError('FORBIDDEN', 'Session does not belong to this token')))
      return new Response(null, { status: 403 })
    }

    logger.info('MCP session termination', {
      sessionId,
      userId: tokenContext.userId,
    })

    // 3. Forward to transport for cleanup
    try {
      await session.transport.handleRequest(req, res)
      return new Response(null, { status: 200 })
    } catch (err) {
      logger.error('MCP DELETE request error', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      })
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        }))
      }
      return new Response(null, { status: 500 })
    }
  })

  logger.info('MCP routes registered', { rateLimit: mcpConfig.rateLimit })

  return app
}

// ─── Raw HTTP Handler (bypasses Hono to avoid double-response) ───────────────

/** Raw Node.js HTTP handler type for MCP transport. */
export type McpHttpHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/**
 * Creates a raw Node.js HTTP request handler for the MCP transport endpoint.
 * This bypasses Hono entirely to avoid the double-response issue where
 * StreamableHTTPServerTransport writes to `res` directly, and then Hono
 * tries to write again.
 *
 * @param deps - Same dependencies as createMcpRoutes.
 * @returns A raw HTTP handler function, or null if MCP is disabled.
 */
export function createMcpHttpHandler(deps: McpRouteDependencies & { onAuthenticated?: (userId: string) => void }): McpHttpHandler | null {
  const { tokenService, rateLimiter, serverFactory, logger, onAuthenticated } = deps

  /** In-memory map of active sessions for this handler. */
  const httpSessions = new Map<string, {
    transport: StreamableHTTPServerTransport
    tokenContext: McpTokenContext
  }>()

  function extractToken(req: IncomingMessage): string | null {
    const authHeader = req.headers['authorization']
    if (!authHeader) return null
    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null
    const token = parts[1]
    if (!token || token.length === 0) return null
    return token
  }

  async function authenticate(req: IncomingMessage, res: ServerResponse): Promise<McpTokenContext | null> {
    const rawToken = extractToken(req)
    if (rawToken === null) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Invalid or missing API token', timestamp: new Date().toISOString() }))
      return null
    }
    try {
      return await tokenService.validateToken(rawToken)
    } catch (err) {
      if (err instanceof McpAuthenticationError) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Invalid or missing API token', timestamp: new Date().toISOString() }))
        return null
      }
      throw err
    }
  }

  function checkRate(tokenId: string, res: ServerResponse): boolean {
    const { allowed, retryAfter } = rateLimiter.checkLimit(tokenId)
    if (!allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) })
      res.end(JSON.stringify({ code: 'RATE_LIMITED', message: `Rate limit exceeded. Retry after ${retryAfter}s`, timestamp: new Date().toISOString() }))
      return false
    }
    return true
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET'

    // Authenticate
    const tokenContext = await authenticate(req, res)
    if (tokenContext === null) return

    // Notify caller of authenticated userId (for tool handler context)
    if (onAuthenticated) {
      onAuthenticated(tokenContext.userId)
    }

    // Rate limit
    if (!checkRate(tokenContext.tokenId, res)) return
    rateLimiter.recordRequest(tokenContext.tokenId)
    tokenService.recordUsage(tokenContext.tokenId)

    if (method === 'POST') {
      // Check if this is a request for an existing session
      const sessionId = req.headers['mcp-session-id'] as string | undefined

      if (sessionId && httpSessions.has(sessionId)) {
        // Forward to existing session's transport
        const session = httpSessions.get(sessionId)!
        if (session.tokenContext.tokenId !== tokenContext.tokenId) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ code: 'FORBIDDEN', message: 'Session does not belong to this token', timestamp: new Date().toISOString() }))
          return
        }

        logger.info('MCP request (existing session)', { userId: tokenContext.userId, tokenId: tokenContext.tokenId, tokenName: tokenContext.tokenName, sessionId })

        // Parse body
        let body: unknown
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
          }
          const raw = Buffer.concat(chunks).toString('utf-8')
          body = raw ? JSON.parse(raw) : undefined
        } catch {
          body = undefined
        }

        try {
          await session.transport.handleRequest(req, res, body)
        } catch (err) {
          logger.error('MCP POST error (existing session)', { sessionId, error: err instanceof Error ? err.message : String(err) })
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }))
          }
        }
        return
      }

      // New session — create transport + server
      logger.info('MCP request (new session)', { userId: tokenContext.userId, tokenId: tokenContext.tokenId, tokenName: tokenContext.tokenName, method: 'POST' })

      // Parse body
      let body: unknown
      try {
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        }
        const raw = Buffer.concat(chunks).toString('utf-8')
        body = raw ? JSON.parse(raw) : undefined
      } catch {
        body = undefined
      }

      // Create transport + server
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId: string) => {
            httpSessions.set(sessionId, { transport, tokenContext })
            logger.debug('MCP session initialized', { sessionId, userId: tokenContext.userId })
          },
        })

        transport.onclose = () => {
          const sid = transport.sessionId
          if (sid && httpSessions.has(sid)) {
            httpSessions.delete(sid)
            logger.debug('MCP session closed', { sessionId: sid })
          }
        }

        const server = serverFactory.createServer()
        await server.connect(transport)
        await transport.handleRequest(req, res, body)
      } catch (err) {
        logger.error('MCP POST error (new session)', { userId: tokenContext.userId, error: err instanceof Error ? err.message : String(err) })
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }))
        }
      }
    } else if (method === 'GET') {
      // SSE stream for existing session
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (!sessionId || !httpSessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid or missing session ID' }, id: null }))
        return
      }
      const session = httpSessions.get(sessionId)!
      if (session.tokenContext.tokenId !== tokenContext.tokenId) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'FORBIDDEN', message: 'Session does not belong to this token', timestamp: new Date().toISOString() }))
        return
      }
      try {
        await session.transport.handleRequest(req, res)
      } catch (err) {
        logger.error('MCP GET error', { sessionId, error: err instanceof Error ? err.message : String(err) })
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }))
        }
      }
    } else if (method === 'DELETE') {
      // Session termination
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (!sessionId || !httpSessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid or missing session ID' }, id: null }))
        return
      }
      const session = httpSessions.get(sessionId)!
      if (session.tokenContext.tokenId !== tokenContext.tokenId) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'FORBIDDEN', message: 'Session does not belong to this token', timestamp: new Date().toISOString() }))
        return
      }
      logger.info('MCP session termination', { sessionId, userId: tokenContext.userId })
      try {
        await session.transport.handleRequest(req, res)
      } catch (err) {
        logger.error('MCP DELETE error', { sessionId, error: err instanceof Error ? err.message : String(err) })
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }))
        }
      }
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', timestamp: new Date().toISOString() }))
    }
  }
}
