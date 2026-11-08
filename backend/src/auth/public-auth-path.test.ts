import { describe, expect, it } from 'vitest'
import { isPublicAuthPath } from './middleware.js'

describe('isPublicAuthPath', () => {
  it('allows exactly the unauthenticated account endpoints', () => {
    expect(isPublicAuthPath('GET', '/api/v1/auth/capabilities')).toBe(true)
    expect(isPublicAuthPath('POST', '/api/v1/auth/passkey/login/options')).toBe(true)
    expect(isPublicAuthPath('POST', '/api/v1/auth/passkey/login/verify')).toBe(true)
    expect(isPublicAuthPath('POST', '/api/v1/auth/password-reset/request')).toBe(true)
    expect(isPublicAuthPath('POST', '/api/v1/auth/password-reset/confirm')).toBe(true)
    expect(isPublicAuthPath('POST', '/api/v1/auth/email/verify')).toBe(true)
  })

  it('keeps the session-bound endpoints protected', () => {
    expect(isPublicAuthPath('POST', '/api/v1/auth/passkey/register/options')).toBe(false)
    expect(isPublicAuthPath('POST', '/api/v1/auth/passkey/register/verify')).toBe(false)
    expect(isPublicAuthPath('PUT', '/api/v1/users/me/email')).toBe(false)
    expect(isPublicAuthPath('GET', '/api/v1/users/me/security')).toBe(false)
    expect(isPublicAuthPath('DELETE', '/api/v1/users/me/passkeys/abc')).toBe(false)
    expect(isPublicAuthPath('DELETE', '/api/v1/admin/users/u1/passkeys')).toBe(false)
  })

  it('does not widen via other methods or path tricks', () => {
    expect(isPublicAuthPath('GET', '/api/v1/auth/password-reset/request')).toBe(false)
    expect(isPublicAuthPath('PUT', '/api/v1/auth/passkey/login/verify')).toBe(false)
    expect(isPublicAuthPath('POST', '/api/v1/auth/passkey/login/verify/')).toBe(false)
    expect(isPublicAuthPath('POST', '/api/v1/auth/passkey/login/../register/verify')).toBe(false)
    expect(isPublicAuthPath('POST', '/api/v1/auth/capabilities')).toBe(false)
  })
})
