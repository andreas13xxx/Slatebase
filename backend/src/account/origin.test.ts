import { describe, expect, it } from 'vitest'
import { isHostWithin, normalizeOrigin, resolveMailBaseUrl, resolveRelyingParty, validatePasskeyRpId } from './origin.js'

const ALLOWED = ['https://notes.example.org', 'https://intern.example.org', 'http://localhost:5173']

describe('resolveRelyingParty', () => {
  it('uses the hostname of an allowed origin as rpId', () => {
    expect(resolveRelyingParty('https://notes.example.org', ALLOWED, '')).toEqual({
      origin: 'https://notes.example.org',
      rpId: 'notes.example.org',
    })
  })

  it('accepts localhost over http for development', () => {
    expect(resolveRelyingParty('http://localhost:5173', ALLOWED, '')?.rpId).toBe('localhost')
  })

  it('rejects a missing, foreign or malformed origin', () => {
    expect(resolveRelyingParty(undefined, ALLOWED, '')).toBeNull()
    expect(resolveRelyingParty('https://evil.example.com', ALLOWED, '')).toBeNull()
    expect(resolveRelyingParty('not a url', ALLOWED, '')).toBeNull()
  })

  it('rejects an allowed origin that is plain http on a non-local host', () => {
    expect(resolveRelyingParty('http://notes.example.org', ['http://notes.example.org'], '')).toBeNull()
  })

  it('uses the shared parent domain when configured and covering the origin', () => {
    expect(resolveRelyingParty('https://intern.example.org', ALLOWED, 'example.org')?.rpId).toBe('example.org')
  })

  it('rejects an origin outside the configured parent domain', () => {
    expect(resolveRelyingParty('http://localhost:5173', ALLOWED, 'example.org')).toBeNull()
  })

  it('normalizes a trailing slash and default port in the allow list', () => {
    expect(resolveRelyingParty('https://notes.example.org', ['https://notes.example.org/'], '')).not.toBeNull()
    expect(resolveRelyingParty('https://notes.example.org:443', ['https://notes.example.org'], '')).not.toBeNull()
  })
})

describe('validatePasskeyRpId', () => {
  it('accepts empty and covering parent domains', () => {
    expect(validatePasskeyRpId('', ALLOWED)).toBeNull()
    expect(validatePasskeyRpId('example.org', ALLOWED)).toBeNull()
  })

  it('rejects a domain that does not cover every secure origin', () => {
    expect(validatePasskeyRpId('notes.example.org', ALLOWED)).toMatch(/does not cover/)
  })

  it('rejects non-domain values', () => {
    expect(validatePasskeyRpId('https://example.org', ALLOWED)).toMatch(/plain domain/)
    expect(validatePasskeyRpId('exa mple.org', ALLOWED)).toMatch(/plain domain/)
  })

  it('does not match on a partial label', () => {
    expect(isHostWithin('evilexample.org', 'example.org')).toBe(false)
    expect(isHostWithin('a.example.org', 'example.org')).toBe(true)
  })
})

describe('resolveMailBaseUrl', () => {
  it('falls back to the first https origin', () => {
    expect(resolveMailBaseUrl('', ALLOWED)).toBe('https://notes.example.org')
  })

  it('accepts a configured allowed origin', () => {
    expect(resolveMailBaseUrl('https://intern.example.org/', ALLOWED)).toBe('https://intern.example.org')
  })

  it('refuses a configured origin that is not allowed', () => {
    expect(resolveMailBaseUrl('https://evil.example.com', ALLOWED)).toBeNull()
  })

  it('returns null when there is no https origin', () => {
    expect(resolveMailBaseUrl('', ['http://localhost:5173'])).toBeNull()
  })
})

describe('normalizeOrigin', () => {
  it('strips path and rejects other schemes', () => {
    expect(normalizeOrigin('https://a.example.org/x?y=1')).toBe('https://a.example.org')
    expect(normalizeOrigin('javascript:alert(1)')).toBeNull()
  })
})
