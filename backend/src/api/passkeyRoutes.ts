/**
 * Passkey routes (WebAuthn).
 *
 * Public (no session, no CSRF — the `Origin` header is checked instead):
 * - POST /auth/passkey/login/options
 * - POST /auth/passkey/login/verify
 *
 * Authenticated:
 * - POST   /auth/passkey/register/options   (re-auth with password)
 * - POST   /auth/passkey/register/verify
 * - PATCH  /users/me/passkeys/:id
 * - DELETE /users/me/passkeys/:id
 *
 * Admin:
 * - DELETE /admin/users/:userId/passkeys
 */

import type { Context } from 'hono'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { z } from 'zod'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { RelyingParty } from '../account/origin.js'
import type { IPasskeyService } from '../account/passkey-service.js'
import { PasskeyError } from '../account/passkey-service.js'
import type { SessionContext } from '../auth/index.js'
import { SESSION_COOKIE_NAME, resolveCookieSecure } from '../auth/cookies.js'
import type { ILogger } from '../logger/index.js'
import { AccountSuspendedError } from '../user/index.js'
import type { CookieConfig } from './authRoutes.js'
import { isRequestSecure } from './client-ip.js'

function createApiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return { code, message, timestamp: new Date().toISOString() }
}

// The WebAuthn payloads are validated structurally by @simplewebauthn; here we only
// bound their size and shape so arbitrary JSON never reaches the library.
const credentialJson = z.object({ id: z.string().min(1).max(1400), rawId: z.string().max(2800), type: z.literal('public-key') }).passthrough()

const registerOptionsSchema = z.object({ password: z.string().min(1).max(256) })
const registerVerifySchema = z.object({
  challengeId: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
  response: credentialJson,
})
const loginVerifySchema = z.object({ challengeId: z.string().min(1).max(128), response: credentialJson })
const renameSchema = z.object({ name: z.string().min(1).max(64) })
const idParamSchema = z.string().min(1).max(64)

export interface PasskeyRoutesDeps {
  passkeys: IPasskeyService
  logger: ILogger
  cookieConfig: CookieConfig
  /** Resolves the relying party for the request's Origin header, or null if it is not allowed. */
  resolveRelyingParty: (originHeader: string | undefined) => Promise<RelyingParty | null>
}

export function createPasskeyRoutes(deps: PasskeyRoutesDeps): Hono {
  const { passkeys, logger, cookieConfig } = deps
  const app = new Hono()

  const clientIp = (c: Context): string => (c.get('clientIp') as string | undefined) ?? '0.0.0.0'

  async function readJson(c: Context): Promise<unknown> {
    try {
      return await c.req.json()
    } catch {
      return undefined
    }
  }

  function handleError(c: Context, err: unknown): Response {
    if (err instanceof PasskeyError) {
      switch (err.code) {
        case 'RATE_LIMITED':
          if (err.retryAfter !== undefined) c.header('Retry-After', String(err.retryAfter))
          return c.json(createApiError(err.code, err.message), 429)
        case 'LOGIN_FAILED':
          return c.json(createApiError(err.code, err.message), 401)
        case 'NOT_FOUND':
          return c.json(createApiError(err.code, err.message), 404)
        case 'DUPLICATE_CREDENTIAL':
          return c.json(createApiError(err.code, err.message), 409)
        default:
          return c.json(createApiError(err.code, err.message), 400)
      }
    }
    if (err instanceof AccountSuspendedError) {
      return c.json(createApiError('ACCOUNT_SUSPENDED', 'Account is suspended'), 403)
    }
    logger.error('Unexpected error in passkey routes', { message: err instanceof Error ? err.message : String(err) })
    return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
  }

  async function relyingParty(c: Context): Promise<RelyingParty | Response> {
    const rp = await deps.resolveRelyingParty(c.req.header('Origin'))
    if (rp === null) {
      return c.json(createApiError('ORIGIN_NOT_ALLOWED', 'This origin is not allowed for passkeys'), 403)
    }
    return rp
  }

  function requireSession(c: Context): SessionContext | Response {
    const session = c.get('session') as SessionContext | undefined
    return session ?? c.json(createApiError('UNAUTHORIZED', 'Not authenticated'), 401)
  }

  // ─── Login (public) ──────────────────────────────────────────────────────

  app.post('/auth/passkey/login/options', async (c) => {
    const rp = await relyingParty(c)
    if (rp instanceof Response) return rp
    try {
      return c.json(await passkeys.beginLogin(rp), 200)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/auth/passkey/login/verify', async (c) => {
    const rp = await relyingParty(c)
    if (rp instanceof Response) return rp
    const parsed = loginVerifySchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json(createApiError('VALIDATION_ERROR', 'Invalid input'), 400)
    try {
      const result = await passkeys.finishLogin(
        parsed.data.challengeId,
        parsed.data.response as unknown as AuthenticationResponseJSON,
        rp,
        { ipAddress: clientIp(c), userAgent: c.req.header('User-Agent') ?? 'unknown' },
      )
      setCookie(c, SESSION_COOKIE_NAME, result.token, {
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        secure: resolveCookieSecure(cookieConfig.cookieSecureMode, isRequestSecure(c, cookieConfig)),
        maxAge: cookieConfig.sessionMaxLifetimeDays * 24 * 60 * 60,
      })
      return c.json(result, 200)
    } catch (err) {
      return handleError(c, err)
    }
  })

  // ─── Registration & management (session) ────────────────────────────────

  app.post('/auth/passkey/register/options', async (c) => {
    const session = requireSession(c)
    if (session instanceof Response) return session
    const rp = await relyingParty(c)
    if (rp instanceof Response) return rp
    const parsed = registerOptionsSchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json(createApiError('VALIDATION_ERROR', 'Invalid input'), 400)
    try {
      return c.json(await passkeys.beginRegistration(session.userId, parsed.data.password, rp), 200)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.post('/auth/passkey/register/verify', async (c) => {
    const session = requireSession(c)
    if (session instanceof Response) return session
    const rp = await relyingParty(c)
    if (rp instanceof Response) return rp
    const parsed = registerVerifySchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json(createApiError('VALIDATION_ERROR', 'Invalid input'), 400)
    try {
      const info = await passkeys.finishRegistration(
        session.userId,
        parsed.data.challengeId,
        parsed.data.response as unknown as RegistrationResponseJSON,
        parsed.data.name,
        rp,
        clientIp(c),
      )
      return c.json(info, 201)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.patch('/users/me/passkeys/:id', async (c) => {
    const session = requireSession(c)
    if (session instanceof Response) return session
    const id = idParamSchema.safeParse(c.req.param('id'))
    const parsed = renameSchema.safeParse(await readJson(c))
    if (!id.success || !parsed.success) return c.json(createApiError('VALIDATION_ERROR', 'Invalid input'), 400)
    try {
      return c.json(await passkeys.rename(session.userId, id.data, parsed.data.name), 200)
    } catch (err) {
      return handleError(c, err)
    }
  })

  app.delete('/users/me/passkeys/:id', async (c) => {
    const session = requireSession(c)
    if (session instanceof Response) return session
    const id = idParamSchema.safeParse(c.req.param('id'))
    if (!id.success) return c.json(createApiError('VALIDATION_ERROR', 'Invalid input'), 400)
    try {
      await passkeys.remove(session.userId, id.data, clientIp(c))
      return c.body(null, 204)
    } catch (err) {
      return handleError(c, err)
    }
  })

  // ─── Admin ───────────────────────────────────────────────────────────────

  app.delete('/admin/users/:userId/passkeys', async (c) => {
    const session = requireSession(c)
    if (session instanceof Response) return session
    if (session.role !== 'admin') return c.json(createApiError('FORBIDDEN', 'Admin role required'), 403)
    const userId = idParamSchema.safeParse(c.req.param('userId'))
    if (!userId.success) return c.json(createApiError('VALIDATION_ERROR', 'Invalid input'), 400)
    try {
      const removed = await passkeys.removeAll(userId.data, session.userId, clientIp(c))
      return c.json({ removed }, 200)
    } catch (err) {
      return handleError(c, err)
    }
  })

  return app
}
