import { beforeEach, describe, expect, it, vi } from 'vitest'

const startAuthentication = vi.fn()
const startRegistration = vi.fn()

vi.mock('@simplewebauthn/browser', () => ({
  WebAuthnAbortService: { cancelCeremony: vi.fn() },
  browserSupportsWebAuthn: () => true,
  browserSupportsWebAuthnAutofill: async () => true,
  startAuthentication: (...args: unknown[]) => startAuthentication(...args),
  startRegistration: (...args: unknown[]) => startRegistration(...args),
}))

import type { AccountApi } from './accountApi'
import { isPasskeyCancelled, registerPasskey, signInWithPasskey, suggestPasskeyName } from './passkeyClient'

function apiMock(overrides: Partial<AccountApi> = {}): AccountApi {
  return {
    passkeyLoginOptions: vi.fn(async () => ({ challengeId: 'c1', options: { challenge: 'x' } })),
    passkeyLoginVerify: vi.fn(async () => ({ token: 't', csrfToken: 'csrf', user: {}, expiresAt: '' })),
    passkeyRegisterOptions: vi.fn(async () => ({ challengeId: 'c2', options: { challenge: 'y' } })),
    passkeyRegisterVerify: vi.fn(async () => ({ id: 'p1', name: 'Laptop', rpId: 'h', createdAt: '', lastUsedAt: null, transports: [] })),
    ...overrides,
  } as unknown as AccountApi
}

describe('passkeyClient', () => {
  beforeEach(() => {
    startAuthentication.mockReset()
    startRegistration.mockReset()
  })

  it('signs in: options → browser assertion → verify', async () => {
    startAuthentication.mockResolvedValue({ id: 'cred' })
    const api = apiMock()
    const result = await signInWithPasskey(api, false)
    expect(result.csrfToken).toBe('csrf')
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'x' }, useBrowserAutofill: false })
    expect(api.passkeyLoginVerify).toHaveBeenCalledWith('c1', { id: 'cred' })
  })

  it('requests autofill mode for the conditional UI', async () => {
    startAuthentication.mockResolvedValue({ id: 'cred' })
    await signInWithPasskey(apiMock(), true)
    expect(startAuthentication).toHaveBeenCalledWith(expect.objectContaining({ useBrowserAutofill: true }))
  })

  it('does not call verify when the user dismisses the prompt', async () => {
    const cancelled = Object.assign(new Error('cancelled'), { name: 'NotAllowedError' })
    startAuthentication.mockRejectedValue(cancelled)
    const api = apiMock()
    await expect(signInWithPasskey(api, false)).rejects.toBe(cancelled)
    expect(api.passkeyLoginVerify).not.toHaveBeenCalled()
    expect(isPasskeyCancelled(cancelled)).toBe(true)
    expect(isPasskeyCancelled(new Error('other'))).toBe(false)
  })

  it('registers: password-gated options → browser attestation → verify with the name', async () => {
    startRegistration.mockResolvedValue({ id: 'new' })
    const api = apiMock()
    const info = await registerPasskey(api, 'pw', 'Laptop')
    expect(info.name).toBe('Laptop')
    expect(api.passkeyRegisterOptions).toHaveBeenCalledWith('pw')
    expect(api.passkeyRegisterVerify).toHaveBeenCalledWith('c2', 'Laptop', { id: 'new' })
  })

  it('suggests a readable device name', () => {
    expect(suggestPasskeyName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537')).toBe('Windows · Chrome')
    expect(suggestPasskeyName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/17 Safari/605')).toBe('macOS · Safari')
    expect(suggestPasskeyName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604')).toBe('iOS · Safari')
    expect(suggestPasskeyName('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0')).toBe('Linux · Firefox')
  })
})
