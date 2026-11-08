import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccountApi, readFragmentToken } from './accountApi'

function mockFetch(response: { status?: number; body?: unknown; headers?: Record<string, string> }) {
  const fn = vi.fn(async () => {
    const status = response.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(response.body ?? {}), { status, headers: response.headers })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('readFragmentToken', () => {
  it('reads the token from a URL fragment', () => {
    expect(readFragmentToken('#token=abc.def_ghi')).toBe('abc.def_ghi')
    expect(readFragmentToken('token=abc')).toBe('abc')
  })

  it('returns null when there is no token', () => {
    expect(readFragmentToken('')).toBeNull()
    expect(readFragmentToken('#')).toBeNull()
    expect(readFragmentToken('#other=1')).toBeNull()
    expect(readFragmentToken('#token=')).toBeNull()
  })
})

describe('createAccountApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes the page origin to the capability probe', async () => {
    const fetchMock = mockFetch({ body: { passwordReset: true, passkey: false } })
    const caps = await createAccountApi().getCapabilities()
    expect(caps).toEqual({ passwordReset: true, passkey: false })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe(`/api/v1/auth/capabilities?origin=${encodeURIComponent(window.location.origin)}`)
  })

  it('sends the CSRF token on state-changing calls only', async () => {
    const fetchMock = mockFetch({ body: { ok: true } })
    const api = createAccountApi(() => 'csrf-1')
    await api.getSecurity()
    await api.requestEmailChange('a@example.org', 'pw')
    const [, getInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const [, putInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect((getInit.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined()
    expect((putInit.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1')
    expect(putInit.method).toBe('PUT')
    expect(JSON.parse(putInit.body as string)).toEqual({ email: 'a@example.org', password: 'pw' })
  })

  it('sends no CSRF header for the public calls when none is set', async () => {
    const fetchMock = mockFetch({ status: 204 })
    await createAccountApi().confirmPasswordReset('u.token', 'long-enough-password')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined()
  })

  it('maps error responses including Retry-After', async () => {
    mockFetch({ status: 429, body: { code: 'RATE_LIMITED', message: 'slow down' }, headers: { 'Retry-After': '42' } })
    await expect(createAccountApi().requestPasswordReset('alice')).rejects.toEqual({
      code: 'RATE_LIMITED',
      message: 'slow down',
      retryAfter: 42,
    })
  })

  it('falls back to a generic error for non-JSON failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 502 })))
    await expect(createAccountApi().getSecurity()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
  })

  it('encodes ids in the management paths', async () => {
    const fetchMock = mockFetch({ status: 204 })
    await createAccountApi(() => 'c').deletePasskey('a/b')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/users/me/passkeys/a%2Fb')
  })
})
