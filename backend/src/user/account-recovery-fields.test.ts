import { describe, expect, it, vi } from 'vitest'
import { InMemoryUserRepository, makeUser, silentLogger } from '../account/test-support.js'
import type { ISessionStore } from '../auth/index.js'
import { UserService, assertValidPassword, UserValidationError } from './index.js'

function setup(users = [makeUser()]) {
  const repo = new InMemoryUserRepository(users)
  const sessionStore = { invalidateAllForUser: vi.fn(async () => {}) } as unknown as ISessionStore & {
    invalidateAllForUser: ReturnType<typeof vi.fn>
  }
  const service = new UserService(repo, sessionStore, silentLogger())
  return { repo, service, sessionStore }
}

describe('UserService — fields used by mail recovery and passkeys', () => {
  it('reports the confirmation state and passkey count in the admin list only', async () => {
    const confirmed = makeUser({
      userId: 'u1',
      username: 'alice',
      email: 'alice@example.org',
      emailVerifiedAt: '2026-01-02T00:00:00.000Z',
      passkeys: [
        { id: 'p1', credentialId: 'c1', publicKey: 'k', counter: 0, rpId: 'h', name: 'Laptop', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    })
    const unconfirmed = makeUser({ userId: 'u2', username: 'bob', email: 'bob@example.org' })
    const noMail = makeUser({ userId: 'u3', username: 'carol', email: '', emailVerifiedAt: '2026-01-02T00:00:00.000Z' })
    const { service } = setup([confirmed, unconfirmed, noMail])

    const { items } = await service.listUsers()
    const by = Object.fromEntries(items.map((u) => [u.username, u]))
    expect(by['alice']).toMatchObject({ emailVerified: true, passkeyCount: 1 })
    expect(by['bob']).toMatchObject({ emailVerified: false, passkeyCount: 0 })
    expect(by['carol']).toMatchObject({ emailVerified: false })

    const own = await service.getUser('u1')
    expect(own.emailVerified).toBeUndefined()
    expect(own.passkeyCount).toBeUndefined()
  })

  it('never leaks tokens, hashes or public keys through the public info', async () => {
    const { service } = setup([
      makeUser({
        mailTokens: [{ purpose: 'password-reset', hash: 'deadbeef', expiresAt: '2099-01-01T00:00:00.000Z' }],
        passkeys: [{ id: 'p1', credentialId: 'c1', publicKey: 'SECRET-KEY', counter: 0, rpId: 'h', name: 'x', createdAt: '' }],
      }),
    ])
    const json = JSON.stringify([await service.getUser('user-1'), (await service.listUsers()).items])
    expect(json).not.toContain('deadbeef')
    expect(json).not.toContain('SECRET-KEY')
    expect(json).not.toContain('passwordHash')
  })

  it('drops the verification and pending tokens when the address changes through the profile', async () => {
    const { service, repo } = setup([
      makeUser({
        email: 'old@example.org',
        emailVerifiedAt: '2026-01-02T00:00:00.000Z',
        pendingEmail: 'pending@example.org',
        mailTokens: [{ purpose: 'password-reset', hash: 'h', expiresAt: '2099-01-01T00:00:00.000Z' }],
      }),
    ])
    await service.updateProfile('user-1', { email: 'new@example.org' })
    const saved = repo.users.get('user-1')
    expect(saved?.email).toBe('new@example.org')
    expect(saved?.emailVerifiedAt).toBeUndefined()
    expect(saved?.pendingEmail).toBeUndefined()
    expect(saved?.mailTokens).toBeUndefined()
  })

  it('keeps the verification when the profile update leaves the address alone', async () => {
    const { service, repo } = setup([makeUser({ email: 'a@example.org', emailVerifiedAt: '2026-01-02T00:00:00.000Z' })])
    await service.updateProfile('user-1', { displayName: 'Alice B' })
    expect(repo.users.get('user-1')?.emailVerifiedAt).toBe('2026-01-02T00:00:00.000Z')
    await service.updateProfile('user-1', { email: 'a@example.org' })
    expect(repo.users.get('user-1')?.emailVerifiedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('ends every session on an admin password reset and keeps passkeys', async () => {
    const passkey = { id: 'p1', credentialId: 'c1', publicKey: 'k', counter: 0, rpId: 'h', name: 'Laptop', createdAt: '' }
    const { service, repo, sessionStore } = setup([makeUser({ passkeys: [passkey] })])
    await service.resetPassword('user-1')
    expect(sessionStore.invalidateAllForUser).toHaveBeenCalledWith('user-1')
    expect(repo.users.get('user-1')?.passkeys).toEqual([passkey])
    expect(repo.users.get('user-1')?.mustChangePassword).toBe(true)
  })
})

describe('assertValidPassword', () => {
  it('enforces 8–128 characters', () => {
    expect(() => assertValidPassword('1234567')).toThrow(UserValidationError)
    expect(() => assertValidPassword('12345678')).not.toThrow()
    expect(() => assertValidPassword('x'.repeat(128))).not.toThrow()
    expect(() => assertValidPassword('x'.repeat(129))).toThrow(UserValidationError)
  })
})
