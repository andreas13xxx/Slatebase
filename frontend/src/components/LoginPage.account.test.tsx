import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import type { Dispatch } from 'react'
import { LoginPage } from './LoginPage'
import { AuthContext, type AuthContextValue } from '../state/authContext'
import { initialAuthState, type AuthAction } from '../state/authState'
import type { IApiClient } from '../api'
import { bodyOf, routeFetch } from '../account/test-helpers'

const signInWithPasskey = vi.fn()
const isPasskeySupported = vi.fn(() => true)
const isPasskeyAutofillSupported = vi.fn(async () => false)

vi.mock('../account/passkeyClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../account/passkeyClient')>()
  return {
    ...actual,
    cancelPasskeyPrompt: vi.fn(),
    isPasskeySupported: () => isPasskeySupported(),
    isPasskeyAutofillSupported: () => isPasskeyAutofillSupported(),
    signInWithPasskey: (...args: unknown[]) => signInWithPasskey(...args),
  }
})

const user = {
  userId: 'u1', username: 'alice', displayName: 'Alice', email: '', avatarUrl: '', avatarType: 'initials', avatarColor: '',
  avatarData: '', avatarDicebear: '', role: 'user', preferredLanguage: 'de', colorScheme: 'system', suspended: false,
  mustChangePassword: false, createdAt: '2025-01-01T00:00:00Z',
}

function renderLogin() {
  const authDispatch = vi.fn() as Dispatch<AuthAction> & ReturnType<typeof vi.fn>
  const apiClient = {
    getVersion: vi.fn().mockResolvedValue({ version: '1.0.0' }),
    setCsrfToken: vi.fn(),
    login: vi.fn(),
  } as unknown as IApiClient
  const value: AuthContextValue = { authState: { ...initialAuthState }, authDispatch }
  render(React.createElement(AuthContext.Provider, { value }, React.createElement(LoginPage, { apiClient })))
  return { authDispatch, apiClient }
}

beforeEach(() => {
  signInWithPasskey.mockReset()
  isPasskeySupported.mockReturnValue(true)
  isPasskeyAutofillSupported.mockResolvedValue(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LoginPage — passkey', () => {
  it('shows the passkey button only when the server offers it and the browser supports it', async () => {
    routeFetch({ 'GET /api/v1/auth/capabilities': () => ({ body: { passwordReset: false, passkey: true } }) })
    renderLogin()
    expect(await screen.findByRole('button', { name: 'Mit Passkey anmelden' })).toBeInTheDocument()
  })

  it('hides the button when the origin is not allowed or the browser lacks support', async () => {
    routeFetch({ 'GET /api/v1/auth/capabilities': () => ({ body: { passwordReset: false, passkey: false } }) })
    renderLogin()
    await waitFor(() => expect(screen.getByLabelText('Benutzername')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Mit Passkey anmelden' })).not.toBeInTheDocument()
  })

  it('hides the button without WebAuthn support', async () => {
    isPasskeySupported.mockReturnValue(false)
    const { fn } = routeFetch({ 'GET /api/v1/auth/capabilities': () => ({ body: { passwordReset: false, passkey: true } }) })
    renderLogin()
    await waitFor(() => expect(fn).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Mit Passkey anmelden' })).not.toBeInTheDocument()
  })

  it('signs in with a passkey and hands the session to the auth state', async () => {
    routeFetch({ 'GET /api/v1/auth/capabilities': () => ({ body: { passwordReset: false, passkey: true } }) })
    signInWithPasskey.mockResolvedValue({ token: 't', csrfToken: 'csrf-9', user, expiresAt: '' })
    const { authDispatch, apiClient } = renderLogin()
    const userEv = userEvent.setup()

    await userEv.click(await screen.findByRole('button', { name: 'Mit Passkey anmelden' }))

    await waitFor(() => expect(authDispatch).toHaveBeenCalledWith({ type: 'LOGIN_SUCCESS', payload: { csrfToken: 'csrf-9', user } }))
    expect(apiClient.setCsrfToken).toHaveBeenCalledWith('csrf-9')
  })

  it('stays silent when the prompt is dismissed and reports real failures', async () => {
    routeFetch({ 'GET /api/v1/auth/capabilities': () => ({ body: { passwordReset: false, passkey: true } }) })
    renderLogin()
    const userEv = userEvent.setup()
    const button = await screen.findByRole('button', { name: 'Mit Passkey anmelden' })

    signInWithPasskey.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    await userEv.click(button)
    await waitFor(() => expect(signInWithPasskey).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Passkey-Anmeldung fehlgeschlagen.')).not.toBeInTheDocument()

    signInWithPasskey.mockRejectedValueOnce({ code: 'LOGIN_FAILED', message: 'Sign-in failed' })
    await userEv.click(button)
    expect(await screen.findByText('Passkey-Anmeldung fehlgeschlagen.')).toBeInTheDocument()
  })

  it('starts the autofill request when the browser supports conditional UI', async () => {
    isPasskeyAutofillSupported.mockResolvedValue(true)
    signInWithPasskey.mockReturnValue(new Promise(() => {}))
    routeFetch({ 'GET /api/v1/auth/capabilities': () => ({ body: { passwordReset: false, passkey: true } }) })
    renderLogin()
    await waitFor(() => expect(signInWithPasskey).toHaveBeenCalledWith(expect.anything(), true))
    expect(screen.getByLabelText('Benutzername')).toHaveAttribute('autocomplete', 'username webauthn')
  })
})

describe('LoginPage — forgot password', () => {
  it('offers the link only when mail recovery is available', async () => {
    routeFetch({ 'GET /api/v1/auth/capabilities': () => ({ body: { passwordReset: false, passkey: false } }) })
    renderLogin()
    await waitFor(() => expect(screen.getByLabelText('Benutzername')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Passwort vergessen?' })).not.toBeInTheDocument()
  })

  it('requests a reset and shows the same neutral confirmation', async () => {
    const { calls } = routeFetch({
      'GET /api/v1/auth/capabilities': () => ({ body: { passwordReset: true, passkey: false } }),
      'POST /api/v1/auth/password-reset/request': () => ({ status: 202, body: { ok: true } }),
    })
    renderLogin()
    const userEv = userEvent.setup()

    await userEv.click(await screen.findByRole('button', { name: 'Passwort vergessen?' }))
    await userEv.type(screen.getByLabelText('Benutzername oder E-Mail-Adresse'), 'alice')
    await userEv.click(screen.getByRole('button', { name: 'Link senden' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/Falls ein Konto mit bestätigter E-Mail-Adresse existiert/)
    expect(bodyOf(calls.find((c) => c.key.startsWith('POST'))?.init)).toEqual({ identifier: 'alice' })
  })

  it('shows the wait time when rate limited and can go back to the login form', async () => {
    routeFetch({
      'GET /api/v1/auth/capabilities': () => ({ body: { passwordReset: true, passkey: false } }),
      'POST /api/v1/auth/password-reset/request': () => ({ status: 429, body: { code: 'RATE_LIMITED', message: 'slow' } }),
    })
    renderLogin()
    const userEv = userEvent.setup()

    await userEv.click(await screen.findByRole('button', { name: 'Passwort vergessen?' }))
    await userEv.type(screen.getByLabelText('Benutzername oder E-Mail-Adresse'), 'alice')
    await userEv.click(screen.getByRole('button', { name: 'Link senden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Zu viele Anfragen/)

    await userEv.click(screen.getByRole('button', { name: 'Zurück zur Anmeldung' }))
    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument()
  })
})
