import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { AccountFlowError } from '../account/account-recovery-service.js'
import type { IAccountRecoveryService } from '../account/account-recovery-service.js'
import type { IMailService } from '../account/mail-service.js'
import { PasskeyError } from '../account/passkey-service.js'
import type { IPasskeyService } from '../account/passkey-service.js'
import { resolveRelyingParty } from '../account/origin.js'
import { DEFAULT_ACCOUNT_SETTINGS } from '../account/settings-store.js'
import type { AccountSettings, IAccountSettingsStore } from '../account/settings-store.js'
import { silentLogger } from '../account/test-support.js'
import type { SessionContext } from '../auth/index.js'
import { createAccountRoutes } from './accountRoutes.js'
import { createAccountSettingsRoutes } from './accountSettingsRoutes.js'
import { createPasskeyRoutes } from './passkeyRoutes.js'

const ORIGINS = ['https://notes.example.org', 'https://intern.example.org']

function session(role: 'admin' | 'user' = 'user'): SessionContext {
  return { userId: 'user-1', username: 'alice', role, sessionId: 's1', expiresAt: '2030-01-01T00:00:00.000Z' }
}

function wrap(routes: Hono, ctx: SessionContext | null): Hono {
  const app = new Hono()
  app.use('*', async (c, next) => {
    if (ctx !== null) c.set('session' as never, ctx as never)
    c.set('clientIp' as never, '10.0.0.1' as never)
    await next()
  })
  app.route('/api/v1', routes)
  return app
}

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

function recoveryMock(overrides: Partial<IAccountRecoveryService> = {}): IAccountRecoveryService {
  return {
    isResetAvailable: async () => true,
    getSecurityState: async () => ({ email: 'a@example.org', emailVerified: true, pendingEmail: null }),
    requestEmailChange: vi.fn(async () => {}),
    verifyEmail: vi.fn(async () => {}),
    requestPasswordReset: vi.fn(async () => {}),
    confirmPasswordReset: vi.fn(async () => {}),
    ...overrides,
  }
}

function passkeysMock(overrides: Partial<IPasskeyService> = {}): IPasskeyService {
  return {
    list: async () => [],
    beginRegistration: vi.fn(async () => ({ challengeId: 'c1', options: {} as never })),
    finishRegistration: vi.fn(async () => ({ id: 'p1', name: 'Laptop', rpId: 'notes.example.org', createdAt: '', lastUsedAt: null, transports: [] })),
    rename: vi.fn(async () => ({ id: 'p1', name: 'Phone', rpId: 'notes.example.org', createdAt: '', lastUsedAt: null, transports: [] })),
    remove: vi.fn(async () => {}),
    removeAll: vi.fn(async () => 2),
    beginLogin: vi.fn(async () => ({ challengeId: 'c2', options: { challenge: 'x' } as never })),
    finishLogin: vi.fn(async () => ({ token: 'tok', csrfToken: 'csrf', user: {} as never, expiresAt: '2030-01-01T00:00:00.000Z' })),
    ...overrides,
  }
}

describe('account routes', () => {
  function build(recovery = recoveryMock(), passkeys = passkeysMock(), ctx: SessionContext | null = session()) {
    return wrap(
      createAccountRoutes({
        recovery,
        passkeys,
        logger: silentLogger(),
        isPasskeyAvailable: async (origin) => resolveRelyingParty(origin, ORIGINS, '') !== null,
      }),
      ctx,
    )
  }

  it('reports capabilities based on the origin hint', async () => {
    const app = build()
    const ok = await app.request('/api/v1/auth/capabilities?origin=https://notes.example.org')
    expect(await ok.json()).toEqual({ passwordReset: true, passkey: true })
    const foreign = await app.request('/api/v1/auth/capabilities?origin=https://evil.example.com')
    expect(await foreign.json()).toEqual({ passwordReset: true, passkey: false })
  })

  it('answers a reset request identically for any identifier', async () => {
    const recovery = recoveryMock()
    const app = build(recovery)
    const known = await app.request('/api/v1/auth/password-reset/request', json({ identifier: 'alice' }))
    const unknown = await app.request('/api/v1/auth/password-reset/request', json({ identifier: 'nobody' }))
    expect(known.status).toBe(202)
    expect(unknown.status).toBe(202)
    expect(await known.json()).toEqual(await unknown.json())
    expect(recovery.requestPasswordReset).toHaveBeenCalledWith('alice', '10.0.0.1')
  })

  it('maps rate limiting and unavailable mail to 429 and 409', async () => {
    const limited = build(recoveryMock({ requestPasswordReset: async () => { throw new AccountFlowError('RATE_LIMITED', 'slow down', 42) } }))
    const res = await limited.request('/api/v1/auth/password-reset/request', json({ identifier: 'a' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')

    const off = build(recoveryMock({ requestPasswordReset: async () => { throw new AccountFlowError('MAIL_NOT_CONFIGURED', 'off') } }))
    expect((await off.request('/api/v1/auth/password-reset/request', json({ identifier: 'a' }))).status).toBe(409)
  })

  it('confirms a reset and maps an invalid token to 400', async () => {
    const recovery = recoveryMock()
    const app = build(recovery)
    expect((await app.request('/api/v1/auth/password-reset/confirm', json({ token: 'u.abc', password: 'long-enough-password' }))).status).toBe(204)
    const bad = build(recoveryMock({ confirmPasswordReset: async () => { throw new AccountFlowError('INVALID_TOKEN', 'bad') } }))
    const res = await bad.request('/api/v1/auth/password-reset/confirm', json({ token: 'u.abc', password: 'long-enough-password' }))
    expect(res.status).toBe(400)
    expect((await res.json() as { code: string }).code).toBe('INVALID_TOKEN')
  })

  it('rejects malformed bodies', async () => {
    const app = build()
    expect((await app.request('/api/v1/auth/password-reset/request', { method: 'POST', body: 'not json' })).status).toBe(400)
    expect((await app.request('/api/v1/auth/email/verify', json({}))).status).toBe(400)
  })

  it('verifies an address by token', async () => {
    const recovery = recoveryMock()
    const res = await build(recovery).request('/api/v1/auth/email/verify', json({ token: 'u.abc' }))
    expect(res.status).toBe(204)
    expect(recovery.verifyEmail).toHaveBeenCalledWith('u.abc', '10.0.0.1')
  })

  it('serves the security overview only to a signed-in user', async () => {
    const res = await build().request('/api/v1/users/me/security')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ email: 'a@example.org', emailVerified: true, passkeys: [], mailAvailable: true })
    expect((await build(undefined, undefined, null).request('/api/v1/users/me/security')).status).toBe(401)
  })

  it('starts an address change with the password', async () => {
    const recovery = recoveryMock()
    const res = await build(recovery).request('/api/v1/users/me/email', { ...json({ email: 'new@example.org', password: 'pw' }), method: 'PUT' })
    expect(res.status).toBe(202)
    expect(recovery.requestEmailChange).toHaveBeenCalledWith('user-1', 'pw', 'new@example.org')
  })
})

describe('passkey routes', () => {
  const cookieConfig = { trustedProxies: [], cookieSecureMode: 'true' as const, sessionMaxLifetimeDays: 7 }

  function build(passkeys = passkeysMock(), ctx: SessionContext | null = session()) {
    return wrap(
      createPasskeyRoutes({
        passkeys,
        logger: silentLogger(),
        cookieConfig,
        resolveRelyingParty: async (origin) => resolveRelyingParty(origin, ORIGINS, ''),
      }),
      ctx,
    )
  }

  const ORIGIN = { Origin: 'https://notes.example.org' }
  const credential = { id: 'abc', rawId: 'abc', type: 'public-key', response: {}, clientExtensionResults: {} }

  it('refuses ceremonies from origins that are not allowed or missing', async () => {
    const app = build()
    expect((await app.request('/api/v1/auth/passkey/login/options', json({}, { Origin: 'https://evil.example.com' }))).status).toBe(403)
    expect((await app.request('/api/v1/auth/passkey/login/options', json({}))).status).toBe(403)
  })

  it('issues login options for an allowed origin', async () => {
    const passkeys = passkeysMock()
    const res = await build(passkeys, null).request('/api/v1/auth/passkey/login/options', json({}, ORIGIN))
    expect(res.status).toBe(200)
    expect(passkeys.beginLogin).toHaveBeenCalledWith({ origin: 'https://notes.example.org', rpId: 'notes.example.org' }, '10.0.0.1')
  })

  it('sets the session cookie on a successful passkey login', async () => {
    const res = await build(passkeysMock(), null).request('/api/v1/auth/passkey/login/verify', json({ challengeId: 'c2', response: credential }, ORIGIN))
    expect(res.status).toBe(200)
    const cookie = res.headers.get('Set-Cookie') ?? ''
    expect(cookie).toContain('tok')
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
  })

  it('returns a generic 401 for failed logins and 403 for suspended accounts', async () => {
    const failing = build(passkeysMock({ finishLogin: async () => { throw new PasskeyError('LOGIN_FAILED', 'Sign-in failed') } }), null)
    const res = await failing.request('/api/v1/auth/passkey/login/verify', json({ challengeId: 'c2', response: credential }, ORIGIN))
    expect(res.status).toBe(401)
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('requires a session for registration and management', async () => {
    const app = build(passkeysMock(), null)
    expect((await app.request('/api/v1/auth/passkey/register/options', json({ password: 'pw' }, ORIGIN))).status).toBe(401)
    expect((await app.request('/api/v1/users/me/passkeys/p1', { method: 'DELETE' })).status).toBe(401)
  })

  it('registers, renames and removes a passkey', async () => {
    const passkeys = passkeysMock()
    const app = build(passkeys)
    expect((await app.request('/api/v1/auth/passkey/register/options', json({ password: 'pw' }, ORIGIN))).status).toBe(200)
    expect((await app.request('/api/v1/auth/passkey/register/verify', json({ challengeId: 'c1', name: 'Laptop', response: credential }, ORIGIN))).status).toBe(201)
    expect((await app.request('/api/v1/users/me/passkeys/p1', { ...json({ name: 'Phone' }), method: 'PUT' })).status).toBe(200)
    expect((await app.request('/api/v1/users/me/passkeys/p1', { method: 'DELETE' })).status).toBe(204)
    expect(passkeys.remove).toHaveBeenCalledWith('user-1', 'p1', '10.0.0.1')
  })

  it('maps a wrong re-auth password to 400', async () => {
    const app = build(passkeysMock({ beginRegistration: async () => { throw new PasskeyError('INVALID_PASSWORD', 'Password is incorrect') } }))
    expect((await app.request('/api/v1/auth/passkey/register/options', json({ password: 'bad' }, ORIGIN))).status).toBe(400)
  })

  it('lets only admins remove all passkeys of an account', async () => {
    const passkeys = passkeysMock()
    expect((await build(passkeys, session('user')).request('/api/v1/admin/users/u2/passkeys', { method: 'DELETE' })).status).toBe(403)
    const res = await build(passkeys, session('admin')).request('/api/v1/admin/users/u2/passkeys', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ removed: 2 })
    expect(passkeys.removeAll).toHaveBeenCalledWith('u2', 'user-1', '10.0.0.1')
  })
})

describe('account settings routes', () => {
  function build(ctx: SessionContext | null = session('admin'), mail: Partial<IMailService> = {}) {
    let stored: AccountSettings = { ...DEFAULT_ACCOUNT_SETTINGS }
    let password: string | null = null
    const settings: IAccountSettingsStore = {
      get: async () => stored,
      update: async (next, smtpPassword) => {
        stored = next
        if (smtpPassword !== undefined) password = smtpPassword === '' ? null : smtpPassword
      },
      getSmtpPassword: async () => password,
      hasSmtpPassword: async () => password !== null,
    }
    const mailService: IMailService = { isConfigured: async () => true, send: vi.fn(async () => {}), ...mail }
    const app = wrap(createAccountSettingsRoutes({ settings, mailService, getAllowedOrigins: () => ORIGINS, logger: silentLogger() }), ctx)
    return { app, mailService }
  }

  const valid = {
    smtp: { host: 'smtp.example.org', port: 587, encryption: 'starttls', username: 'mailer', from: 'Slatebase <no-reply@example.org>' },
    mailBaseUrl: 'https://notes.example.org',
    passkeyRpId: 'example.org',
    smtpPassword: 'hunter2',
  }

  it('is admin only', async () => {
    expect((await build(session('user')).app.request('/api/v1/admin/account-settings')).status).toBe(403)
    expect((await build(null).app.request('/api/v1/admin/account-settings')).status).toBe(401)
  })

  it('stores settings and never returns the SMTP password', async () => {
    const { app } = build()
    const put = await app.request('/api/v1/admin/account-settings', { ...json(valid), method: 'PUT' })
    expect(put.status).toBe(200)
    const body = await put.json() as Record<string, unknown>
    expect(body['smtpPasswordSet']).toBe(true)
    expect(JSON.stringify(body)).not.toContain('hunter2')
    expect(body['resolvedMailBaseUrl']).toBe('https://notes.example.org')

    const get = await app.request('/api/v1/admin/account-settings')
    expect(JSON.stringify(await get.json())).not.toContain('hunter2')
  })

  it('keeps the stored password when none is sent and clears it with an empty string', async () => {
    const { app } = build()
    await app.request('/api/v1/admin/account-settings', { ...json(valid), method: 'PUT' })
    const { smtpPassword: _omit, ...withoutPassword } = valid
    const kept = await (await app.request('/api/v1/admin/account-settings', { ...json(withoutPassword), method: 'PUT' })).json() as { smtpPasswordSet: boolean }
    expect(kept.smtpPasswordSet).toBe(true)
    const cleared = await (await app.request('/api/v1/admin/account-settings', { ...json({ ...valid, smtpPassword: '' }), method: 'PUT' })).json() as { smtpPasswordSet: boolean }
    expect(cleared.smtpPasswordSet).toBe(false)
  })

  it('rejects a mail base URL outside allowedOrigins and an rpId that does not cover the origins', async () => {
    const { app } = build()
    const badBase = await app.request('/api/v1/admin/account-settings', { ...json({ ...valid, mailBaseUrl: 'https://evil.example.com' }), method: 'PUT' })
    expect(badBase.status).toBe(400)
    const badRp = await app.request('/api/v1/admin/account-settings', { ...json({ ...valid, passkeyRpId: 'notes.example.org' }), method: 'PUT' })
    expect(badRp.status).toBe(400)
  })

  it('sends a test mail and reports SMTP failures', async () => {
    const ok = build()
    const res = await ok.app.request('/api/v1/admin/account-settings/test', json({ to: 'admin@example.org' }))
    expect(res.status).toBe(200)
    expect(ok.mailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@example.org' }))

    const failing = build(session('admin'), { send: async () => { throw new Error('connect ECONNREFUSED') } })
    const bad = await failing.app.request('/api/v1/admin/account-settings/test', json({ to: 'admin@example.org' }))
    expect(bad.status).toBe(502)
    expect(JSON.stringify(await bad.json())).toContain('ECONNREFUSED')
  })
})
