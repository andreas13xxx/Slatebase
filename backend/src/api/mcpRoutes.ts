// MCP Routes — Streamable HTTP transport endpoint for MCP protocol
//
// Handles POST /api/v1/mcp (JSON-RPC requests), GET (SSE streams), DELETE (session termination).
// Authentication via Bearer token, rate limiting per token, forwarding to MCP SDK transport.
//
// This bypasses Hono entirely (raw Node.js HTTP handler below) to avoid the
// double-response issue where StreamableHTTPServerTransport writes to `res`
// directly, and then Hono would try to write again.

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { IMcpTokenService } from '../mcp/token-service.js'
import type { IMcpRateLimiter } from '../mcp/rate-limiter.js'
import type { IMcpServerFactory } from '../mcp/server-factory.js'
import { McpAuthenticationError } from '../mcp/errors.js'
import type { McpTokenContext } from '../mcp/types.js'
import type { ILogger } from '../logger/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Dependencies required by the MCP route module. */
export interface McpRouteDependencies {
  tokenService: IMcpTokenService
  rateLimiter: IMcpRateLimiter
  serverFactory: IMcpServerFactory
  logger: ILogger
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
 * @param deps - Dependencies for the MCP transport handler.
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
        // StreamableHTTPServerTransport's `onclose` accessor types as `(() => void) | undefined`
        // (it can be cleared), which exactOptionalPropertyTypes treats as incompatible with
        // Transport's plain `onclose?: () => void` — a structural-typing false positive, not a
        // real mismatch, since an absent vs. undefined `onclose` behave identically at runtime.
        await server.connect(transport as Transport)
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
