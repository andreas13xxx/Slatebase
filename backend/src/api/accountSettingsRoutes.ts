/**
 * Admin routes for the account settings (SMTP, mail link base, passkey rpId).
 *
 * - GET  /admin/account-settings
 * - PUT  /admin/account-settings
 * - POST /admin/account-settings/test
 *
 * The SMTP password is write-only: it is never returned, only `smtpPasswordSet`.
 */

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import { normalizeOrigin, resolveMailBaseUrl, validatePasskeyRpId } from '../account/origin.js'
import type { IMailService } from '../account/mail-service.js'
import type { IAccountSettingsStore } from '../account/settings-store.js'
import { smtpSettingsSchema } from '../account/settings-store.js'
import type { IAuditService } from '../audit/index.js'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'

function clientIpOf(c: Context): string {
  return (c.get('clientIp') as string | undefined) ?? '0.0.0.0'
}

function createApiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return { code, message, timestamp: new Date().toISOString() }
}

const updateSchema = z.object({
  smtp: smtpSettingsSchema,
  mailBaseUrl: z.string().max(2048),
  passkeyRpId: z.string().max(253),
  /** undefined = keep the stored password, '' = remove it. */
  smtpPassword: z.string().max(1024).optional(),
})

const testSchema = z.object({ to: z.string().min(3).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) })

export interface AccountSettingsRoutesDeps {
  settings: IAccountSettingsStore
  mailService: IMailService
  getAllowedOrigins: () => readonly string[]
  logger: ILogger
  auditService?: IAuditService
}

export function createAccountSettingsRoutes(deps: AccountSettingsRoutesDeps): Hono {
  const { settings, mailService, logger } = deps
  const app = new Hono()

  function requireAdmin(c: Context): SessionContext | Response {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) return c.json(createApiError('UNAUTHORIZED', 'Not authenticated'), 401)
    if (session.role !== 'admin') return c.json(createApiError('FORBIDDEN', 'Admin role required'), 403)
    return session
  }

  async function view() {
    const current = await settings.get()
    const allowedOrigins = deps.getAllowedOrigins()
    return {
      ...current,
      smtpPasswordSet: await settings.hasSmtpPassword(),
      resolvedMailBaseUrl: resolveMailBaseUrl(current.mailBaseUrl, allowedOrigins),
      allowedOrigins: [...allowedOrigins],
    }
  }

  app.get('/admin/account-settings', async (c) => {
    const session = requireAdmin(c)
    if (session instanceof Response) return session
    return c.json(await view(), 200)
  })

  app.put('/admin/account-settings', async (c) => {
    const session = requireAdmin(c)
    if (session instanceof Response) return session
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(createApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input'), 400)
    }
    const { smtp, smtpPassword } = parsed.data
    const allowedOrigins = deps.getAllowedOrigins()

    let mailBaseUrl = parsed.data.mailBaseUrl.trim()
    if (mailBaseUrl !== '') {
      const normalized = normalizeOrigin(mailBaseUrl)
      if (normalized === null || resolveMailBaseUrl(normalized, allowedOrigins) === null) {
        return c.json(createApiError('VALIDATION_ERROR', 'mailBaseUrl must be one of the allowed origins'), 400)
      }
      mailBaseUrl = normalized
    }
    const rpIdError = validatePasskeyRpId(parsed.data.passkeyRpId, allowedOrigins)
    if (rpIdError !== null) return c.json(createApiError('VALIDATION_ERROR', rpIdError), 400)

    await settings.update(
      { smtp, mailBaseUrl, passkeyRpId: parsed.data.passkeyRpId.trim().toLowerCase() },
      smtpPassword,
    )
    await deps.auditService?.log({
      userId: session.userId,
      action: 'ACCOUNT_SETTINGS_CHANGED',
      target: 'account-settings',
      ipAddress: clientIpOf(c),
      success: true,
      ...(smtpPassword === undefined ? {} : { details: smtpPassword === '' ? 'smtp password removed' : 'smtp password set' }),
    })
    return c.json(await view(), 200)
  })

  app.post('/admin/account-settings/test', async (c) => {
    const session = requireAdmin(c)
    if (session instanceof Response) return session
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }
    const parsed = testSchema.safeParse(body)
    if (!parsed.success) return c.json(createApiError('VALIDATION_ERROR', 'A valid recipient address is required'), 400)
    try {
      await mailService.send({
        to: parsed.data.to,
        subject: 'Slatebase: SMTP test',
        text: 'This is a test mail from Slatebase. SMTP delivery works.',
      })
      return c.json({ ok: true }, 200)
    } catch (err) {
      // The SMTP error is shown to the admin (host unreachable, auth failed, ...); it contains no secrets.
      const message = err instanceof Error ? err.message : String(err)
      logger.warn('SMTP test failed', { error: message })
      return c.json(createApiError('SMTP_TEST_FAILED', message), 502)
    }
  })

  return app
}
