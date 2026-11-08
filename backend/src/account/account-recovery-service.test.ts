import { hash, verify } from 'argon2'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IAuditService } from '../audit/index.js'
import { ARGON2_OPTIONS } from '../user/index.js'
import type { UserRecord } from '../user/index.js'
import { AccountRecoveryService } from './account-recovery-service.js'
import type { IMailService, OutgoingMail } from './mail-service.js'
import { DEFAULT_ACCOUNT_SETTINGS } from './settings-store.js'
import type { AccountSettings, IAccountSettingsStore } from './settings-store.js'
import { InMemoryUserRepository, makeUser, silentLogger } from './test-support.js'

const PASSWORD = 'correct-horse-battery'
const ORIGINS = ['https://notes.example.org', 'https://intern.example.org']
let passwordHash = ''

beforeAll(async () => {
  passwordHash = await hash(PASSWORD, ARGON2_OPTIONS)
})

function setup(opts: { users?: UserRecord[]; settings?: Partial<AccountSettings>; enabled?: boolean; mailConfigured?: boolean } = {}) {
  const repo = new InMemoryUserRepository(opts.users ?? [makeUser({ passwordHash, email: 'alice@example.org', emailVerifiedAt: '2026-01-02T00:00:00.000Z' })])
  const sent: OutgoingMail[] = []
  const mailService: IMailService = {
    isConfigured: async () => opts.mailConfigured ?? true,
    send: vi.fn(async (mail: OutgoingMail) => {
      sent.push(mail)
    }),
  }
  const settings: IAccountSettingsStore = {
    get: async () => ({ ...DEFAULT_ACCOUNT_SETTINGS, ...opts.settings }),
    update: async () => {},
    getSmtpPassword: async () => null,
    hasSmtpPassword: async () => false,
  }
  const authService = { invalidateAllSessions: vi.fn(async () => {}) }
  const audit = { log: vi.fn(async () => {}), query: vi.fn() } as unknown as IAuditService
  const service = new AccountRecoveryService({
    userRepository: repo,
    mailService,
    settings,
    authService,
    getAllowedOrigins: () => ORIGINS,
    isEnabled: () => opts.enabled ?? true,
    logger: silentLogger(),
    auditService: audit,
  })
  return { repo, service, sent, mailService, authService, audit }
}

/** Extracts the raw token from the `#token=` fragment of the first mail's link. */
function tokenFrom(mail: OutgoingMail | undefined): string {
  const match = /#token=([^\s]+)/.exec(mail?.text ?? '')
  if (match?.[1] === undefined) throw new Error('no token in mail')
  return decodeURIComponent(match[1])
}

describe('availability', () => {
  it('is available only with the toggle on, SMTP configured and a link base', async () => {
    expect(await setup().service.isResetAvailable()).toBe(true)
    expect(await setup({ enabled: false }).service.isResetAvailable()).toBe(false)
    expect(await setup({ mailConfigured: false }).service.isResetAvailable()).toBe(false)
  })

  it('is unavailable without any https origin to build links from', async () => {
    const ctx = setup()
    const noHttps = new AccountRecoveryService({
      userRepository: ctx.repo,
      mailService: ctx.mailService,
      settings: { get: async () => DEFAULT_ACCOUNT_SETTINGS } as IAccountSettingsStore,
      authService: ctx.authService,
      getAllowedOrigins: () => ['http://localhost:5173'],
      isEnabled: () => true,
      logger: silentLogger(),
    })
    expect(await noHttps.isResetAvailable()).toBe(false)
  })
})

describe('email confirmation', () => {
  let ctx: ReturnType<typeof setup>

  beforeEach(() => {
    ctx = setup({ users: [makeUser({ passwordHash })] })
  })

  it('requires the password and a valid address', async () => {
    await expect(ctx.service.requestEmailChange('user-1', 'wrong', 'a@example.org')).rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
    await expect(ctx.service.requestEmailChange('user-1', PASSWORD, 'nope')).rejects.toMatchObject({ code: 'EMAIL_INVALID' })
    expect(ctx.sent).toHaveLength(0)
  })

  it('refuses when mail delivery is not configured', async () => {
    const off = setup({ users: [makeUser({ passwordHash })], mailConfigured: false })
    await expect(off.service.requestEmailChange('user-1', PASSWORD, 'a@example.org')).rejects.toMatchObject({ code: 'MAIL_NOT_CONFIGURED' })
  })

  it('keeps the old address until the link is opened, then verifies the new one', async () => {
    await ctx.service.requestEmailChange('user-1', PASSWORD, 'New@Example.org')
    expect(ctx.sent).toHaveLength(1)
    expect(ctx.sent[0]?.to).toBe('New@Example.org')
    expect(ctx.sent[0]?.text).toContain('https://notes.example.org/verify-email#token=')

    let user = ctx.repo.users.get('user-1')
    expect(user?.email).toBe('')
    expect(user?.pendingEmail).toBe('New@Example.org')
    expect(user?.emailVerifiedAt).toBeUndefined()
    expect(JSON.stringify(user?.mailTokens)).not.toContain(tokenFrom(ctx.sent[0]).split('.')[1] ?? 'x')

    await ctx.service.verifyEmail(tokenFrom(ctx.sent[0]), '10.0.0.1')
    user = ctx.repo.users.get('user-1')
    expect(user?.email).toBe('New@Example.org')
    expect(user?.emailVerifiedAt).toBeDefined()
    expect(user?.pendingEmail).toBeUndefined()
    expect(user?.mailTokens).toEqual([])
    expect(await ctx.service.getSecurityState('user-1')).toMatchObject({ emailVerified: true, pendingEmail: null })
  })

  it('accepts a confirmation link only once', async () => {
    await ctx.service.requestEmailChange('user-1', PASSWORD, 'a@example.org')
    const token = tokenFrom(ctx.sent[0])
    await ctx.service.verifyEmail(token, '10.0.0.1')
    await expect(ctx.service.verifyEmail(token, '10.0.0.1')).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('refuses an address that another account already confirmed', async () => {
    const taken = makeUser({ userId: 'user-2', username: 'bob', passwordHash, email: 'a@example.org', emailVerifiedAt: '2026-01-02T00:00:00.000Z' })
    const both = setup({ users: [makeUser({ passwordHash }), taken] })
    await both.service.requestEmailChange('user-1', PASSWORD, 'A@example.org')
    await expect(both.service.verifyEmail(tokenFrom(both.sent[0]), '10.0.0.1')).rejects.toMatchObject({ code: 'EMAIL_IN_USE' })
  })

  it('rejects malformed and foreign tokens', async () => {
    await expect(ctx.service.verifyEmail('garbage', '10.0.0.1')).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
    await expect(ctx.service.verifyEmail('user-1.not-a-real-secret', '10.0.0.1')).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('does not trust a token whose purpose is a password reset', async () => {
    await ctx.service.requestEmailChange('user-1', PASSWORD, 'a@example.org')
    const verified = ctx.repo.users.get('user-1')
    if (verified === undefined) throw new Error('missing')
    ctx.repo.users.set('user-1', { ...verified, mailTokens: (verified.mailTokens ?? []).map((t) => ({ ...t, purpose: 'password-reset' as const })) })
    await expect(ctx.service.verifyEmail(tokenFrom(ctx.sent[0]), '10.0.0.1')).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })
})

describe('password reset by mail', () => {
  it('mails a link to a confirmed address, found by username or by address', async () => {
    const ctx = setup()
    await ctx.service.requestPasswordReset('alice', '10.0.0.1')
    await ctx.service.processResetRequest('alice')
    await ctx.service.processResetRequest('ALICE@example.org')
    expect(ctx.sent.length).toBeGreaterThanOrEqual(1)
    expect(ctx.sent[0]?.to).toBe('alice@example.org')
    expect(ctx.sent[0]?.text).toContain('https://notes.example.org/reset-password#token=')
  })

  it('never uses the request to build the link (config origin only)', async () => {
    const ctx = setup({ settings: { mailBaseUrl: 'https://intern.example.org' } })
    await ctx.service.processResetRequest('alice')
    expect(ctx.sent[0]?.text).toContain('https://intern.example.org/reset-password#token=')
    const bogus = setup({ settings: { mailBaseUrl: 'https://evil.example.com' } })
    await bogus.service.processResetRequest('alice')
    expect(bogus.sent).toHaveLength(0)
  })

  it('stays silent for unknown accounts, unconfirmed addresses and suspended accounts', async () => {
    const unconfirmed = makeUser({ userId: 'u2', username: 'bob', passwordHash, email: 'bob@example.org' })
    const suspended = makeUser({ userId: 'u3', username: 'carol', passwordHash, email: 'c@example.org', emailVerifiedAt: '2026-01-02T00:00:00.000Z', suspended: true })
    const ctx = setup({ users: [unconfirmed, suspended] })
    for (const who of ['nobody', 'bob', 'bob@example.org', 'carol', 'c@example.org', '']) {
      await ctx.service.processResetRequest(who)
    }
    expect(ctx.sent).toHaveLength(0)
  })

  it('answers identically through the public entry point whether or not the account exists', async () => {
    const ctx = setup()
    await expect(ctx.service.requestPasswordReset('alice', '10.0.0.1')).resolves.toBeUndefined()
    await expect(ctx.service.requestPasswordReset('nobody', '10.0.0.2')).resolves.toBeUndefined()
  })

  it('refuses the request outright when the feature is unavailable', async () => {
    const ctx = setup({ enabled: false })
    await expect(ctx.service.requestPasswordReset('alice', '10.0.0.1')).rejects.toMatchObject({ code: 'MAIL_NOT_CONFIGURED' })
  })

  it('limits mails per account and requests per IP', async () => {
    const ctx = setup()
    for (let i = 0; i < 5; i++) await ctx.service.processResetRequest('alice')
    expect(ctx.sent).toHaveLength(3)

    const ipCtx = setup()
    for (let i = 0; i < 5; i++) await ipCtx.service.requestPasswordReset('x', '10.0.0.1')
    await expect(ipCtx.service.requestPasswordReset('x', '10.0.0.1')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('sets the new password, ends all sessions, audits, notifies and consumes the token', async () => {
    const ctx = setup()
    await ctx.service.processResetRequest('alice')
    const token = tokenFrom(ctx.sent[0])

    await ctx.service.confirmPasswordReset(token, 'a-brand-new-password', '10.0.0.1')

    const user = ctx.repo.users.get('user-1')
    expect(await verify(user?.passwordHash ?? '', 'a-brand-new-password')).toBe(true)
    expect(user?.mailTokens).toEqual([])
    expect(ctx.authService.invalidateAllSessions).toHaveBeenCalledWith('user-1')
    expect(ctx.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PASSWORD_RESET_BY_MAIL', userId: 'user-1' }))
    await vi.waitFor(() => expect(ctx.sent.some((m) => /changed|geändert/.test(m.subject))).toBe(true))

    await expect(ctx.service.confirmPasswordReset(token, 'another-new-password', '10.0.0.1')).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('keeps passkeys when the password is reset', async () => {
    const passkey = { id: 'p1', credentialId: 'c1', publicKey: 'k', counter: 0, rpId: 'notes.example.org', name: 'Laptop', createdAt: '2026-01-01T00:00:00.000Z' }
    const ctx = setup({ users: [makeUser({ passwordHash, email: 'alice@example.org', emailVerifiedAt: '2026-01-02T00:00:00.000Z', passkeys: [passkey] })] })
    await ctx.service.processResetRequest('alice')
    await ctx.service.confirmPasswordReset(tokenFrom(ctx.sent[0]), 'a-brand-new-password', '10.0.0.1')
    expect(ctx.repo.users.get('user-1')?.passkeys).toEqual([passkey])
  })

  it('enforces password rules and keeps the token valid after a rule violation', async () => {
    const ctx = setup()
    await ctx.service.processResetRequest('alice')
    const token = tokenFrom(ctx.sent[0])
    await expect(ctx.service.confirmPasswordReset(token, 'short', '10.0.0.1')).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
    await expect(ctx.service.confirmPasswordReset(token, 'long-enough-password', '10.0.0.1')).resolves.toBeUndefined()
  })

  it('a newer token invalidates the older one', async () => {
    const ctx = setup()
    await ctx.service.processResetRequest('alice')
    await ctx.service.processResetRequest('alice')
    const [older, newer] = [tokenFrom(ctx.sent[0]), tokenFrom(ctx.sent[1])]
    await expect(ctx.service.confirmPasswordReset(older, 'long-enough-password', '10.0.0.1')).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
    await expect(ctx.service.confirmPasswordReset(newer, 'long-enough-password', '10.0.0.1')).resolves.toBeUndefined()
  })

  it('rejects an expired token', async () => {
    vi.useFakeTimers()
    try {
      const ctx = setup()
      await ctx.service.processResetRequest('alice')
      const token = tokenFrom(ctx.sent[0])
      vi.advanceTimersByTime(30 * 60_000 + 1)
      await expect(ctx.service.confirmPasswordReset(token, 'long-enough-password', '10.0.0.1')).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('blocks token guessing per IP', async () => {
    const ctx = setup()
    for (let i = 0; i < 20; i++) {
      await expect(ctx.service.confirmPasswordReset(`user-1.guess${String(i)}`, 'long-enough-password', '10.0.0.1')).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
    }
    await expect(ctx.service.confirmPasswordReset('user-1.guess', 'long-enough-password', '10.0.0.1')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('serializes concurrent redemptions so a token works only once', async () => {
    const ctx = setup()
    await ctx.service.processResetRequest('alice')
    const token = tokenFrom(ctx.sent[0])
    const results = await Promise.allSettled([
      ctx.service.confirmPasswordReset(token, 'long-enough-password', '10.0.0.1'),
      ctx.service.confirmPasswordReset(token, 'long-enough-password', '10.0.0.2'),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  })

  it('does not reset a suspended account even with a valid token', async () => {
    const ctx = setup()
    await ctx.service.processResetRequest('alice')
    const token = tokenFrom(ctx.sent[0])
    const user = ctx.repo.users.get('user-1')
    if (user === undefined) throw new Error('missing')
    ctx.repo.users.set('user-1', { ...user, suspended: true })
    await expect(ctx.service.confirmPasswordReset(token, 'long-enough-password', '10.0.0.1')).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })
})
