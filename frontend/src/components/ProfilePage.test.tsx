import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ProfilePage } from './ProfilePage'
import { AuthContext, type AuthContextValue } from '../state/authContext'
import { initialAuthState } from '../state/authState'
import type { IApiClient } from '../api'
import type { PublicUserInfo } from '../state/authState'

const mockProfile: PublicUserInfo = {
  userId: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  avatarUrl: 'https://example.com/avatar.png',
  role: 'user',
  preferredLanguage: 'de',
  colorScheme: 'system',
  suspended: false,
  mustChangePassword: false,
  createdAt: '2025-01-01T00:00:00Z',
}

function createMockApiClient(overrides?: Partial<IApiClient>): IApiClient {
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
    invalidateAllOtherSessions: vi.fn(),
    getProfile: vi.fn().mockResolvedValue(mockProfile),
    updateProfile: vi.fn().mockResolvedValue(mockProfile),
    changePassword: vi.fn().mockResolvedValue(undefined),
    deleteSelf: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as IApiClient
}

function renderWithAuth(
  ui: React.ReactElement,
  authDispatch = vi.fn(),
) {
  const contextValue: AuthContextValue = {
    authState: { ...initialAuthState, isAuthenticated: true, user: mockProfile },
    authDispatch,
  }
  return render(
    React.createElement(AuthContext.Provider, { value: contextValue }, ui),
  )
}

describe('ProfilePage', () => {
  let apiClient: IApiClient
  let authDispatch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    apiClient = createMockApiClient()
    authDispatch = vi.fn()
  })

  describe('profile loading', () => {
    it('shows loading state initially', () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )
      expect(screen.getByText('Profil wird geladen…')).toBeInTheDocument()
    })

    it('loads and displays profile data on mount', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      expect(screen.getByLabelText('E-Mail')).toHaveValue('test@example.com')
      expect(screen.getByLabelText('Avatar-URL')).toHaveValue('https://example.com/avatar.png')
      expect(screen.getByLabelText('Bevorzugte Sprache')).toHaveValue('de')
      expect(screen.getByLabelText('Farbschema')).toHaveValue('system')
    })

    it('shows error when profile loading fails', async () => {
      const failingClient = createMockApiClient({
        getProfile: vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', message: 'Server error' }),
      })

      renderWithAuth(
        React.createElement(ProfilePage, { apiClient: failingClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument()
      })
    })
  })

  describe('profile validation', () => {
    it('shows error when display name is empty', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      const displayNameInput = screen.getByLabelText('Anzeigename')
      await user.clear(displayNameInput)
      await user.click(screen.getByRole('button', { name: 'Profil speichern' }))

      expect(screen.getByText('Anzeigename darf nicht leer sein.')).toBeInTheDocument()
      expect(apiClient.updateProfile).not.toHaveBeenCalled()
    })

    it('shows error when email is invalid', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('E-Mail')).toHaveValue('test@example.com')
      })

      const user = userEvent.setup()
      const emailInput = screen.getByLabelText('E-Mail')
      await user.clear(emailInput)
      await user.type(emailInput, 'invalid-email')
      await user.click(screen.getByRole('button', { name: 'Profil speichern' }))

      expect(screen.getByText('E-Mail-Adresse ist nicht gültig.')).toBeInTheDocument()
      expect(apiClient.updateProfile).not.toHaveBeenCalled()
    })

    it('shows error when avatar URL does not start with http(s)://', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Avatar-URL')).toHaveValue('https://example.com/avatar.png')
      })

      const user = userEvent.setup()
      const avatarInput = screen.getByLabelText('Avatar-URL')
      await user.clear(avatarInput)
      await user.type(avatarInput, 'ftp://example.com/avatar.png')
      await user.click(screen.getByRole('button', { name: 'Profil speichern' }))

      expect(screen.getByText('Avatar-URL muss mit http:// oder https:// beginnen.')).toBeInTheDocument()
      expect(apiClient.updateProfile).not.toHaveBeenCalled()
    })

    it('allows empty email and avatar URL', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('E-Mail')).toHaveValue('test@example.com')
      })

      const user = userEvent.setup()
      await user.clear(screen.getByLabelText('E-Mail'))
      await user.clear(screen.getByLabelText('Avatar-URL'))
      await user.click(screen.getByRole('button', { name: 'Profil speichern' }))

      expect(apiClient.updateProfile).toHaveBeenCalled()
    })
  })

  describe('profile update', () => {
    it('shows success message on successful update', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Profil speichern' }))

      await waitFor(() => {
        expect(screen.getByText('Profil erfolgreich aktualisiert.')).toBeInTheDocument()
      })
    })

    it('shows API error on failed update', async () => {
      const failingClient = createMockApiClient({
        updateProfile: vi.fn().mockRejectedValue({ code: 'VALIDATION_ERROR', message: 'E-Mail ungültig' }),
      })

      renderWithAuth(
        React.createElement(ProfilePage, { apiClient: failingClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Profil speichern' }))

      await waitFor(() => {
        expect(screen.getByText('E-Mail ungültig')).toBeInTheDocument()
      })
    })
  })

  describe('password change', () => {
    it('shows error when current password is empty', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      await user.type(screen.getByLabelText('Neues Passwort'), 'newpass123')
      await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

      expect(screen.getByText('Aktuelles Passwort darf nicht leer sein.')).toBeInTheDocument()
      expect(apiClient.changePassword).not.toHaveBeenCalled()
    })

    it('shows error when new password is too short', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      await user.type(screen.getByLabelText('Aktuelles Passwort'), 'oldpass123')
      await user.type(screen.getByLabelText('Neues Passwort'), 'short')
      await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

      expect(screen.getByText('Neues Passwort muss mindestens 8 Zeichen lang sein.')).toBeInTheDocument()
      expect(apiClient.changePassword).not.toHaveBeenCalled()
    })

    it('shows success message on successful password change', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      await user.type(screen.getByLabelText('Aktuelles Passwort'), 'oldpass123')
      await user.type(screen.getByLabelText('Neues Passwort'), 'newpass123')
      await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

      await waitFor(() => {
        expect(screen.getByText('Passwort erfolgreich geändert.')).toBeInTheDocument()
      })
      expect(apiClient.changePassword).toHaveBeenCalledWith('oldpass123', 'newpass123')
    })

    it('shows API error on failed password change', async () => {
      const failingClient = createMockApiClient({
        changePassword: vi.fn().mockRejectedValue({ code: 'INVALID_CREDENTIALS', message: 'Falsches Passwort' }),
      })

      renderWithAuth(
        React.createElement(ProfilePage, { apiClient: failingClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      await user.type(screen.getByLabelText('Aktuelles Passwort'), 'wrongpass')
      await user.type(screen.getByLabelText('Neues Passwort'), 'newpass123')
      await user.click(screen.getByRole('button', { name: 'Passwort ändern' }))

      await waitFor(() => {
        expect(screen.getByText('Falsches Passwort')).toBeInTheDocument()
      })
    })
  })

  describe('account deletion', () => {
    it('shows error when confirmation password is empty', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Konto löschen' }))

      expect(screen.getByText('Passwort zur Bestätigung darf nicht leer sein.')).toBeInTheDocument()
      expect(apiClient.deleteSelf).not.toHaveBeenCalled()
    })

    it('requires double-click confirmation for deletion', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      await user.type(screen.getByLabelText('Passwort zur Bestätigung'), 'mypassword')
      await user.click(screen.getByRole('button', { name: 'Konto löschen' }))

      // First click shows confirmation
      expect(screen.getByText('Wirklich löschen — Klicken zur Bestätigung')).toBeInTheDocument()
      expect(apiClient.deleteSelf).not.toHaveBeenCalled()

      // Second click performs deletion
      await user.click(screen.getByRole('button', { name: 'Konto endgültig löschen' }))

      await waitFor(() => {
        expect(apiClient.deleteSelf).toHaveBeenCalledWith('mypassword')
      })
      expect(authDispatch).toHaveBeenCalledWith({ type: 'LOGOUT' })
    })

    it('shows API error on failed deletion', async () => {
      const failingClient = createMockApiClient({
        deleteSelf: vi.fn().mockRejectedValue({ code: 'OWNS_VAULTS', message: 'Vaults müssen zuerst gelöscht werden' }),
      })

      renderWithAuth(
        React.createElement(ProfilePage, { apiClient: failingClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      await user.type(screen.getByLabelText('Passwort zur Bestätigung'), 'mypassword')
      // First click for confirmation
      await user.click(screen.getByRole('button', { name: 'Konto löschen' }))
      // Second click to actually delete
      await user.click(screen.getByRole('button', { name: 'Konto endgültig löschen' }))

      await waitFor(() => {
        expect(screen.getByText('Vaults müssen zuerst gelöscht werden')).toBeInTheDocument()
      })
      expect(authDispatch).not.toHaveBeenCalledWith({ type: 'LOGOUT' })
    })
  })

  describe('accessibility', () => {
    it('has visible labels for all form fields', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toBeInTheDocument()
      })

      expect(screen.getByLabelText('E-Mail')).toBeInTheDocument()
      expect(screen.getByLabelText('Avatar-URL')).toBeInTheDocument()
      expect(screen.getByLabelText('Bevorzugte Sprache')).toBeInTheDocument()
      expect(screen.getByLabelText('Farbschema')).toBeInTheDocument()
      expect(screen.getByLabelText('Aktuelles Passwort')).toBeInTheDocument()
      expect(screen.getByLabelText('Neues Passwort')).toBeInTheDocument()
      expect(screen.getByLabelText('Passwort zur Bestätigung')).toBeInTheDocument()
    })

    it('sets aria-invalid on fields with errors', async () => {
      renderWithAuth(
        React.createElement(ProfilePage, { apiClient }),
        authDispatch,
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Anzeigename')).toHaveValue('Test User')
      })

      const user = userEvent.setup()
      await user.clear(screen.getByLabelText('Anzeigename'))
      await user.click(screen.getByRole('button', { name: 'Profil speichern' }))

      expect(screen.getByLabelText('Anzeigename')).toHaveAttribute('aria-invalid', 'true')
    })
  })
})
