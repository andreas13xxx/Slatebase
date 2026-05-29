/**
 * MCP Token Routes — Route module for API token CRUD operations.
 * Protected by existing session auth middleware (not Bearer token).
 * CSRF middleware is applied to POST/DELETE.
 *
 * Routes:
 * - GET    /  — List user's tokens
 * - POST   /  — Create new token
 * - DELETE  /:tokenId  — Revoke a token
 */

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IMcpTokenService } from '../mcp/token-service.js'
import { TokenLimitError, TokenValidationError, TokenNotFoundError } from '../mcp/errors.js'
import { createTokenSchema } from '../mcp/validation.js'

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

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Creates Hono routes for MCP API token CRUD operations.
 * Protected by existing session auth middleware.
 *
 * @param deps - Dependencies for the route module.
 * @returns A Hono instance with token management routes registered.
 */
export function createMcpTokenRoutes(deps: {
  tokenService: IMcpTokenService
  logger: ILogger
}): Hono {
  const { tokenService, logger } = deps
  const app = new Hono()

  // GET / — List user's tokens
  app.get('/', async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      return c.json(createApiError('UNAUTHORIZED', 'Missing session context'), 401)
    }

    try {
      const tokens = await tokenService.listTokens(session.userId)
      return c.json(tokens, 200)
    } catch (error) {
      return handleTokenError(c, error, logger)
    }
  })

  // POST / — Create new token
  app.post('/', async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      return c.json(createApiError('UNAUTHORIZED', 'Missing session context'), 401)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    }

    // Validate input with Zod
    const parseResult = createTokenSchema.safeParse(body)
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]
      const message = firstError ? firstError.message : 'Invalid request body'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    const { name, expiryDays } = parseResult.data

    try {
      const result = await tokenService.createToken(session.userId, name, expiryDays)
      return c.json(result, 201)
    } catch (error) {
      return handleTokenError(c, error, logger)
    }
  })

  // DELETE /:tokenId — Revoke a token
  app.delete('/:tokenId', async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      return c.json(createApiError('UNAUTHORIZED', 'Missing session context'), 401)
    }

    const tokenId = c.req.param('tokenId') as string

    try {
      await tokenService.revokeToken(session.userId, tokenId)
      return c.body(null, 204)
    } catch (error) {
      return handleTokenError(c, error, logger)
    }
  })

  return app
}

// ─── Error Mapping ───────────────────────────────────────────────────────────

/**
 * Maps domain errors to HTTP status codes and structured API error responses.
 * - TokenLimitError → 409
 * - TokenValidationError → 400
 * - TokenNotFoundError → 404
 * - Unknown → 500
 */
function handleTokenError(c: Context, error: unknown, logger: ILogger): Response {
  if (error instanceof TokenLimitError) {
    logger.warn('MCP token limit reached', { maxTokens: error.maxTokens })
    return c.json(createApiError('TOKEN_LIMIT_REACHED', error.message), 409)
  }

  if (error instanceof TokenValidationError) {
    logger.warn('MCP token validation error', { code: error.code, message: error.message })
    return c.json(createApiError('TOKEN_VALIDATION_ERROR', error.message), 400)
  }

  if (error instanceof TokenNotFoundError) {
    logger.warn('MCP token not found', { tokenId: error.tokenId })
    return c.json(createApiError('TOKEN_NOT_FOUND', error.message), 404)
  }

  // Unknown / internal errors
  logger.error('Unexpected error in MCP token route', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
}
