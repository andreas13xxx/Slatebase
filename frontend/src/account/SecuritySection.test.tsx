import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { IApiClient } from '../api'
import type { SecurityOverview } from './accountApi'

const registerPasskey = vi.fn()
const isPasskeySupported = vi.fn(() => true)

vi.mock('./passkeyClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./passkeyClient')>()
  return {
    ...actual,
    isPasskeySupported: () => isPasskeySupported(),
    registerPasskey: (...args: unknown[]) => registerPasskey(...args),
  }
})

import { SecuritySection } from './SecuritySection'
import { bodyOf, routeFetch } from './test-helpers'

const apiClient = { getCsrfToken: () => 'csrf-1' } as unknown as IApiClient

const passkey = {
  id: 'p1',
  name: 'Laptop',
  rpId: 'notes.example.org',
  createdAt: '2026-03-01T00:00:00.000Z',
  lastUsedAt: null,
  transports: [],
}

function overview(overrides: Partial<SecurityOverview> = {}): SecurityOverview {
  return { email: 'alice@example.org', emailVerified: true, pendingEmail: null, passkeys: [], mailAvailable: true, ...overrides }
}

function setup(sec: SecurityOverview, passkeyCapable = true) {
  const state = { security: sec }
  const routes = routeFetch({
    'GET /api/v1/users/me/security': () => ({ body: state.security }),
    'GET /api/v1/auth/capabilities': () => ({ body: { passwordReset: true, passkey: passkeyCapable } }),
    'PUT /api/v1/users/me/email': () => ({ status: 202, body: { ok: true } }),
    'PUT /api/v1/users/me/passkeys/p1': () => ({ body: { ...passkey, name: 'Phone' } }),
    'DELETE /api/v1/users/me/passkeys/p1': () => ({ status: 204 }),
  })
  return { state, ...routes }
}

beforeEach(() => {
  registerPasskey.mockReset()
  isPasskeySupported.mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SecuritySection — email', () => {
  it('shows the address with its confirmation state', async () => {
    setup(overview())
    render(<SecuritySection apiClient={apiClient} />)
    expect(await screen.findByText('alice@example.org')).toBeInTheDocument()
    expect(screen.getByText('bestätigt')).toBeInTheDocument()
  })

  it('marks an unconfirmed address and shows a pending change', async () => {
    setup(overview({ emailVerified: false, pendingEmail: 'new@example.org' }))
    render(<SecuritySection apiClient={apiClient} />)
    expect(await screen.findByText('nicht bestätigt')).toBeInTheDocument()
    expect(screen.getByText(/Wartet auf Bestätigung: new@example.org/)).toBeInTheDocument()
  })

  it('requests a confirmation mail with the password', async () => {
    const { calls } = setup(overview({ email: '', emailVerified: false }))
    const user = userEvent.setup()
    render(<SecuritySection apiClient={apiClient} />)

    await user.type(await screen.findByLabelText('Neue Adresse'), 'new@example.org')
    await user.type(screen.getByLabelText('Passwort zur Bestätigung', { selector: '#account-email-password' }), 'secret-pw')
    await user.click(screen.getByRole('button', { name: 'Bestätigungsmail senden' }))

    await waitFor(() => expect(screen.getByText(/Bestätigungsmail gesendet/)).toBeInTheDocument())
    const put = calls.find((c) => c.key === 'PUT /api/v1/users/me/email')
    expect(bodyOf(put?.init)).toEqual({ email: 'new@example.org', password: 'secret-pw' })
    expect((put?.init?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1')
  })

  it('explains that only an admin can reset when mail delivery is off', async () => {
    setup(overview({ mailAvailable: false }))
    render(<SecuritySection apiClient={apiClient} />)
    expect(await screen.findByText(/Mailversand ist nicht eingerichtet/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Neue Adresse')).not.toBeInTheDocument()
  })
})

describe('SecuritySection — passkeys', () => {
  it('lists passkeys with domain and usage', async () => {
    setup(overview({ passkeys: [passkey] }))
    render(<SecuritySection apiClient={apiClient} />)
    expect(await screen.findByText('Laptop')).toBeInTheDocument()
    expect(screen.getByText(/Domain: notes\.example\.org/)).toBeInTheDocument()
    expect(screen.getByText(/Noch nie benutzt/)).toBeInTheDocument()
  })

  it('registers a passkey after re-entering the password', async () => {
    registerPasskey.mockResolvedValue(passkey)
    setup(overview())
    const user = userEvent.setup()
    render(<SecuritySection apiClient={apiClient} />)

    await user.click(await screen.findByRole('button', { name: 'Passkey hinzufügen' }))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Work laptop')
    await user.type(screen.getByLabelText('Passwort zur Bestätigung', { selector: '#account-passkey-password' }), 'secret-pw')
    await user.click(screen.getByRole('button', { name: 'Passkey anlegen' }))

    await waitFor(() => expect(registerPasskey).toHaveBeenCalledWith(expect.anything(), 'secret-pw', 'Work laptop'))
    await waitFor(() => expect(screen.getByText('Passkey hinzugefügt.')).toBeInTheDocument())
  })

  it('reports a dismissed browser prompt and a wrong password differently', async () => {
    const user = userEvent.setup()
    setup(overview())
    render(<SecuritySection apiClient={apiClient} />)
    await user.click(await screen.findByRole('button', { name: 'Passkey hinzufügen' }))
    await user.type(screen.getByLabelText('Passwort zur Bestätigung', { selector: '#account-passkey-password' }), 'pw')

    registerPasskey.mockRejectedValueOnce(Object.assign(new Error('dismissed'), { name: 'NotAllowedError' }))
    await user.click(screen.getByRole('button', { name: 'Passkey anlegen' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Vorgang abgebrochen.'))

    registerPasskey.mockRejectedValueOnce({ code: 'INVALID_PASSWORD', message: 'x' })
    await user.click(screen.getByRole('button', { name: 'Passkey anlegen' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Das Passwort ist nicht korrekt.'))
  })

  it('hides the add button and explains when passkeys are unavailable for this origin', async () => {
    setup(overview(), false)
    render(<SecuritySection apiClient={apiClient} />)
    expect(await screen.findByText(/Passkeys sind unter dieser Adresse nicht verfügbar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Passkey hinzufügen' })).not.toBeInTheDocument()
  })

  it('explains when the browser has no WebAuthn support', async () => {
    isPasskeySupported.mockReturnValue(false)
    setup(overview())
    render(<SecuritySection apiClient={apiClient} />)
    expect(await screen.findByText(/Browser unterstützt keine Passkeys/)).toBeInTheDocument()
  })

  it('renames a passkey', async () => {
    const { calls } = setup(overview({ passkeys: [passkey] }))
    const user = userEvent.setup()
    render(<SecuritySection apiClient={apiClient} />)

    await user.click(await screen.findByRole('button', { name: 'Umbenennen' }))
    const input = screen.getByLabelText('Name')
    await user.clear(input)
    await user.type(input, 'Phone')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(calls.some((c) => c.key === 'PUT /api/v1/users/me/passkeys/p1')).toBe(true))
    expect(bodyOf(calls.find((c) => c.key.startsWith('PUT /api/v1/users/me/passkeys'))?.init)).toEqual({ name: 'Phone' })
  })

  it('asks for confirmation before deleting a passkey', async () => {
    const { calls } = setup(overview({ passkeys: [passkey] }))
    const user = userEvent.setup()
    render(<SecuritySection apiClient={apiClient} />)

    await user.click(await screen.findByRole('button', { name: 'Löschen' }))
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false)
    const message = await screen.findByText(/Passkey „Laptop“ löschen/)
    const modal = message.closest('.confirm-modal')
    if (!(modal instanceof HTMLElement)) throw new Error('confirm modal not found')
    await user.click(within(modal).getByRole('button', { name: 'Löschen' }))

    await waitFor(() => expect(calls.some((c) => c.key === 'DELETE /api/v1/users/me/passkeys/p1')).toBe(true))
  })
})
