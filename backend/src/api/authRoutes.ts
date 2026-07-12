/**
 * Auth routes module — AuthController and route registration for authentication endpoints.
 * Handles login, logout, session listing, and session invalidation.
 */

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { IAuthService, SessionContext } from '../auth/index.js'
import { AuthenticationError, RateLimitError } from '../auth/index.js'
import { AccountSuspendedError } from '../user/index.js'
import { loginRequestSchema } from '../auth/validation.js'
import type { ILogger } from '../logger/index.js'
import type { ISseTicketStore } from '../auth/sse-ticket-store.js'
import type { RouteModule } from './index.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a JSON error response in the standard API error format.
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
function extractBearerToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization')
  if (authHeader === undefined) {
    return null
  }
  if (!authHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7)
  if (token.length === 0) {
    return null
  }
  return token
}

// ─── IAuthController Interface ───────────────────────────────────────────────

/**
 * Controller interface for authentication-related HTTP endpoints.
 */
export interface IAuthController {
  /** POST /auth/login — Authenticate user and return session token. */
  login(c: Context): Promise<Response>
  /** POST /auth/logout — Invalidate the current session. */
  logout(c: Context): Promise<Response>
  /** GET /auth/sessions — List current user's active sessions. */
  getSessions(c: Context): Promise<Response>
  /** DELETE /auth/sessions/:sessionId — Invalidate a specific session. */
  invalidateSession(c: Context): Promise<Response>
  /** DELETE /auth/sessions — Invalidate all other sessions. */
  invalidateOtherSessions(c: Context): Promise<Response>
  /** POST /auth/sse-ticket — Issue a short-lived one-time ticket for SSE connections. */
  issueSseTicket(c: Context): Promise<Response>
}

// ─── AuthController Implementation ──────────────────────────────────────────

/**
 * Handles authentication HTTP requests: login, logout, and session management.
 * Maps domain errors to appropriate HTTP status codes.
 */
export class AuthController implements IAuthController {
  constructor(
    private readonly authService: IAuthService,
    private readonly logger: ILogger,
    private readonly sseTicketStore?: ISseTicketStore,
  ) {}

  /**
   * POST /auth/login — Validate input with Zod, authenticate user, return token + csrfToken + user info.
   * Returns 200 on success, 400 on validation error, 401 on invalid credentials,
   * 403 on suspended account, 429 on rate limit.
   */
  async login(c: Context): Promise<Response> {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      const error = createApiError('VALIDATION_ERROR', 'Invalid JSON body')
      return c.json(error, 400)
    }

    const parseResult = loginRequestSchema.safeParse(body)
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      const error = createApiError('VALIDATION_ERROR', message)
      return c.json(error, 400)
    }

    const { username, password } = parseResult.data

    const ipAddress = (c.get('clientIp') as string | undefined) ?? '0.0.0.0'
    const userAgent = c.req.header('User-Agent') ?? 'unknown'

    try {
      const result = await this.authService.login(username, password, { ipAddress, userAgent })
      return c.json(result, 200)
    } catch (err) {
      if (err instanceof AuthenticationError) {
        const error = createApiError('INVALID_CREDENTIALS', 'Invalid username or password')
        return c.json(error, 401)
      }
      if (err instanceof AccountSuspendedError) {
        const error = createApiError('ACCOUNT_SUSPENDED', 'Account is suspended')
        return c.json(error, 403)
      }
      if (err instanceof RateLimitError) {
        c.header('Retry-After', String(err.retryAfter))
        const error = createApiError('RATE_LIMITED', err.message)
        return c.json(error, 429)
      }

      this.logger.error('Unexpected error during login', {
        message: err instanceof Error ? err.message : String(err),
      })
      const error = createApiError('INTERNAL_ERROR', 'Internal server error')
      return c.json(error, 500)
    }
  }

  /**
   * POST /auth/logout — Invalidate the current session using the Bearer token.
   * Returns 204 on success, 401 if no valid token is present.
   */
  async logout(c: Context): Promise<Response> {
    const token = extractBearerToken(c)
    if (token === null) {
      const error = createApiError('UNAUTHORIZED', 'Missing or invalid authorization token')
      return c.json(error, 401)
    }

    try {
      await this.authService.logout(token)
      return c.body(null, 204)
    } catch (err) {
      this.logger.error('Unexpected error during logout', {
        message: err instanceof Error ? err.message : String(err),
      })
      const error = createApiError('INTERNAL_ERROR', 'Internal server error')
      return c.json(error, 500)
    }
  }

  /**
   * GET /auth/sessions — Return the current user's active sessions.
   * Requires authenticated session context.
   * Returns 200 with session list.
   */
  async getSessions(c: Context): Promise<Response> {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      const error = createApiError('UNAUTHORIZED', 'Not authenticated')
      return c.json(error, 401)
    }

    try {
      const sessions = await this.authService.getSessions(session.userId)
      return c.json(sessions, 200)
    } catch (err) {
      this.logger.error('Unexpected error fetching sessions', {
        message: err instanceof Error ? err.message : String(err),
      })
      const error = createApiError('INTERNAL_ERROR', 'Internal server error')
      return c.json(error, 500)
    }
  }

  /**
   * DELETE /auth/sessions/:sessionId — Invalidate a specific session belonging to the current user.
   * Returns 204 on success.
   */
  async invalidateSession(c: Context): Promise<Response> {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      const error = createApiError('UNAUTHORIZED', 'Not authenticated')
      return c.json(error, 401)
    }

    const sessionId = c.req.param('sessionId') as string

    try {
      await this.authService.invalidateSession(session.userId, sessionId)
      return c.body(null, 204)
    } catch (err) {
      this.logger.error('Unexpected error invalidating session', {
        message: err instanceof Error ? err.message : String(err),
      })
      const error = createApiError('INTERNAL_ERROR', 'Internal server error')
      return c.json(error, 500)
    }
  }

  /**
   * DELETE /auth/sessions — Invalidate all sessions except the current one.
   * Requires the Bearer token to identify the current session to keep.
   * Returns 204 on success.
   */
  async invalidateOtherSessions(c: Context): Promise<Response> {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      const error = createApiError('UNAUTHORIZED', 'Not authenticated')
      return c.json(error, 401)
    }

    const token = extractBearerToken(c)
    if (token === null) {
      const error = createApiError('UNAUTHORIZED', 'Missing or invalid authorization token')
      return c.json(error, 401)
    }

    try {
      await this.authService.invalidateOtherSessions(session.userId, token)
      return c.body(null, 204)
    } catch (err) {
      this.logger.error('Unexpected error invalidating other sessions', {
        message: err instanceof Error ? err.message : String(err),
      })
      const error = createApiError('INTERNAL_ERROR', 'Internal server error')
      return c.json(error, 500)
    }
  }

  /**
   * POST /auth/sse-ticket — Issue a short-lived one-time ticket for SSE connections.
   * The ticket can be used as `?ticket=<value>` on the SSE endpoint instead of
   * passing the full session token in the URL.
   * Returns 200 with `{ ticket }` on success, 401 if not authenticated,
   * 501 if ticket store is not configured.
   */
  async issueSseTicket(c: Context): Promise<Response> {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      const error = createApiError('UNAUTHORIZED', 'Not authenticated')
      return c.json(error, 401)
    }

    if (this.sseTicketStore === undefined) {
      const error = createApiError('NOT_IMPLEMENTED', 'SSE ticket system is not available')
      return c.json(error, 501)
    }

    const ticket = this.sseTicketStore.issue(session.userId)
    return c.json({ ticket }, 200)
  }
}

// ─── AuthRouteModule ─────────────────────────────────────────────────────────

/**
 * Route module that registers all authentication-related routes on a Hono sub-app.
 * Routes: POST /auth/login, POST /auth/logout, GET /auth/sessions,
 * DELETE /auth/sessions/:sessionId, DELETE /auth/sessions.
 */
export class AuthRouteModule implements RouteModule {
  constructor(private readonly controller: IAuthController) {}

  /**
   * Register auth routes on the provided Hono router.
   */
  register(router: Hono): void {
    router.post('/auth/login', (c) => this.controller.login(c))
    router.post('/auth/logout', (c) => this.controller.logout(c))
    router.get('/auth/sessions', (c) => this.controller.getSessions(c))
    router.delete('/auth/sessions/:sessionId', (c) => this.controller.invalidateSession(c))
    router.delete('/auth/sessions', (c) => this.controller.invalidateOtherSessions(c))
    router.post('/auth/sse-ticket', (c) => this.controller.issueSseTicket(c))
  }
}
