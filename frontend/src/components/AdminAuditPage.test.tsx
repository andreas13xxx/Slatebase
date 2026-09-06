import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { AdminAuditPage } from './AdminAuditPage'

/** Sample audit response for testing. */
function createAuditResponse(overrides: Partial<{
  items: unknown[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}> = {}) {
  return {
    items: [
      {
        timestamp: '2025-01-15T10:30:00.000Z',
        userId: 'user-1',
        action: 'LOGIN_SUCCESS',
        target: 'user-1',
        ipAddress: '192.168.1.1',
        success: true,
      },
      {
        timestamp: '2025-01-15T09:00:00.000Z',
        userId: null,
        action: 'LOGIN_FAILED',
        target: 'admin',
        ipAddress: '10.0.0.1',
        success: false,
      },
    ],
    total: 2,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    ...overrides,
  }
}

describe('AdminAuditPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the page title', async () => {
    const mockResponse = createAuditResponse()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    render(React.createElement(AdminAuditPage, {}))

    expect(screen.getByRole('heading', { name: 'Audit-Log' })).toBeInTheDocument()
  })

  it('renders filter controls with German labels', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createAuditResponse()),
    })

    render(React.createElement(AdminAuditPage, {}))

    expect(screen.getByLabelText('Aktionstyp')).toBeInTheDocument()
    expect(screen.getByLabelText('Von')).toBeInTheDocument()
    expect(screen.getByLabelText('Bis')).toBeInTheDocument()
  })

  it('displays audit entries in a table after loading', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createAuditResponse()),
    })

    render(React.createElement(AdminAuditPage, {}))

    await waitFor(() => {
      expect(screen.getByText('LOGIN SUCCESS')).toBeInTheDocument()
    })

    // user-1 appears as both userId and target in the first row
    expect(screen.getAllByText('user-1')).toHaveLength(2)
    expect(screen.getByText('192.168.1.1')).toBeInTheDocument()
    // LOGIN_FAILED appears in the dropdown, LOGIN FAILED (formatted) in the table
    expect(screen.getByText('LOGIN FAILED')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
  })

  it('shows dash for null userId', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createAuditResponse()),
    })

    render(React.createElement(AdminAuditPage, {}))

    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument()
    })
  })

  it('shows success/failure indicators', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createAuditResponse()),
    })

    render(React.createElement(AdminAuditPage, {}))

    await waitFor(() => {
      expect(screen.getByText('✓')).toBeInTheDocument()
      expect(screen.getByText('✗')).toBeInTheDocument()
    })
  })

  it('displays total entries count', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createAuditResponse({ total: 42 })),
    })

    render(React.createElement(AdminAuditPage, {}))

    await waitFor(() => {
      expect(screen.getByText('42 Einträge')).toBeInTheDocument()
    })
  })

  it('renders pagination controls', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createAuditResponse({ page: 1, totalPages: 3 })),
    })

    render(React.createElement(AdminAuditPage, {}))

    await waitFor(() => {
      expect(screen.getByText('Seite 1 von 3')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Vorherige' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nächste' })).toBeEnabled()
  })

  it('fetches with action filter when selected', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createAuditResponse()),
    })

    render(React.createElement(AdminAuditPage, {}))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    await user.selectOptions(screen.getByLabelText('Aktionstyp'), 'LOGIN_SUCCESS')

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall?.[0]).toContain('action=LOGIN_SUCCESS')
    })
  })

  it('shows error message on fetch failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal Server Error' }),
    })

    render(React.createElement(AdminAuditPage, {}))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Internal Server Error')
    })
  })

  it('shows empty state when no entries', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createAuditResponse({ items: [], total: 0 })),
    })

    render(React.createElement(AdminAuditPage, {}))

    await waitFor(() => {
      expect(screen.getByText('Keine Einträge gefunden.')).toBeInTheDocument()
    })
  })

  it('does not send an Authorization header — the session authenticates via the HttpOnly cookie', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createAuditResponse()),
    })

    render(React.createElement(AdminAuditPage, {}))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const firstCall = calls[0]
    expect(firstCall?.[1]?.headers?.['Authorization']).toBeUndefined()
  })

  it('renders table headers with correct German labels', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createAuditResponse()),
    })

    render(React.createElement(AdminAuditPage, {}))

    await waitFor(() => {
      expect(screen.getByText('Zeitpunkt')).toBeInTheDocument()
    })

    expect(screen.getByText('Benutzer-ID')).toBeInTheDocument()
    expect(screen.getByText('Aktion')).toBeInTheDocument()
    expect(screen.getByText('Ziel')).toBeInTheDocument()
    expect(screen.getByText('IP-Adresse')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })
})
