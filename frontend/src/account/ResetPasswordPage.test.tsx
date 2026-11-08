import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetPasswordPage } from './ResetPasswordPage'
import { VerifyEmailPage } from './VerifyEmailPage'
import { bodyOf, routeFetch } from './test-helpers'

function setLocation(path: string, hash: string): void {
  window.history.replaceState(null, '', `${path}${hash}`)
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    setLocation('/reset-password', '#token=u1.secret-token')
  })

  it('removes the token from the address bar', () => {
    render(<ResetPasswordPage />)
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/reset-password')
  })

  it('posts the new password with the token and confirms', async () => {
    const { calls } = routeFetch({ 'POST /api/v1/auth/password-reset/confirm': () => ({ status: 204 }) })
    const user = userEvent.setup()
    render(<ResetPasswordPage />)

    await user.type(screen.getByLabelText('Neues Passwort'), 'a-brand-new-password')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'a-brand-new-password')
    await user.click(screen.getByRole('button', { name: 'Passwort speichern' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Passwort wurde geändert/))
    expect(bodyOf(calls[0]?.init)).toEqual({ token: 'u1.secret-token', password: 'a-brand-new-password' })
  })

  it('validates length and confirmation before calling the server', async () => {
    const { fn } = routeFetch({})
    const user = userEvent.setup()
    render(<ResetPasswordPage />)

    await user.type(screen.getByLabelText('Neues Passwort'), 'short')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'short')
    await user.click(screen.getByRole('button', { name: 'Passwort speichern' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/mindestens 8 Zeichen/)

    await user.clear(screen.getByLabelText('Neues Passwort'))
    await user.type(screen.getByLabelText('Neues Passwort'), 'long-enough-password')
    await user.click(screen.getByRole('button', { name: 'Passwort speichern' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/stimmen nicht überein/)
    expect(fn).not.toHaveBeenCalled()
  })

  it('shows the invalid-link message for an expired or used token', async () => {
    routeFetch({ 'POST /api/v1/auth/password-reset/confirm': () => ({ status: 400, body: { code: 'INVALID_TOKEN', message: 'x' } }) })
    const user = userEvent.setup()
    render(<ResetPasswordPage />)
    await user.type(screen.getByLabelText('Neues Passwort'), 'a-brand-new-password')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'a-brand-new-password')
    await user.click(screen.getByRole('button', { name: 'Passwort speichern' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/ungültig oder abgelaufen/))
  })

  it('shows the invalid-link message and no form when the URL carries no token', () => {
    setLocation('/reset-password', '')
    render(<ResetPasswordPage />)
    expect(screen.getByRole('alert')).toHaveTextContent(/ungültig oder abgelaufen/)
    expect(screen.queryByLabelText('Neues Passwort')).not.toBeInTheDocument()
  })
})

describe('VerifyEmailPage', () => {
  it('confirms the address with the token from the fragment', async () => {
    setLocation('/verify-email', '#token=u1.verify-secret')
    const { calls } = routeFetch({ 'POST /api/v1/auth/email/verify': () => ({ status: 204 }) })
    render(<VerifyEmailPage />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/bestätigt/))
    expect(bodyOf(calls[0]?.init)).toEqual({ token: 'u1.verify-secret' })
    expect(window.location.hash).toBe('')
  })

  it('reports an invalid link', async () => {
    setLocation('/verify-email', '#token=u1.bad')
    routeFetch({ 'POST /api/v1/auth/email/verify': () => ({ status: 400, body: { code: 'INVALID_TOKEN', message: 'x' } }) })
    render(<VerifyEmailPage />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/ungültig oder abgelaufen/))
  })

  it('reports an address that is already taken', async () => {
    setLocation('/verify-email', '#token=u1.taken')
    routeFetch({ 'POST /api/v1/auth/email/verify': () => ({ status: 400, body: { code: 'EMAIL_IN_USE', message: 'x' } }) })
    render(<VerifyEmailPage />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/nicht verwendet werden/))
  })

  it('does not call the server without a token', () => {
    setLocation('/verify-email', '')
    const { fn } = routeFetch({})
    render(<VerifyEmailPage />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(fn).not.toHaveBeenCalled()
  })
})
