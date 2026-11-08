import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { IApiClient } from '../api'
import { AdminUsersPage } from './AdminUsersPage'
import { routeFetch } from '../account/test-helpers'

const apiClient = { getCsrfToken: () => 'csrf-1' } as unknown as IApiClient

function userRow(overrides: Record<string, unknown>) {
  return {
    userId: 'u1', username: 'alice', displayName: 'Alice', email: 'alice@example.org', role: 'user', suspended: false,
    mustChangePassword: false, createdAt: '2025-01-01T00:00:00Z', emailVerified: true, passkeyCount: 2, ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdminUsersPage — passkeys and mail confirmation', () => {
  it('shows whether the address is confirmed', async () => {
    routeFetch({
      'GET /api/v1/admin/users': () => ({
        body: {
          items: [userRow({}), userRow({ userId: 'u2', username: 'bob', email: 'bob@example.org', emailVerified: false, passkeyCount: 0 })],
          total: 2, page: 1, pageSize: 20, totalPages: 1,
        },
      }),
    })
    render(<AdminUsersPage apiClient={apiClient} />)
    expect(await screen.findByText('alice@example.org')).toBeInTheDocument()
    const aliceRow = screen.getByText('alice@example.org').closest('tr')
    const bobRow = screen.getByText('bob@example.org').closest('tr')
    expect(within(aliceRow as HTMLElement).getByText('bestätigt')).toBeInTheDocument()
    expect(within(bobRow as HTMLElement).getByText('nicht bestätigt')).toBeInTheDocument()
  })

  it('offers "remove all passkeys" only for accounts that have passkeys', async () => {
    routeFetch({
      'GET /api/v1/admin/users': () => ({
        body: {
          items: [userRow({}), userRow({ userId: 'u2', username: 'bob', passkeyCount: 0 })],
          total: 2, page: 1, pageSize: 20, totalPages: 1,
        },
      }),
    })
    render(<AdminUsersPage apiClient={apiClient} />)
    await screen.findByText('bob')
    expect(screen.getByRole('button', { name: 'Alle Passkeys entfernen: alice' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Alle Passkeys entfernen: bob' })).not.toBeInTheDocument()
  })

  it('removes all passkeys after confirmation', async () => {
    const { calls } = routeFetch({
      'GET /api/v1/admin/users': () => ({ body: { items: [userRow({})], total: 1, page: 1, pageSize: 20, totalPages: 1 } }),
      'DELETE /api/v1/admin/users/u1/passkeys': () => ({ body: { removed: 2 } }),
    })
    const user = userEvent.setup()
    render(<AdminUsersPage apiClient={apiClient} />)

    await user.click(await screen.findByRole('button', { name: 'Alle Passkeys entfernen: alice' }))
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false)
    const message = await screen.findByText(/Alle Passkeys von alice entfernen/)
    const modal = message.closest('.confirm-modal')
    if (!(modal instanceof HTMLElement)) throw new Error('confirm modal not found')
    await user.click(within(modal).getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() => expect(calls.some((c) => c.key === 'DELETE /api/v1/admin/users/u1/passkeys')).toBe(true))
    expect(await screen.findByText(/Passkeys von alice entfernt \(2\)/)).toBeInTheDocument()
    const del = calls.find((c) => c.key.startsWith('DELETE'))
    expect((del?.init?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1')
  })
})
