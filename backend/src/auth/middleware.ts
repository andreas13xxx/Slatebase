/**
 * Authentication and authorization middleware for Hono.
 * Provides session validation, CSRF protection, rate limiting, and password-change enforcement.
 */

import type { Context, Next } from 'hono'
import type { IAuthService, SessionContext } from './index.js'
import type { RateLimiter } from './ratelimit.js'
import type { IUserRepository } from '../user/index.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** The login endpoint path that bypasses auth middleware. */
const LOGIN_PATH = '/api/v1/auth/login'

/** The password change endpoint path allowed during mustChangePassword. */
const PASSWORD_CHANGE_PATH = '/api/v1/users/me/password'

/** HTTP methods that require CSRF validation. */
const CSRF_METHODS = new Set(['POST', 'PUT', 'DELETE'])

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a JSON error response in the standard API error format.
 */
function createErrorResponse(c: Context, status: number, code: string, message: string): Response {
  return c.json(
    {
      code,
      message,
      timestamp: new Date().toISOString(),
    },
    status as 401 | 403 | 429,
  )
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

// ─── Auth Middleware ─────────────────────────────────────────────────────────

/**
 * Hono middleware that validates the session token from the Authorization header.
 * Sets `c.set('session', sessionContext)` on success.
 * Returns 401 on missing/invalid/expired token.
 * Skips validation for the login endpoint (POST /api/v1/auth/login).
 *
 * @param authService - The authentication service for session validation.
 * @returns A Hono middleware function.
 */
export function createAuthMiddleware(
  authService: IAuthService,
): (c: Context, next: Next) => Promise<Response | void> {
  return async (c: Context, next: Next): Promise<Response | void> => {
    // Skip auth for the login endpoint
    if (c.req.method === 'POST' && c.req.path === LOGIN_PATH) {
      return next()
    }

    const token = extractBearerToken(c)
    if (token === null) {
      return createErrorResponse(c, 401, 'UNAUTHORIZED', 'Missing or invalid authorization token')
    }

    const sessionContext = await authService.validateSession(token)
    if (sessionContext === null) {
      return createErrorResponse(c, 401, 'SESSION_EXPIRED', 'Session is invalid or expired')
    }

    c.set('session', sessionContext)
    return next()
  }
}

// ─── CSRF Middleware ─────────────────────────────────────────────────────────

/**
 * Hono middleware that validates the CSRF token for state-changing requests.
 * Checks the `X-CSRF-Token` header against the session's CSRF token.
 * Only applies to POST, PUT, DELETE methods.
 * Skips for GET, HEAD, OPTIONS methods.
 * Returns 403 on missing/invalid CSRF token.
 *
 * @param authService - The authentication service for CSRF token validation.
 * @returns A Hono middleware function.
 */
export function createCsrfMiddleware(
  authService: IAuthService,
): (c: Context, next: Next) => Promise<Response | void> {
  return async (c: Context, next: Next): Promise<Response | void> => {
    // Skip CSRF check for safe methods
    if (!CSRF_METHODS.has(c.req.method)) {
      return next()
    }

    // Skip CSRF for login endpoint (no session yet)
    if (c.req.method === 'POST' && c.req.path === LOGIN_PATH) {
      return next()
    }

    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      return createErrorResponse(c, 403, 'CSRF_INVALID', 'Missing session context')
    }

    const csrfToken = c.req.header('X-CSRF-Token')
    if (csrfToken === undefined) {
      return createErrorResponse(c, 403, 'CSRF_INVALID', 'Missing CSRF token')
    }

    const isValid = authService.validateCsrfToken(session.sessionId, csrfToken)
    if (!isValid) {
      return createErrorResponse(c, 403, 'CSRF_INVALID', 'Invalid CSRF token')
    }

    return next()
  }
}

// ─── Rate-Limit Middleware ───────────────────────────────────────────────────

/**
 * Hono middleware that applies rate limiting to the login endpoint.
 * Checks the rate limit before processing login and records failed attempts afterward.
 * Returns 429 with `Retry-After` header when the username is blocked.
 *
 * @param rateLimiter - The rate limiter instance for tracking login attempts.
 * @returns A Hono middleware function.
 */
export function createRateLimitMiddleware(
  rateLimiter: RateLimiter,
): (c: Context, next: Next) => Promise<Response | void> {
  return async (c: Context, next: Next): Promise<Response | void> => {
    // Only apply to login endpoint
    if (!(c.req.method === 'POST' && c.req.path === LOGIN_PATH)) {
      return next()
    }

    // Clone the request body to read the username without consuming it
    let username: string | undefined
    try {
      const body: unknown = await c.req.json()
      if (body !== null && typeof body === 'object' && 'username' in body) {
        const bodyObj = body as { username: unknown }
        if (typeof bodyObj.username === 'string') {
          username = bodyObj.username
        }
      }
    } catch {
      // If body parsing fails, let the request through — the controller will handle validation
      return next()
    }

    if (username === undefined || username.length === 0) {
      // No username to rate-limit against — let the controller handle validation
      return next()
    }

    // Check if the username is currently rate-limited
    const result = rateLimiter.checkRateLimit(username)
    if (!result.allowed) {
      const retryAfter = result.retryAfter ?? 900
      c.header('Retry-After', String(retryAfter))
      return createErrorResponse(c, 429, 'RATE_LIMITED', `Too many login attempts. Retry after ${String(retryAfter)} seconds`)
    }

    // Process the request
    await next()

    // After the request, check if login failed (4xx status) and record the attempt
    if (c.res.status === 401) {
      rateLimiter.recordFailedAttempt(username)
    } else if (c.res.status >= 200 && c.res.status < 300) {
      // Successful login — reset rate limit for this username
      rateLimiter.reset(username)
    }
  }
}

// ─── Must-Change-Password Middleware ─────────────────────────────────────────

/**
 * Hono middleware that enforces password change for users flagged with `mustChangePassword`.
 * If the user must change their password, all requests are rejected with 403 except
 * `PUT /api/v1/users/me/password` (the password change endpoint).
 * Looks up the user record via the user repository to check the `mustChangePassword` flag.
 *
 * @param userRepository - The user repository for looking up user records.
 * @returns A Hono middleware function.
 */
export function createMustChangePasswordMiddleware(
  userRepository: IUserRepository,
): (c: Context, next: Next) => Promise<Response | void> {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      // No session — let other middleware handle it
      return next()
    }

    // Allow the password change endpoint through
    if (c.req.method === 'PUT' && c.req.path === PASSWORD_CHANGE_PATH) {
      return next()
    }

    // Also allow logout so the user can log out if they choose
    if (c.req.method === 'POST' && c.req.path === '/api/v1/auth/logout') {
      return next()
    }

    // Look up the user to check mustChangePassword flag
    const user = await userRepository.findById(session.userId)
    if (user === null) {
      return createErrorResponse(c, 401, 'UNAUTHORIZED', 'User not found')
    }

    if (user.mustChangePassword) {
      return createErrorResponse(
        c,
        403,
        'PASSWORD_CHANGE_REQUIRED',
        'You must change your password before performing other actions',
      )
    }

    return next()
  }
}
