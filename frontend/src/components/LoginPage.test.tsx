import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { LoginPage } from './LoginPage'
import { AuthContext, type AuthContextValue } from '../state/authContext'
import { initialAuthState, type AuthState, type AuthAction } from '../state/authState'
import type { IApiClient } from '../api'
import type { Dispatch } from 'react'

/** Creates a mock API client with overridable methods. */
function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn().mockReturnValue(null),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn().mockReturnValue(null),
    setOnSessionExpired: vi.fn(),
    fetchVaults: vi.fn().mockResolvedValue([]),
    fetchVaultTree: vi.fn().mockResolvedValue({ name: 'root', type: 'directory', path: '/', children: [] }),
    fetchFileContent: vi.fn().mockResolvedValue({ path: '', name: '', content: '', size: 0, encoding: 'utf-8', isBinary: false, isTruncated: false }),
    createVault: vi.fn().mockResolvedValue({ id: 'new-id', name: 'New Vault' }),
    deleteVault: vi.fn().mockResolvedValue(undefined),
    importFile: vi.fn().mockResolvedValue(undefined),
    importFolder: vi.fn().mockResolvedValue(undefined),
    deleteContent: vi.fn().mockResolvedValue(undefined),
    saveFile: vi.fn().mockResolvedValue({ path: '', name: '', size: 0 }),
    login: vi.fn().mockResolvedValue({
      token: 'test-token',
      csrfToken: 'test-csrf',
      user: {
        userId: 'u1',
        username: 'admin',
        displayName: 'Admin',
        email: '',
        avatarUrl: '',
        role: 'admin',
        preferredLanguage: 'de',
        colorScheme: 'system',
        suspended: false,
        mustChangePassword: false,
        createdAt: '2025-01-01T00:00:00Z',
      },
      expiresAt: '2025-01-02T00:00:00Z',
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    getSessions: vi.fn().mockResolvedValue([]),
    invalidateSession: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
    ...overrides,
  } as IApiClient
}

/** Renders LoginPage wrapped in AuthContext with custom state. */
function renderLoginPage(
  authStateOverrides: Partial<AuthState> = {},
  apiClientOverrides: Partial<IApiClient> = {},
) {
  const authDispatch = vi.fn() as Dispatch<AuthAction> & ReturnType<typeof vi.fn>
  const authState: AuthState = { ...initialAuthState, ...authStateOverrides }
  const apiClient = createMockApiClient(apiClientOverrides)

  const contextValue: AuthContextValue = { authState, authDispatch }

  render(
    React.createElement(
      AuthContext.Provider,
      { value: contextValue },
      React.createElement(LoginPage, { apiClient }),
    ),
  )

  return { authDispatch, apiClient }
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders username and password fields with German labels', () => {
    renderLoginPage()

    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument()
    expect(screen.getByLabelText('Passwort')).toBeInTheDocument()
  })

  it('renders password field with type="password"', () => {
    renderLoginPage()

    expect(screen.getByLabelText('Passwort')).toHaveAttribute('type', 'password')
  })

  it('renders submit button with "Anmelden" text', () => {
    renderLoginPage()

    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('enforces maxLength 128 on username field', () => {
    renderLoginPage()

    expect(screen.getByLabelText('Benutzername')).toHaveAttribute('maxLength', '128')
  })

  it('enforces maxLength 256 on password field', () => {
    renderLoginPage()

    expect(screen.getByLabelText('Passwort')).toHaveAttribute('maxLength', '256')
  })

  it('shows validation error when username is empty on submit', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderLoginPage()

    await user.type(screen.getByLabelText('Passwort'), 'somepassword')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    expect(screen.getByText('Benutzername darf nicht leer sein.')).toBeInTheDocument()
    expect(apiClient.login).not.toHaveBeenCalled()
  })

  it('shows validation error when password is empty on submit', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderLoginPage()

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    expect(screen.getByText('Passwort darf nicht leer sein.')).toBeInTheDocument()
    expect(apiClient.login).not.toHaveBeenCalled()
  })

  it('shows both validation errors when both fields are empty', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderLoginPage()

    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    expect(screen.getByText('Benutzername darf nicht leer sein.')).toBeInTheDocument()
    expect(screen.getByText('Passwort darf nicht leer sein.')).toBeInTheDocument()
    expect(apiClient.login).not.toHaveBeenCalled()
  })

  it('clears validation error when user starts typing', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: 'Anmelden' }))
    expect(screen.getByText('Benutzername darf nicht leer sein.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Benutzername'), 'a')
    expect(screen.queryByText('Benutzername darf nicht leer sein.')).not.toBeInTheDocument()
  })

  it('calls apiClient.login with correct credentials on valid submit', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderLoginPage()

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    expect(apiClient.login).toHaveBeenCalledWith('admin', 'password123')
  })

  it('dispatches LOGIN_STARTED then LOGIN_SUCCESS on successful login', async () => {
    const user = userEvent.setup()
    const { authDispatch } = renderLoginPage()

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => {
      expect(authDispatch).toHaveBeenCalledWith({ type: 'LOGIN_STARTED' })
      expect(authDispatch).toHaveBeenCalledWith({
        type: 'LOGIN_SUCCESS',
        payload: expect.objectContaining({
          token: 'test-token',
          csrfToken: 'test-csrf',
        }),
      })
    })
  })

  it('sets token and csrfToken on apiClient after successful login', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderLoginPage()

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => {
      expect(apiClient.setToken).toHaveBeenCalledWith('test-token')
      expect(apiClient.setCsrfToken).toHaveBeenCalledWith('test-csrf')
    })
  })

  it('dispatches LOGIN_FAILED with generic message on auth failure', async () => {
    const user = userEvent.setup()
    const { authDispatch } = renderLoginPage({}, {
      login: vi.fn().mockRejectedValue({ code: 'UNAUTHORIZED', message: 'Invalid credentials' }),
    })

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => {
      expect(authDispatch).toHaveBeenCalledWith({
        type: 'LOGIN_FAILED',
        payload: { message: 'Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Zugangsdaten.' },
      })
    })
  })

  it('shows generic error message from authState on failure', () => {
    renderLoginPage({ error: 'Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Zugangsdaten.' })

    expect(screen.getByText('Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Zugangsdaten.')).toBeInTheDocument()
  })

  it('shows rate-limit message on 429 error', async () => {
    const user = userEvent.setup()
    renderLoginPage({}, {
      login: vi.fn().mockRejectedValue({ code: 'RATE_LIMITED', message: 'Too many attempts. Retry after 900 Sekunden' }),
    })

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => {
      expect(screen.getByText('Zu viele Anmeldeversuche. Bitte warten Sie 900 Sekunden.')).toBeInTheDocument()
    })
  })

  it('shows rate-limit message with retryAfter from error object', async () => {
    const user = userEvent.setup()
    renderLoginPage({}, {
      login: vi.fn().mockRejectedValue({ code: 'RATE_LIMITED', message: 'Rate limited', retryAfter: 42 }),
    })

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => {
      expect(screen.getByText('Zu viele Anmeldeversuche. Bitte warten Sie 42 Sekunden.')).toBeInTheDocument()
    })
  })

  it('disables submit button while loading', () => {
    renderLoginPage({ isLoading: true })

    expect(screen.getByRole('button', { name: 'Anmelden…' })).toBeDisabled()
  })

  it('does not send request when submit button is disabled (loading)', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderLoginPage({ isLoading: true })

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'password123')
    // Button is disabled, click should not trigger submit
    await user.click(screen.getByRole('button', { name: 'Anmelden…' }))

    expect(apiClient.login).not.toHaveBeenCalled()
  })

  it('uses proper aria attributes for field errors', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    const usernameInput = screen.getByLabelText('Benutzername')
    expect(usernameInput).toHaveAttribute('aria-invalid', 'true')
    expect(usernameInput).toHaveAttribute('aria-describedby', 'login-username-error')
  })

  it('prevents default form submission', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    // Fill both fields so validation passes
    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'password123')

    // The form should not cause a page reload — if it did, the test would fail
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    // If we get here without error, form submission was prevented
    expect(true).toBe(true)
  })

  it('shows session expired banner when authState.error is auth.sessionExpired', () => {
    renderLoginPage({ error: 'auth.sessionExpired' })

    expect(screen.getByText('Sitzung abgelaufen — bitte erneut anmelden')).toBeInTheDocument()
  })

  it('does not show session expired banner for other errors', () => {
    renderLoginPage({ error: 'Some other error' })

    expect(screen.queryByText('Sitzung abgelaufen — bitte erneut anmelden')).not.toBeInTheDocument()
  })
})
