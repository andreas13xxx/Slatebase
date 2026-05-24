import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ChangePasswordPage } from './ChangePasswordPage'
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
    login: vi.fn().mockResolvedValue({ token: 't', csrfToken: 'c', user: {}, expiresAt: '' }),
    logout: vi.fn().mockResolvedValue(undefined),
    getSessions: vi.fn().mockResolvedValue([]),
    invalidateSession: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn().mockResolvedValue(undefined),
    deleteSelf: vi.fn(),
    ...overrides,
  } as IApiClient
}

/** Renders ChangePasswordPage wrapped in AuthContext with custom state. */
function renderChangePasswordPage(
  authStateOverrides: Partial<AuthState> = {},
  apiClientOverrides: Partial<IApiClient> = {},
) {
  const authDispatch = vi.fn() as Dispatch<AuthAction> & ReturnType<typeof vi.fn>
  const authState: AuthState = { ...initialAuthState, isAuthenticated: true, mustChangePassword: true, ...authStateOverrides }
  const apiClient = createMockApiClient(apiClientOverrides)

  const contextValue: AuthContextValue = { authState, authDispatch }

  render(
    React.createElement(
      AuthContext.Provider,
      { value: contextValue },
      React.createElement(ChangePasswordPage, { apiClient }),
    ),
  )

  return { authDispatch, apiClient }
}

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders all three password fields with German labels', () => {
    renderChangePasswordPage()

    expect(screen.getByLabelText('Aktuelles Passwort')).toBeInTheDocument()
    expect(screen.getByLabelText('Neues Passwort')).toBeInTheDocument()
    expect(screen.getByLabelText('Passwort bestätigen')).toBeInTheDocument()
  })

  it('renders all fields with type="password"', () => {
    renderChangePasswordPage()

    expect(screen.getByLabelText('Aktuelles Passwort')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Neues Passwort')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Passwort bestätigen')).toHaveAttribute('type', 'password')
  })

  it('renders submit button with "Passwort ändern" text', () => {
    renderChangePasswordPage()

    expect(screen.getByRole('button', { name: 'Passwort ändern' })).toBeInTheDocument()
  })

  it('shows info text about forced password change', () => {
    renderChangePasswordPage()

    expect(screen.getByText('Sie müssen Ihr Passwort ändern, bevor Sie fortfahren können.')).toBeInTheDocument()
  })

  it('shows error when current password is empty', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderChangePasswordPage()

    await user.type(screen.getByLabelText('Neues Passwort'), 'newpass123')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

    expect(screen.getByText('Aktuelles Passwort darf nicht leer sein.')).toBeInTheDocument()
    expect(apiClient.changePassword).not.toHaveBeenCalled()
  })

  it('shows error when new password is less than 8 characters', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderChangePasswordPage()

    await user.type(screen.getByLabelText('Aktuelles Passwort'), 'oldpass1')
    await user.type(screen.getByLabelText('Neues Passwort'), 'short')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'short')
    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

    expect(screen.getByText('Neues Passwort muss mindestens 8 Zeichen lang sein.')).toBeInTheDocument()
    expect(apiClient.changePassword).not.toHaveBeenCalled()
  })

  it('shows error when new password is same as current password', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderChangePasswordPage()

    await user.type(screen.getByLabelText('Aktuelles Passwort'), 'samepass123')
    await user.type(screen.getByLabelText('Neues Passwort'), 'samepass123')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'samepass123')
    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

    expect(screen.getByText('Neues Passwort muss sich vom aktuellen Passwort unterscheiden.')).toBeInTheDocument()
    expect(apiClient.changePassword).not.toHaveBeenCalled()
  })

  it('shows error when confirmation does not match new password', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderChangePasswordPage()

    await user.type(screen.getByLabelText('Aktuelles Passwort'), 'oldpass1')
    await user.type(screen.getByLabelText('Neues Passwort'), 'newpass123')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'different1')
    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

    expect(screen.getByText('Passwörter stimmen nicht überein.')).toBeInTheDocument()
    expect(apiClient.changePassword).not.toHaveBeenCalled()
  })

  it('calls apiClient.changePassword with correct arguments on valid submit', async () => {
    const user = userEvent.setup()
    const { apiClient } = renderChangePasswordPage()

    await user.type(screen.getByLabelText('Aktuelles Passwort'), 'oldpass1')
    await user.type(screen.getByLabelText('Neues Passwort'), 'newpass123')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

    await waitFor(() => {
      expect(apiClient.changePassword).toHaveBeenCalledWith('oldpass1', 'newpass123')
    })
  })

  it('dispatches PASSWORD_CHANGED on successful password change', async () => {
    const user = userEvent.setup()
    const { authDispatch } = renderChangePasswordPage()

    await user.type(screen.getByLabelText('Aktuelles Passwort'), 'oldpass1')
    await user.type(screen.getByLabelText('Neues Passwort'), 'newpass123')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

    await waitFor(() => {
      expect(authDispatch).toHaveBeenCalledWith({ type: 'PASSWORD_CHANGED' })
    })
  })

  it('shows API error message on failure', async () => {
    const user = userEvent.setup()
    renderChangePasswordPage({}, {
      changePassword: vi.fn().mockRejectedValue({ code: 'INVALID_PASSWORD', message: 'Aktuelles Passwort ist falsch.' }),
    })

    await user.type(screen.getByLabelText('Aktuelles Passwort'), 'wrongpass')
    await user.type(screen.getByLabelText('Neues Passwort'), 'newpass123')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

    await waitFor(() => {
      expect(screen.getByText('Aktuelles Passwort ist falsch.')).toBeInTheDocument()
    })
  })

  it('shows generic error message when API error has no message', async () => {
    const user = userEvent.setup()
    renderChangePasswordPage({}, {
      changePassword: vi.fn().mockRejectedValue(null),
    })

    await user.type(screen.getByLabelText('Aktuelles Passwort'), 'oldpass1')
    await user.type(screen.getByLabelText('Neues Passwort'), 'newpass123')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

    await waitFor(() => {
      expect(screen.getByText('Passwortänderung fehlgeschlagen. Bitte versuchen Sie es erneut.')).toBeInTheDocument()
    })
  })

  it('disables submit button while request is pending', async () => {
    const user = userEvent.setup()
    renderChangePasswordPage({}, {
      changePassword: vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ })),
    })

    await user.type(screen.getByLabelText('Aktuelles Passwort'), 'oldpass1')
    await user.type(screen.getByLabelText('Neues Passwort'), 'newpass123')
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Passwort ändern…' })).toBeDisabled()
    })
  })

  it('uses proper aria attributes for field errors', async () => {
    const user = userEvent.setup()
    renderChangePasswordPage()

    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

    const currentInput = screen.getByLabelText('Aktuelles Passwort')
    expect(currentInput).toHaveAttribute('aria-invalid', 'true')
    expect(currentInput).toHaveAttribute('aria-describedby', 'change-current-password-error')
  })

  it('clears field error when user starts typing', async () => {
    const user = userEvent.setup()
    renderChangePasswordPage()

    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))
    expect(screen.getByText('Aktuelles Passwort darf nicht leer sein.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Aktuelles Passwort'), 'a')
    expect(screen.queryByText('Aktuelles Passwort darf nicht leer sein.')).not.toBeInTheDocument()
  })
})
