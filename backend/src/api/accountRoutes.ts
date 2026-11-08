/**
 * Account routes — mail confirmation, password reset by mail, security overview,
 * and the public capability probe used by the login page.
 *
 * Public (no session, no CSRF — see isPublicAuthPath in auth/middleware.ts):
 * - GET  /auth/capabilities
 * - POST /auth/password-reset/request
 * - POST /auth/password-reset/confirm
 * - POST /auth/email/verify
 *
 * Authenticated:
 * - GET  /users/me/security
 * - PUT  /users/me/email
 */

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { IAccountRecoveryService } from '../account/account-recovery-service.js'
import { AccountFlowError } from '../account/account-recovery-service.js'
import type { IPasskeyService } from '../account/passkey-service.js'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import { UserValidationError } from '../user/index.js'

function createApiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return { code, message, timestamp: new Date().toISOString() }
}

const tokenSchema = z.string().min(3).max(256)

const resetRequestSchema = z.object({ identifier: z.string().min(1).max(254) })
const resetConfirmSchema = z.object({ token: tokenSchema, password: z.string().min(1).max(256) })
const verifySchema = z.object({ token: tokenSchema })
const emailChangeSchema = z.object({ email: z.string().min(3).max(254), password: z.string().min(1).max(256) })

export interface AccountRoutesDeps {
  recovery: IAccountRecoveryService
  passkeys: IPasskeyService
  logger: ILogger
  /** Whether the passkey login can be offered for the request's `Origin` header. */
  isPasskeyAvailable: (originHeader: string | undefined) => Promise<boolean>
}

export function createAccountRoutes(deps: AccountRoutesDeps): Hono {
  const { recovery, passkeys, logger } = deps
  const app = new Hono()

  const sessionOf = (c: Context): SessionContext | undefined => c.get('session') as SessionContext | undefined
  const clientIp = (c: Context): string => (c.get('clientIp') as string | undefined) ?? '0.0.0.0'

  async function readJson(c: Context): Promise<unknown> {
    try {
      return await c.req.json()
    } catch {
      return undefined
    }
  }

  function handleError(c: Context, err: unknown): Response {
    if (err instanceof AccountFlowError) {
      switch (err.code) {
        case 'RATE_LIMITED':
          if (err.retryAfter !== undefined) c.header('Retry-After', String(err.retryAfter))
          return c.json(createApiError(err.code, err.message), 429)
        case 'MAIL_NOT_CONFIGURED':
          return c.json(createApiError(err.code, err.message), 409)
        default:
          return c.json(createApiError(err.code, err.message), 400)
      }
    }
    if (err instanceof UserValidationError) {
      return c.json(createApiError(err.code, err.message), 400)
    }
    logger.error('Unexpected error in account routes', { message: err instanceof Error ? err.message : String(err) })
    return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
  }

  // ─── Public ──────────────────────────────────────────────────────────────

  // Browsers send no `Origin` on same-origin GETs, so the login page passes
  // `?origin=<location.origin>`. It is a display hint only: it is checked against
  // allowedOrigins, and the passkey endpoints themselves require the real header.
  app.get('/auth/capabilities', async (c) => {
    const [passwordReset, passkey] = await Promise.all([
      recovery.isResetAvailable(),
      deps.isPasskeyAvailable(c.req.query('origin') ?? c.req.header('Origin')),
    ])
    return c.json({ passwordReset, passkey }, 200)
  })

  app.post('/auth/password-reset/request', async (c) => {
    const parsed = resetRequestSchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json(createApiError('VALIDATION_ERROR', 'Invalid input'), 400)
    try {
      await recovery.requestPasswordReset(parsed.data.identifier, clientIp(c))
      // Identical answer for known and unknown accounts.
      return c.json({ ok: true }, 202)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/auth/password-reset/confirm', async (c) => {
    const parsed = resetConfirmSchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json(createApiError('VALIDATION_ERROR', 'Invalid input'), 400)
    try {
      await recovery.confirmPasswordReset(parsed.data.token, parsed.data.password, clientIp(c))
      return c.body(null, 204)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/auth/email/verify', async (c) => {
    const parsed = verifySchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json(createApiError('VALIDATION_ERROR', 'Invalid input'), 400)
    try {
      await recovery.verifyEmail(parsed.data.token, clientIp(c))
      return c.body(null, 204)
    } catch (err) {
      return handleError(c, err)
    }
  })

  // ─── Authenticated ───────────────────────────────────────────────────────

  app.get('/users/me/security', async (c) => {
    const session = sessionOf(c)
    if (session === undefined) return c.json(createApiError('UNAUTHORIZED', 'Not authenticated'), 401)
    try {
      const [state, list, mailAvailable] = await Promise.all([
        recovery.getSecurityState(session.userId),
        passkeys.list(session.userId),
        recovery.isResetAvailable(),
      ])
      return c.json({ ...state, passkeys: list, mailAvailable }, 200)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.put('/users/me/email', async (c) => {
    const session = sessionOf(c)
    if (session === undefined) return c.json(createApiError('UNAUTHORIZED', 'Not authenticated'), 401)
    const parsed = emailChangeSchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json(createApiError('VALIDATION_ERROR', 'Invalid input'), 400)
    try {
      await recovery.requestEmailChange(session.userId, parsed.data.password, parsed.data.email)
      return c.json({ ok: true }, 202)
    } catch (err) {
      return handleError(c, err)
    }
  })

  return app
}
