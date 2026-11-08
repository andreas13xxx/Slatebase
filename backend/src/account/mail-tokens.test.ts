import { describe, expect, it } from 'vitest'
import { createMailToken, findMailToken, hashMailToken, withoutStaleTokens } from './mail-tokens.js'

describe('mail tokens', () => {
  it('stores only the hash and finds the token by its raw value', () => {
    const { token, record } = createMailToken('password-reset', 60_000)
    expect(record.hash).toBe(hashMailToken(token))
    expect(record.hash).not.toContain(token)
    expect(findMailToken([record], 'password-reset', token)).toBe(record)
  })

  it('does not match another purpose, a wrong token or an expired token', () => {
    const { token, record } = createMailToken('password-reset', 60_000)
    expect(findMailToken([record], 'verify-email', token)).toBeNull()
    expect(findMailToken([record], 'password-reset', token + 'x')).toBeNull()
    const expired = { ...record, expiresAt: new Date(Date.now() - 1).toISOString() }
    expect(findMailToken([expired], 'password-reset', token)).toBeNull()
  })

  it('produces distinct high-entropy tokens', () => {
    const a = createMailToken('verify-email', 1000, 'a@example.org')
    const b = createMailToken('verify-email', 1000, 'a@example.org')
    expect(a.token).not.toBe(b.token)
    expect(a.token.length).toBeGreaterThanOrEqual(43)
    expect(a.record.email).toBe('a@example.org')
  })

  it('drops expired tokens and the replaced purpose', () => {
    const keep = createMailToken('verify-email', 60_000).record
    const old = createMailToken('password-reset', 60_000).record
    const expired = { ...createMailToken('verify-email', 60_000).record, expiresAt: new Date(0).toISOString() }
    expect(withoutStaleTokens([keep, old, expired], 'password-reset')).toEqual([keep])
    expect(withoutStaleTokens(undefined)).toEqual([])
  })
})
