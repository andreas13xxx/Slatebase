// Public Share Routes — links that let people without a Slatebase account read a note.
//
// Two routers, both mounted by index.ts behind the `public-shares` feature guard:
//
//   Management (session + CSRF, vault access from vault-authorization-middleware.ts):
//     POST   /vaults/:vaultId/public-shares            create a link (token shown once)
//     GET    /vaults/:vaultId/public-shares            links of the vault
//     GET    /vaults/:vaultId/public-shares/preview    what a link for ?path= would include
//     PUT    /vaults/:vaultId/public-shares/:id        change expiry / password
//     DELETE /vaults/:vaultId/public-shares/:id        revoke
//     GET    /public-shares                            the caller's own links across vaults
//     DELETE /public-shares/:id                        revoke an own link (even after losing vault access)
//
//   Reader (no session; the token is the credential — see isPublicSharePath in auth/middleware.ts):
//     GET  /public/s/:token                 the note with its embeds
//     POST /public/s/:token/unlock          password -> signed, link-scoped cookie
//     GET  /public/s/:token/asset?ref=...   an asset the note embeds
//
// The reader never distinguishes an unknown, expired, revoked or orphaned link: all are 404.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import type { AuditAction, IAuditService } from '../audit/index.js'
import type { SessionContext } from '../auth/index.js'
import { resolveCookieSecure } from '../auth/cookies.js'
import type { ILogger } from '../logger/index.js'
import { SlidingWindowRateLimiter } from '../shared/sliding-window-rate-limiter.js'
import {
  PublicShareConflictError,
  PublicShareNotFoundError,
  PublicSharePasswordRequiredError,
  PublicShareValidationError,
  hashToken,
  toPublicShareSummary,
} from '../public-share/index.js'
import type { IPublicShareService } from '../public-share/index.js'
import { isRequestSecure } from './client-ip.js'
import type { TrustedProxyConfig } from './client-ip.js'

function createApiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return { code, message, timestamp: new Date().toISOString() }
}

/** How long an unlock cookie stays valid. */
const UNLOCK_TTL_SECONDS = 30 * 60

/** Content types a browser could execute when opened as a top-level document. */
const INLINE_UNSAFE_TYPES: ReadonlySet<string> = new Set(['image/svg+xml', 'text/html; charset=utf-8', 'application/xml; charset=utf-8'])

/** Route parameter, empty if absent (the router guarantees presence). */
function param(c: Context, name: string): string {
  return c.req.param(name) ?? ''
}

/**
 * Parses a single `Range: bytes=…` request header against a body of `size` bytes.
 * Returns the inclusive byte range, `'unsatisfiable'` for a range outside the body, or `null`
 * when there is no (usable) range — absent, malformed or multi-range headers are ignored and
 * the whole body is sent, which the HTTP spec allows.
 */
export function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  if (header === undefined) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null || (match[1] === '' && match[2] === '')) return null
  const first = match[1] ?? ''
  const last = match[2] ?? ''

  if (first === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(last)
    if (suffix === 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(first)
  if (start >= size) return 'unsatisfiable'
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1)
  if (end < start) return null
  return { start, end }
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createSchema = z.object({
  path: z.string().min(1).max(1024),
  expiresAt: z.string().max(40).optional(),
  password: z.string().max(256).optional(),
})

const updateSchema = z.object({
  expiresAt: z.string().max(40).nullable().optional(),
  password: z.string().max(256).nullable().optional(),
})

const unlockSchema = z.object({ password: z.string().max(256) })

// ─── Management ──────────────────────────────────────────────────────────────

export interface PublicShareManagementDependencies {
  service: IPublicShareService
  auditService: IAuditService
  logger: ILogger
}

/** Routes for creating and managing links; mounted at `/api/v1`. */
export function createPublicShareManagementRoutes(deps: PublicShareManagementDependencies): Hono {
  const { service, auditService, logger } = deps
  const app = new Hono()

  const audit = (c: Context, action: AuditAction, target: string, details?: string): void => {
    const session = c.get('session') as SessionContext
    void auditService
      .log({
        userId: session.userId,
        action,
        target,
        ipAddress: (c.get('clientIp') as string | undefined) ?? '0.0.0.0',
        success: true,
        ...(details === undefined ? {} : { details }),
      })
      .catch((error: unknown) => logger.warn('Public share audit failed', { error: String(error) }))
  }

  const handle = (c: Context, error: unknown): Response => {
    if (error instanceof PublicShareValidationError) return c.json(createApiError('VALIDATION_ERROR', error.message), 400)
    if (error instanceof PublicShareConflictError) return c.json(createApiError('CONFLICT', error.message), 409)
    if (error instanceof PublicShareNotFoundError) return c.json(createApiError('NOT_FOUND', 'Link not found'), 404)
    logger.error('Public share request failed', { error: error instanceof Error ? error.message : String(error) })
    return c.json(createApiError('INTERNAL_ERROR', 'Unexpected error'), 500)
  }

  const parseBody = async <T>(c: Context, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: Response }> => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return { ok: false, response: c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400) }
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return { ok: false, response: c.json(createApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body'), 400) }
    }
    return { ok: true, data: parsed.data }
  }

  app.post('/vaults/:vaultId/public-shares', async (c: Context) => {
    const vaultId = param(c, 'vaultId')
    const body = await parseBody(c, createSchema)
    if (!body.ok) return body.response
    const session = c.get('session') as SessionContext
    try {
      const { share, token } = await service.create({
        vaultId,
        filePath: body.data.path,
        createdBy: session.userId,
        ...(body.data.expiresAt === undefined ? {} : { expiresAt: body.data.expiresAt }),
        ...(body.data.password === undefined ? {} : { password: body.data.password }),
      })
      audit(c, 'PUBLIC_SHARE_CREATED', share.id, `vault ${vaultId}, link …${share.tokenHint}`)
      return c.json({ share: toPublicShareSummary(share), token, path: `/s/${token}` }, 201)
    } catch (error) {
      return handle(c, error)
    }
  })

  app.get('/vaults/:vaultId/public-shares/preview', async (c) => {
    const path = c.req.query('path')
    if (path === undefined || path === '') return c.json(createApiError('VALIDATION_ERROR', 'Missing query parameter: path'), 400)
    try {
      return c.json({ embeds: await service.previewEmbeds(param(c, 'vaultId'), path) }, 200)
    } catch (error) {
      return handle(c, error)
    }
  })

  app.get('/vaults/:vaultId/public-shares', async (c) => {
    return c.json({ shares: await service.listForVault(param(c, 'vaultId')) }, 200)
  })

  app.put('/vaults/:vaultId/public-shares/:id', async (c) => {
    const vaultId = param(c, 'vaultId')
    const id = param(c, 'id')
    const body = await parseBody(c, updateSchema)
    if (!body.ok) return body.response
    try {
      // The ID alone must not let a writer of one vault touch another vault's link.
      const existing = await service.get(id)
      if (existing === null || existing.vaultId !== vaultId) throw new PublicShareNotFoundError()
      const summary = await service.update(id, {
        ...(body.data.expiresAt === undefined ? {} : { expiresAt: body.data.expiresAt }),
        ...(body.data.password === undefined ? {} : { password: body.data.password }),
      })
      audit(c, 'PUBLIC_SHARE_UPDATED', id, `vault ${vaultId}, link …${existing.tokenHint}`)
      return c.json({ share: summary }, 200)
    } catch (error) {
      return handle(c, error)
    }
  })

  // New URL for an existing link; password, expiry and creator stay, the old URL stops working at once.
  app.post('/vaults/:vaultId/public-shares/:id/regenerate', async (c: Context) => {
    const vaultId = param(c, 'vaultId')
    const id = param(c, 'id')
    try {
      const existing = await service.get(id)
      if (existing === null || existing.vaultId !== vaultId) throw new PublicShareNotFoundError()
      const { share, token } = await service.regenerate(id)
      audit(c, 'PUBLIC_SHARE_UPDATED', id, `vault ${vaultId}, link …${existing.tokenHint} replaced by …${share.tokenHint}`)
      return c.json({ share: toPublicShareSummary(share), token, path: `/s/${token}` }, 200)
    } catch (error) {
      return handle(c, error)
    }
  })

  app.delete('/vaults/:vaultId/public-shares/:id', async (c) => {
    const vaultId = param(c, 'vaultId')
    const id = param(c, 'id')
    try {
      const existing = await service.get(id)
      if (existing === null || existing.vaultId !== vaultId) throw new PublicShareNotFoundError()
      await service.revoke(id)
      audit(c, 'PUBLIC_SHARE_REVOKED', id, `vault ${vaultId}, link …${existing.tokenHint}`)
      return c.body(null, 204)
    } catch (error) {
      return handle(c, error)
    }
  })

  app.get('/public-shares', async (c: Context) => {
    const session = c.get('session') as SessionContext
    return c.json({ shares: await service.listForUser(session.userId) }, 200)
  })

  app.delete('/public-shares/:id', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const id = param(c, 'id')
    try {
      const existing = await service.get(id)
      if (existing === null || existing.createdBy !== session.userId) throw new PublicShareNotFoundError()
      await service.revoke(id)
      audit(c, 'PUBLIC_SHARE_REVOKED', id, `vault ${existing.vaultId}, link …${existing.tokenHint}`)
      return c.body(null, 204)
    } catch (error) {
      return handle(c, error)
    }
  })

  return app
}

// ─── Reader ──────────────────────────────────────────────────────────────────

export interface PublicShareReaderDependencies {
  service: IPublicShareService
  auditService: IAuditService
  logger: ILogger
  cookieConfig: TrustedProxyConfig & { cookieSecureMode: 'auto' | 'true' | 'false' }
  /** Requests per minute and IP across all reader routes. */
  requestsPerMinute?: number
  /** Failed password attempts per 15 minutes, per IP and link. */
  passwordAttempts?: number
}

/** Routes the anonymous reader uses; mounted at `/api/v1/public/s`. */
export function createPublicShareReaderRoutes(deps: PublicShareReaderDependencies): Hono {
  const { service, auditService, logger, cookieConfig } = deps
  const app = new Hono()

  const requestLimiter = new SlidingWindowRateLimiter(deps.requestsPerMinute ?? 300, 60_000)
  const passwordLimiter = new SlidingWindowRateLimiter(deps.passwordAttempts ?? 5, 15 * 60_000)
  // Caps how many denied-access audit lines one address can write.
  const deniedAuditLimiter = new SlidingWindowRateLimiter(10, 60_000)
  // One "viewed" audit line per address and link per minute, so reloads do not flood the log.
  const viewAuditLimiter = new SlidingWindowRateLimiter(1, 60_000)
  // Process-local; an unlock cookie simply stops working after a restart (single-instance by design).
  const cookieSecret = randomBytes(32)

  const clientIp = (c: Context): string => (c.get('clientIp') as string | undefined) ?? '0.0.0.0'

  const audit = (c: Context, action: AuditAction, token: string, success: boolean, details?: string): void => {
    const ip = clientIp(c)
    if (!success) {
      if (!deniedAuditLimiter.checkLimit(ip).allowed) return
      deniedAuditLimiter.recordRequest(ip)
    } else if (action === 'PUBLIC_SHARE_ACCESSED') {
      const viewKey = `${ip}|${hashToken(token)}`
      if (!viewAuditLimiter.checkLimit(viewKey).allowed) return
      viewAuditLimiter.recordRequest(viewKey)
    }
    void auditService
      .log({
        userId: null,
        action,
        target: `public link …${token.slice(-4)}`,
        ipAddress: ip,
        success,
        ...(details === undefined ? {} : { details }),
      })
      .catch((error: unknown) => logger.warn('Public share audit failed', { error: String(error) }))
  }

  const cookieName = (token: string): string => `sb_share_${hashToken(token).slice(0, 16)}`
  const cookiePath = (token: string): string => `/api/v1/public/s/${token}`

  const sign = (token: string, expires: number, unlockVersion: string): string =>
    createHmac('sha256', cookieSecret).update(`${hashToken(token)}|${expires}|${unlockVersion}`).digest('base64url')

  const isUnlocked = async (c: Context, token: string): Promise<boolean> => {
    const value = getCookie(c, cookieName(token))
    if (value === undefined) return false
    const [expiresText, signature] = value.split('.')
    const expires = Number(expiresText)
    if (signature === undefined || !Number.isFinite(expires) || expires < Date.now()) return false
    const unlockVersion = await service.unlockVersion(token)
    if (unlockVersion === null) return false
    const expected = Buffer.from(sign(token, expires, unlockVersion))
    const actual = Buffer.from(signature)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  // Every reader response: rate limit, never cached, never indexed.
  app.use('*', async (c: Context, next: Next): Promise<Response | void> => {
    const ip = clientIp(c)
    const limit = requestLimiter.checkLimit(ip)
    if (!limit.allowed) {
      c.header('Retry-After', String(limit.retryAfter))
      c.header('Cache-Control', 'no-store')
      return c.json(createApiError('RATE_LIMITED', 'Too many requests'), 429)
    }
    requestLimiter.recordRequest(ip)
    await next()
    c.header('Cache-Control', 'no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow')
  })

  const notFound = (c: Context): Response => c.json(createApiError('NOT_FOUND', 'Not found'), 404)

  const handle = (c: Context, token: string, error: unknown): Response => {
    if (error instanceof PublicShareNotFoundError) {
      audit(c, 'PUBLIC_SHARE_DENIED', token, false, 'not found')
      return notFound(c)
    }
    if (error instanceof PublicSharePasswordRequiredError) {
      return c.json(createApiError('PASSWORD_REQUIRED', 'Password required'), 401)
    }
    logger.error('Public share read failed', { error: error instanceof Error ? error.message : String(error) })
    return c.json(createApiError('INTERNAL_ERROR', 'Unexpected error'), 500)
  }

  app.get('/:token', async (c) => {
    const token = param(c, 'token')
    try {
      const view = await service.getNote(token, { unlocked: await isUnlocked(c, token) })
      audit(c, 'PUBLIC_SHARE_ACCESSED', token, true)
      return c.json(view, 200)
    } catch (error) {
      return handle(c, token, error)
    }
  })

  app.post('/:token/unlock', async (c) => {
    const token = param(c, 'token')
    const ip = clientIp(c)
    const attemptKey = `${ip}|${hashToken(token)}`

    // Check and count in one synchronous step, before any await: scrypt and the body read
    // yield to other requests, so counting only after a failure would let a burst of parallel
    // guesses all pass the check. A correct password clears the count again.
    const blocked = passwordLimiter.checkLimit(attemptKey)
    if (!blocked.allowed) {
      c.header('Retry-After', String(blocked.retryAfter))
      return c.json(createApiError('RATE_LIMITED', 'Too many attempts'), 429)
    }
    passwordLimiter.recordRequest(attemptKey)

    let parsed: z.infer<typeof unlockSchema>
    try {
      parsed = unlockSchema.parse(await c.req.json())
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid body'), 400)
    }

    const unlockVersion = await service.unlockVersion(token)
    if (unlockVersion === null) {
      // Unknown token, or a link without a password: indistinguishable from "not found".
      return handle(c, token, new PublicShareNotFoundError())
    }

    if (!(await service.verifyPassword(token, parsed.password))) {
      audit(c, 'PUBLIC_SHARE_DENIED', token, false, 'wrong password')
      return c.json(createApiError('INVALID_PASSWORD', 'Wrong password'), 401)
    }

    passwordLimiter.clear(attemptKey)
    const expires = Date.now() + UNLOCK_TTL_SECONDS * 1000
    setCookie(c, cookieName(token), `${expires}.${sign(token, expires, unlockVersion)}`, {
      httpOnly: true,
      sameSite: 'Strict',
      path: cookiePath(token),
      maxAge: UNLOCK_TTL_SECONDS,
      secure: resolveCookieSecure(cookieConfig.cookieSecureMode, isRequestSecure(c, cookieConfig)),
    })
    return c.body(null, 204)
  })

  app.get('/:token/asset', async (c) => {
    const token = param(c, 'token')
    const ref = c.req.query('ref')
    if (ref === undefined || ref === '') return notFound(c)
    try {
      const asset = await service.getAsset(token, ref, { unlocked: await isUnlocked(c, token) })
      const headers: Record<string, string> = {
        'Content-Type': asset.contentType,
        // SVG/HTML/XML could run script if opened as a document; as <img> they stay inert.
        'Content-Disposition': INLINE_UNSAFE_TYPES.has(asset.contentType) ? 'attachment' : 'inline',
        // Browsers need ranges to seek in audio/video (Safari refuses to play without them).
        'Accept-Ranges': 'bytes',
      }
      const range = parseByteRange(c.req.header('Range'), asset.data.length)
      if (range === 'unsatisfiable') {
        return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${asset.data.length}` } })
      }
      if (range !== null) {
        const part = asset.data.subarray(range.start, range.end + 1)
        return new Response(new Uint8Array(part), {
          status: 206,
          headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${asset.data.length}`, 'Content-Length': String(part.length) },
        })
      }
      return new Response(new Uint8Array(asset.data), {
        status: 200,
        headers: { ...headers, 'Content-Length': String(asset.data.length) },
      })
    } catch (error) {
      return handle(c, token, error)
    }
  })

  return app
}
