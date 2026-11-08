import { hash } from 'argon2'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IAuditService } from '../audit/index.js'
import type { LoginMeta } from '../auth/index.js'
import { ARGON2_OPTIONS, AccountSuspendedError, toPublicUserInfo } from '../user/index.js'
import type { UserRecord } from '../user/index.js'
import type { RelyingParty } from './origin.js'
import { MAX_PASSKEYS_PER_USER, PasskeyError, PasskeyService } from './passkey-service.js'
import { InMemoryUserRepository, SoftAuthenticator, makeUser, silentLogger } from './test-support.js'

const RP: RelyingParty = { origin: 'https://notes.example.org', rpId: 'notes.example.org' }
const INTERNAL_RP: RelyingParty = { origin: 'https://intern.example.org', rpId: 'intern.example.org' }
const META: LoginMeta = { ipAddress: '10.0.0.1', userAgent: 'vitest' }
const PASSWORD = 'correct-horse-battery'

// argon2 hashing is slow on small CI hosts; the default 5 s is too tight when workers compete.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

let passwordHash = ''

beforeAll(async () => {
  passwordHash = await hash(PASSWORD, ARGON2_OPTIONS)
})

function setup(userOverrides: Partial<UserRecord> = {}) {
  const repo = new InMemoryUserRepository([makeUser({ passwordHash, ...userOverrides })])
  const audit: IAuditService = { log: vi.fn(async () => {}), query: vi.fn() } as unknown as IAuditService
  const authService = {
    loginVerifiedUser: vi.fn(async (user: UserRecord) => {
      if (user.suspended) throw new AccountSuspendedError()
      return { token: 'session-token', csrfToken: 'csrf', user: toPublicUserInfo(user), expiresAt: '2030-01-01T00:00:00.000Z' }
    }),
  }
  const service = new PasskeyService({ userRepository: repo, authService, logger: silentLogger(), auditService: audit })
  return { repo, service, authService, audit }
}

async function registerPasskey(service: PasskeyService, authenticator: SoftAuthenticator, rp = RP, name = 'Laptop') {
  const { challengeId, options } = await service.beginRegistration('user-1', PASSWORD, rp)
  const response = authenticator.register(options, rp.rpId, rp.origin)
  return service.finishRegistration('user-1', challengeId, response, name, rp, '10.0.0.1')
}

describe('PasskeyService registration', () => {
  it('requires the current password', async () => {
    const { service } = setup()
    await expect(service.beginRegistration('user-1', 'wrong-password', RP)).rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
  })

  it('registers a passkey, stores only public data and audits it', async () => {
    const { service, repo, audit } = setup()
    const authenticator = new SoftAuthenticator()
    const info = await registerPasskey(service, authenticator)

    expect(info).toMatchObject({ name: 'Laptop', rpId: 'notes.example.org', lastUsedAt: null })
    const stored = repo.users.get('user-1')?.passkeys?.[0]
    expect(stored?.credentialId).toBe(authenticator.id)
    expect(stored?.rpId).toBe('notes.example.org')
    expect(JSON.stringify(stored)).not.toContain('PRIVATE')
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PASSKEY_REGISTERED', userId: 'user-1' }))
    expect(await service.list('user-1')).toHaveLength(1)
  })

  it('rejects a registration signed for another origin', async () => {
    const { service } = setup()
    const authenticator = new SoftAuthenticator()
    const { challengeId, options } = await service.beginRegistration('user-1', PASSWORD, RP)
    const response = authenticator.register(options, RP.rpId, 'https://evil.example.com')
    await expect(service.finishRegistration('user-1', challengeId, response, 'x', RP, '10.0.0.1')).rejects.toMatchObject({ code: 'REGISTRATION_FAILED' })
  })

  it('treats a challenge as single use', async () => {
    const { service } = setup()
    const authenticator = new SoftAuthenticator()
    const { challengeId, options } = await service.beginRegistration('user-1', PASSWORD, RP)
    const response = authenticator.register(options, RP.rpId, RP.origin)
    await service.finishRegistration('user-1', challengeId, response, 'a', RP, '10.0.0.1')
    await expect(service.finishRegistration('user-1', challengeId, response, 'b', RP, '10.0.0.1')).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' })
  })

  it('rejects a challenge issued to a different relying party or user', async () => {
    const { service } = setup()
    const authenticator = new SoftAuthenticator()
    const { challengeId, options } = await service.beginRegistration('user-1', PASSWORD, RP)
    const response = authenticator.register(options, INTERNAL_RP.rpId, INTERNAL_RP.origin)
    await expect(service.finishRegistration('user-1', challengeId, response, 'x', INTERNAL_RP, '10.0.0.1')).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' })
    const second = await service.beginRegistration('user-1', PASSWORD, RP)
    await expect(
      service.finishRegistration('someone-else', second.challengeId, authenticator.register(second.options, RP.rpId, RP.origin), 'x', RP, '10.0.0.1'),
    ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' })
  })

  it('rejects an expired challenge', async () => {
    vi.useFakeTimers()
    try {
      const { service } = setup()
      const authenticator = new SoftAuthenticator()
      const { challengeId, options } = await service.beginRegistration('user-1', PASSWORD, RP)
      vi.advanceTimersByTime(2 * 60_000 + 1)
      await expect(
        service.finishRegistration('user-1', challengeId, authenticator.register(options, RP.rpId, RP.origin), 'x', RP, '10.0.0.1'),
      ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects the same credential twice', async () => {
    const { service } = setup()
    const authenticator = new SoftAuthenticator()
    await registerPasskey(service, authenticator)
    await expect(registerPasskey(service, authenticator, RP, 'Again')).rejects.toMatchObject({ code: 'DUPLICATE_CREDENTIAL' })
  })

  it('enforces the per-account limit', async () => {
    const existing = Array.from({ length: MAX_PASSKEYS_PER_USER }, (_, i) => ({
      id: `p${String(i)}`,
      credentialId: `c${String(i)}`,
      publicKey: '',
      counter: 0,
      rpId: RP.rpId,
      name: `Key ${String(i)}`,
      createdAt: '2026-01-01T00:00:00.000Z',
    }))
    const { service } = setup({ passkeys: existing })
    await expect(service.beginRegistration('user-1', PASSWORD, RP)).rejects.toMatchObject({ code: 'PASSKEY_LIMIT' })
  })

  it('validates the passkey name', async () => {
    const { service } = setup()
    const authenticator = new SoftAuthenticator()
    const { challengeId, options } = await service.beginRegistration('user-1', PASSWORD, RP)
    await expect(
      service.finishRegistration('user-1', challengeId, authenticator.register(options, RP.rpId, RP.origin), '   ', RP, '10.0.0.1'),
    ).rejects.toMatchObject({ code: 'INVALID_NAME' })
  })
})

describe('PasskeyService login', () => {
  let ctx: ReturnType<typeof setup>
  let authenticator: SoftAuthenticator

  beforeEach(async () => {
    ctx = setup()
    authenticator = new SoftAuthenticator()
    await registerPasskey(ctx.service, authenticator)
    authenticator.counter = 1
  })

  it('logs in with a registered passkey (no username) and updates counter and last use', async () => {
    const { challengeId, options } = await ctx.service.beginLogin(RP, META.ipAddress)
    const result = await ctx.service.finishLogin(challengeId, authenticator.authenticate(options, RP.rpId, RP.origin, 'user-1'), RP, META)

    expect(result.token).toBe('session-token')
    expect(ctx.authService.loginVerifiedUser).toHaveBeenCalledOnce()
    const stored = ctx.repo.users.get('user-1')?.passkeys?.[0]
    expect(stored?.counter).toBe(1)
    expect(stored?.lastUsedAt).toBeDefined()
  })

  it('rejects a replayed assertion (challenge is single use)', async () => {
    const { challengeId, options } = await ctx.service.beginLogin(RP, META.ipAddress)
    const response = authenticator.authenticate(options, RP.rpId, RP.origin, 'user-1')
    await ctx.service.finishLogin(challengeId, response, RP, META)
    await expect(ctx.service.finishLogin(challengeId, response, RP, META)).rejects.toMatchObject({ code: 'LOGIN_FAILED' })
  })

  it('rejects a counter that does not advance', async () => {
    const first = await ctx.service.beginLogin(RP, META.ipAddress)
    await ctx.service.finishLogin(first.challengeId, authenticator.authenticate(first.options, RP.rpId, RP.origin, 'user-1'), RP, META)
    const second = await ctx.service.beginLogin(RP, META.ipAddress)
    await expect(
      ctx.service.finishLogin(second.challengeId, authenticator.authenticate(second.options, RP.rpId, RP.origin, 'user-1'), RP, META),
    ).rejects.toMatchObject({ code: 'LOGIN_FAILED' })
  })

  it('rejects an assertion whose clientData names another origin', async () => {
    const { challengeId, options } = await ctx.service.beginLogin(RP, META.ipAddress)
    const response = authenticator.authenticate(options, RP.rpId, 'https://evil.example.com', 'user-1')
    await expect(ctx.service.finishLogin(challengeId, response, RP, META)).rejects.toMatchObject({ code: 'LOGIN_FAILED' })
  })

  it('does not accept a passkey on a different relying party', async () => {
    const { challengeId, options } = await ctx.service.beginLogin(INTERNAL_RP, META.ipAddress)
    const response = authenticator.authenticate(options, INTERNAL_RP.rpId, INTERNAL_RP.origin, 'user-1')
    await expect(ctx.service.finishLogin(challengeId, response, INTERNAL_RP, META)).rejects.toMatchObject({ code: 'LOGIN_FAILED' })
  })

  it('rejects a challenge issued for another relying party', async () => {
    const { challengeId, options } = await ctx.service.beginLogin(INTERNAL_RP, META.ipAddress)
    const response = authenticator.authenticate(options, RP.rpId, RP.origin, 'user-1')
    await expect(ctx.service.finishLogin(challengeId, response, RP, META)).rejects.toMatchObject({ code: 'LOGIN_FAILED' })
  })

  it('rejects an unknown credential with the same error as any other failure', async () => {
    const stranger = new SoftAuthenticator()
    stranger.counter = 1
    const { challengeId, options } = await ctx.service.beginLogin(RP, META.ipAddress)
    await expect(
      ctx.service.finishLogin(challengeId, stranger.authenticate(options, RP.rpId, RP.origin, 'user-1'), RP, META),
    ).rejects.toMatchObject({ code: 'LOGIN_FAILED', message: 'Sign-in failed' })
    expect(ctx.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PASSKEY_LOGIN_FAILED', success: false }))
  })

  it('does not open a session for a suspended account', async () => {
    const user = ctx.repo.users.get('user-1')
    if (user === undefined) throw new Error('missing user')
    ctx.repo.users.set('user-1', { ...user, suspended: true })
    const { challengeId, options } = await ctx.service.beginLogin(RP, META.ipAddress)
    await expect(
      ctx.service.finishLogin(challengeId, authenticator.authenticate(options, RP.rpId, RP.origin, 'user-1'), RP, META),
    ).rejects.toBeInstanceOf(AccountSuspendedError)
  })

  it('blocks an IP after repeated failures', async () => {
    const stranger = new SoftAuthenticator()
    stranger.counter = 1
    for (let i = 0; i < 10; i++) {
      const { challengeId, options } = await ctx.service.beginLogin(RP, META.ipAddress)
      await expect(
        ctx.service.finishLogin(challengeId, stranger.authenticate(options, RP.rpId, RP.origin, 'user-1'), RP, META),
      ).rejects.toMatchObject({ code: 'LOGIN_FAILED' })
    }
    const { challengeId, options } = await ctx.service.beginLogin(RP, META.ipAddress)
    await expect(
      ctx.service.finishLogin(challengeId, authenticator.authenticate(options, RP.rpId, RP.origin, 'user-1'), RP, META),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('limits how many login challenges one address can open per minute', async () => {
    for (let i = 0; i < 30; i++) await ctx.service.beginLogin(RP, '10.9.9.9')
    await expect(ctx.service.beginLogin(RP, '10.9.9.9')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    await expect(ctx.service.beginLogin(RP, '10.9.9.10')).resolves.toBeDefined()
  })

  it('rebuilds the credential index from stored users', async () => {
    const fresh = new PasskeyService({
      userRepository: ctx.repo,
      authService: ctx.authService,
      logger: silentLogger(),
    })
    await fresh.loadIndex()
    const { challengeId, options } = await fresh.beginLogin(RP, META.ipAddress)
    const result = await fresh.finishLogin(challengeId, authenticator.authenticate(options, RP.rpId, RP.origin, 'user-1'), RP, META)
    expect(result.token).toBe('session-token')
  })
})

describe('PasskeyService management', () => {
  it('renames and removes a passkey; a removed passkey can no longer log in', async () => {
    const { service, repo } = setup()
    const authenticator = new SoftAuthenticator()
    const info = await registerPasskey(service, authenticator)

    expect((await service.rename('user-1', info.id, 'Phone')).name).toBe('Phone')
    await service.remove('user-1', info.id, '10.0.0.1')
    expect(repo.users.get('user-1')?.passkeys).toEqual([])

    authenticator.counter = 1
    const { challengeId, options } = await service.beginLogin(RP, META.ipAddress)
    await expect(
      service.finishLogin(challengeId, authenticator.authenticate(options, RP.rpId, RP.origin, 'user-1'), RP, META),
    ).rejects.toMatchObject({ code: 'LOGIN_FAILED' })
  })

  it('cannot touch the passkey of another account', async () => {
    const { service, repo } = setup()
    repo.users.set('user-2', makeUser({ userId: 'user-2', username: 'bob', passwordHash }))
    const info = await registerPasskey(service, new SoftAuthenticator())
    await expect(service.remove('user-2', info.id, '10.0.0.1')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(service.rename('user-2', info.id, 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('removeAll drops every passkey and audits the admin action', async () => {
    const { service, repo, audit } = setup()
    await registerPasskey(service, new SoftAuthenticator(), RP, 'One')
    await registerPasskey(service, new SoftAuthenticator(), RP, 'Two')
    expect(await service.removeAll('user-1', 'admin-1', '10.0.0.9')).toBe(2)
    expect(repo.users.get('user-1')?.passkeys).toBeUndefined()
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PASSKEY_REMOVED', userId: 'admin-1', target: 'user-1' }))
  })

  it('maps PasskeyError instances for callers', () => {
    expect(new PasskeyError('NOT_FOUND', 'x')).toBeInstanceOf(Error)
  })
})
