import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { AdminUsersPage } from './AdminUsersPage'
import type { IApiClient } from '../api'

/** Sample user data for tests. */
const sampleUsers = [
  {
    userId: 'u1',
    username: 'admin',
    displayName: 'Administrator',
    email: 'admin@example.com',
    avatarUrl: '',
    role: 'admin' as const,
    preferredLanguage: 'de' as const,
    colorScheme: 'system' as const,
    suspended: false,
    mustChangePassword: false,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    userId: 'u2',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: '',
    role: 'user' as const,
    preferredLanguage: 'de' as const,
    colorScheme: 'system' as const,
    suspended: false,
    mustChangePassword: false,
    createdAt: '2025-01-15T00:00:00Z',
  },
  {
    userId: 'u3',
    username: 'suspended-user',
    displayName: 'Suspended',
    email: '',
    avatarUrl: '',
    role: 'user' as const,
    preferredLanguage: 'de' as const,
    colorScheme: 'system' as const,
    suspended: true,
    mustChangePassword: false,
    createdAt: '2025-02-01T00:00:00Z',
  },
]

/** Creates a mock API client with token/csrf support. */
function createMockApiClient(): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn().mockReturnValue('test-token'),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn().mockReturnValue('test-csrf'),
    setOnSessionExpired: vi.fn(),
    fetchVaults: vi.fn(),
    fetchVaultTree: vi.fn(),
    fetchFileContent: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    importFile: vi.fn(),
    importFolder: vi.fn(),
    deleteContent: vi.fn(),
    saveFile: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSessions: vi.fn(),
    invalidateSession: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
  } as IApiClient
}

/** Mocks the global fetch to return a paginated user list. */
function mockFetchUsers(users = sampleUsers, total?: number) {
  const totalCount = total ?? users.length
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({
      items: users,
      total: totalCount,
      page: 1,
      pageSize: 20,
      totalPages: Math.ceil(totalCount / 20),
    })),
  })
}

describe('AdminUsersPage', () => {
  let apiClient: IApiClient

  beforeEach(() => {
    vi.restoreAllMocks()
    apiClient = createMockApiClient()
  })

  it('renders the page title "Benutzerverwaltung"', async () => {
    global.fetch = mockFetchUsers()
    render(React.createElement(AdminUsersPage, { apiClient }))

    expect(screen.getByRole('heading', { name: 'Benutzerverwaltung' })).toBeInTheDocument()
  })

  it('renders the create user form with German labels', async () => {
    global.fetch = mockFetchUsers()
    render(React.createElement(AdminUsersPage, { apiClient }))

    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument()
    expect(screen.getByLabelText('Passwort')).toBeInTheDocument()
    expect(screen.getByLabelText('Rolle')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Erstellen' })).toBeInTheDocument()
  })

  it('loads and displays users on mount', async () => {
    global.fetch = mockFetchUsers()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
      expect(screen.getByText('suspended-user')).toBeInTheDocument()
    })
  })

  it('displays user roles in German', async () => {
    global.fetch = mockFetchUsers()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      // "Administrator" appears in the role dropdown option AND in the table
      // (both as displayName and as role text for the admin user)
      const allAdminTexts = screen.getAllByText('Administrator')
      expect(allAdminTexts.length).toBeGreaterThanOrEqual(2) // dropdown option + table cell(s)
      // "Benutzer" appears in dropdown option + table cells for non-admin users + section title
      const allUserTexts = screen.getAllByText('Benutzer', { exact: false })
      expect(allUserTexts.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('displays suspended status', async () => {
    global.fetch = mockFetchUsers()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Gesperrt')).toBeInTheDocument()
      expect(screen.getAllByText('Aktiv').length).toBe(2)
    })
  })

  it('displays total user count', async () => {
    global.fetch = mockFetchUsers()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Benutzer (3)')).toBeInTheDocument()
    })
  })

  it('shows action buttons for each user', async () => {
    global.fetch = mockFetchUsers()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getAllByText('Rolle ändern').length).toBe(3)
      expect(screen.getAllByText('Passwort zurücksetzen').length).toBe(3)
      expect(screen.getAllByText('Löschen').length).toBe(3)
    })
  })

  it('shows "Sperren" for active users and "Entsperren" for suspended users', async () => {
    global.fetch = mockFetchUsers()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getAllByText('Sperren').length).toBe(2)
      expect(screen.getByText('Entsperren')).toBeInTheDocument()
    })
  })

  it('shows confirmation dialog when delete is clicked', async () => {
    global.fetch = mockFetchUsers()
    const user = userEvent.setup()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByText('Löschen')
    await user.click(deleteButtons[1]!) // Click delete for testuser

    expect(screen.getByText('Benutzer „testuser" wirklich löschen?')).toBeInTheDocument()
    expect(screen.getByText('Bestätigen')).toBeInTheDocument()
    expect(screen.getByText('Abbrechen')).toBeInTheDocument()
  })

  it('closes confirmation dialog on cancel', async () => {
    global.fetch = mockFetchUsers()
    const user = userEvent.setup()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByText('Löschen')
    await user.click(deleteButtons[1]!)

    await user.click(screen.getByText('Abbrechen'))

    expect(screen.queryByText('Benutzer „testuser" wirklich löschen?')).not.toBeInTheDocument()
  })

  it('calls delete endpoint on confirm', async () => {
    const fetchMock = mockFetchUsers()
    global.fetch = fetchMock
    const user = userEvent.setup()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    // Mock the delete response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    })
    // Mock the reload
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        items: [sampleUsers[0]],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      })),
    })

    const deleteButtons = screen.getAllByText('Löschen')
    await user.click(deleteButtons[1]!)
    await user.click(screen.getByText('Bestätigen'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/admin/users/u2',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('shows error message when API returns last-admin error', async () => {
    const fetchMock = mockFetchUsers()
    global.fetch = fetchMock
    const user = userEvent.setup()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    // Mock the delete response with last-admin error
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: () => Promise.resolve(JSON.stringify({
        code: 'LAST_ADMIN',
        message: 'Mindestens ein Administrator muss existieren',
      })),
    })

    const deleteButtons = screen.getAllByText('Löschen')
    await user.click(deleteButtons[0]!)
    await user.click(screen.getByText('Bestätigen'))

    await waitFor(() => {
      expect(screen.getByText('Mindestens ein Administrator muss existieren')).toBeInTheDocument()
    })
  })

  it('creates a user via the form', async () => {
    const fetchMock = mockFetchUsers()
    global.fetch = fetchMock
    const user = userEvent.setup()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    // Mock the create response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify({
        userId: 'u4',
        username: 'newuser',
        displayName: 'newuser',
        email: '',
        role: 'user',
        suspended: false,
        mustChangePassword: false,
        createdAt: '2025-03-01T00:00:00Z',
      })),
    })
    // Mock the reload
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        items: sampleUsers,
        total: 4,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      })),
    })

    await user.type(screen.getByLabelText('Benutzername'), 'newuser')
    await user.type(screen.getByLabelText('Passwort'), 'securepass123')
    await user.click(screen.getByRole('button', { name: 'Erstellen' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/admin/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ username: 'newuser', password: 'securepass123', role: 'user' }),
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText('Benutzer „newuser" wurde erstellt.')).toBeInTheDocument()
    })
  })

  it('shows error when user list fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(JSON.stringify({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      })),
    })

    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Internal server error')).toBeInTheDocument()
    })
  })

  it('sends auth headers with requests', async () => {
    const fetchMock = mockFetchUsers()
    global.fetch = fetchMock
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/users'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        }),
      )
    })
  })

  it('shows pagination controls when multiple pages exist', async () => {
    // Create 25 users to trigger pagination
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        items: sampleUsers,
        total: 45,
        page: 1,
        pageSize: 20,
        totalPages: 3,
      })),
    })

    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Vorherige')).toBeInTheDocument()
      expect(screen.getByText('Nächste')).toBeInTheDocument()
      expect(screen.getByText('Seite 1 von 3')).toBeInTheDocument()
    })
  })

  it('disables "Vorherige" button on first page', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        items: sampleUsers,
        total: 45,
        page: 1,
        pageSize: 20,
        totalPages: 3,
      })),
    })

    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Vorherige')).toBeDisabled()
      expect(screen.getByText('Nächste')).not.toBeDisabled()
    })
  })

  it('shows temporary password after reset', async () => {
    const fetchMock = mockFetchUsers()
    global.fetch = fetchMock
    const user = userEvent.setup()
    render(React.createElement(AdminUsersPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    // Mock the reset password response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        userId: 'u2',
        temporaryPassword: 'TempPass123',
      })),
    })

    const resetButtons = screen.getAllByText('Passwort zurücksetzen')
    await user.click(resetButtons[1]!)

    await waitFor(() => {
      expect(screen.getByText('TempPass123')).toBeInTheDocument()
    })
  })
})
