import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { IApiClient } from '../api'
import type { AccountSettingsView } from './accountApi'
import { AdminAccountSettingsSection } from './AdminAccountSettingsSection'
import { bodyOf, routeFetch } from './test-helpers'

const apiClient = { getCsrfToken: () => 'csrf-1' } as unknown as IApiClient

const view: AccountSettingsView = {
  smtp: { host: 'smtp.example.org', port: 587, encryption: 'starttls', username: 'mailer', from: 'Slatebase <no-reply@example.org>' },
  mailBaseUrl: '',
  passkeyRpId: '',
  smtpPasswordSet: true,
  resolvedMailBaseUrl: 'https://notes.example.org',
  allowedOrigins: ['https://notes.example.org', 'https://intern.example.org', 'http://localhost:5173'],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdminAccountSettingsSection', () => {
  it('loads the settings and never shows the stored SMTP password', async () => {
    routeFetch({ 'GET /api/v1/admin/account-settings': () => ({ body: view }) })
    render(<AdminAccountSettingsSection apiClient={apiClient} />)

    expect(await screen.findByLabelText('SMTP-Server')).toHaveValue('smtp.example.org')
    expect(screen.getByLabelText('Passwort', { selector: '#acct-smtp-pass' })).toHaveValue('')
    expect(screen.getByText(/Gespeichert\. Leer lassen, um es zu behalten/)).toBeInTheDocument()
    expect(screen.getByText('Verwendet: https://notes.example.org')).toBeInTheDocument()
  })

  it('offers only HTTPS origins as the base URL for mailed links', async () => {
    routeFetch({ 'GET /api/v1/admin/account-settings': () => ({ body: view }) })
    render(<AdminAccountSettingsSection apiClient={apiClient} />)
    const select = await screen.findByLabelText('Adresse für Links in Mails')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    expect(options).toEqual(['', 'https://notes.example.org', 'https://intern.example.org'])
  })

  it('warns when no HTTPS origin exists', async () => {
    routeFetch({
      'GET /api/v1/admin/account-settings': () => ({
        body: { ...view, resolvedMailBaseUrl: null, allowedOrigins: ['http://localhost:5173'] },
      }),
    })
    render(<AdminAccountSettingsSection apiClient={apiClient} />)
    expect(await screen.findByText(/Keine HTTPS-Origin in der Liste/)).toBeInTheDocument()
  })

  it('saves without a password field when the stored one is kept', async () => {
    const { calls } = routeFetch({
      'GET /api/v1/admin/account-settings': () => ({ body: view }),
      'PUT /api/v1/admin/account-settings': () => ({ body: view }),
    })
    const user = userEvent.setup()
    render(<AdminAccountSettingsSection apiClient={apiClient} />)

    await user.clear(await screen.findByLabelText('SMTP-Server'))
    await user.type(screen.getByLabelText('SMTP-Server'), 'mail.example.org')
    await user.type(screen.getByLabelText(/Gemeinsame Domain/), 'example.org')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.getByText('Gespeichert.')).toBeInTheDocument())
    const body = bodyOf(calls.find((c) => c.key.startsWith('PUT'))?.init) as Record<string, unknown>
    expect(body['smtp']).toMatchObject({ host: 'mail.example.org', port: 587, encryption: 'starttls' })
    expect(body['passkeyRpId']).toBe('example.org')
    expect('smtpPassword' in body).toBe(false)
  })

  it('sends a new password, and an empty string when the stored one is removed', async () => {
    const { calls } = routeFetch({
      'GET /api/v1/admin/account-settings': () => ({ body: view }),
      'PUT /api/v1/admin/account-settings': () => ({ body: view }),
    })
    const user = userEvent.setup()
    render(<AdminAccountSettingsSection apiClient={apiClient} />)

    await user.type(await screen.findByLabelText('Passwort', { selector: '#acct-smtp-pass' }), 'hunter2')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(calls.filter((c) => c.key.startsWith('PUT'))).toHaveLength(1))
    expect(bodyOf(calls.find((c) => c.key.startsWith('PUT'))?.init)).toMatchObject({ smtpPassword: 'hunter2' })

    await user.click(await screen.findByLabelText('Gespeichertes Passwort entfernen'))
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(calls.filter((c) => c.key.startsWith('PUT'))).toHaveLength(2))
    expect(bodyOf(calls.filter((c) => c.key.startsWith('PUT'))[1]?.init)).toMatchObject({ smtpPassword: '' })
  })

  it('shows the server validation message when saving fails', async () => {
    routeFetch({
      'GET /api/v1/admin/account-settings': () => ({ body: view }),
      'PUT /api/v1/admin/account-settings': () => ({ status: 400, body: { code: 'VALIDATION_ERROR', message: 'mailBaseUrl must be one of the allowed origins' } }),
    })
    const user = userEvent.setup()
    render(<AdminAccountSettingsSection apiClient={apiClient} />)
    await user.click(await screen.findByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('mailBaseUrl must be one of the allowed origins'))
  })

  it('sends a test mail and shows the SMTP error', async () => {
    let fail = false
    const { calls } = routeFetch({
      'GET /api/v1/admin/account-settings': () => ({ body: view }),
      'POST /api/v1/admin/account-settings/test': () =>
        fail ? { status: 502, body: { code: 'SMTP_TEST_FAILED', message: 'connect ECONNREFUSED' } } : { body: { ok: true } },
    })
    const user = userEvent.setup()
    render(<AdminAccountSettingsSection apiClient={apiClient} />)

    await user.type(await screen.findByLabelText('Testmail an'), 'admin@example.org')
    await user.click(screen.getByRole('button', { name: 'Testmail senden' }))
    await waitFor(() => expect(screen.getByText('Testmail gesendet.')).toBeInTheDocument())
    expect(bodyOf(calls.find((c) => c.key.includes('/test'))?.init)).toEqual({ to: 'admin@example.org' })

    fail = true
    await user.click(screen.getByRole('button', { name: 'Testmail senden' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Versand fehlgeschlagen: connect ECONNREFUSED'))
  })

  it('shows a load error when the settings cannot be read', async () => {
    routeFetch({ 'GET /api/v1/admin/account-settings': () => ({ status: 403, body: { code: 'FORBIDDEN', message: 'no' } }) })
    render(<AdminAccountSettingsSection apiClient={apiClient} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/konnten nicht geladen werden/)
  })
})
