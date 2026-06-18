/**
 * Unit tests for SettingsPanel component.
 * Tests rendering, keyboard shortcuts, overlay close, and ARIA attributes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { SettingsPanel } from './SettingsPanel'
import { AuthContext, type AuthContextValue } from '../../state/authContext'
import { AppContext, type AppContextValue } from '../../state'
import type { AuthState } from '../../state/authState'
import type { IApiClient } from '../../api'

/** Creates a minimal mock API client. */
function createMockApiClient(): IApiClient {
  return {
    fetchVaults: vi.fn().mockResolvedValue([]),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    fetchDirectoryTree: vi.fn(),
    fetchFileContent: vi.fn(),
    saveFileContent: vi.fn(),
    createFile: vi.fn(),
    createFolder: vi.fn(),
    deleteItem: vi.fn(),
    renameItem: vi.fn(),
    moveItem: vi.fn(),
    importFiles: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
    getSessions: vi.fn().mockResolvedValue([]),
    deleteSession: vi.fn(),
    deleteOtherSessions: vi.fn(),
    changePassword: vi.fn(),
    updateProfile: vi.fn(),
    getProfile: vi.fn(),
    deleteAccount: vi.fn(),
  } as unknown as IApiClient
}

/** Creates a mock AuthContext + AppContext wrapper for tests. */
function createAuthWrapper(overrides: Partial<AuthState> = {}) {
  const authState: AuthState = {
    isAuthenticated: true,
    user: {
      userId: 'u1',
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      avatarUrl: '',
      role: 'user',
      preferredLanguage: 'de',
      colorScheme: 'system',
      suspended: false,
      mustChangePassword: false,
      createdAt: '2024-01-01T00:00:00Z',
    },
    token: 'test-token',
    csrfToken: 'test-csrf',
    mustChangePassword: false,
    isLoading: false,
    error: null,
    ...overrides,
  }

  const authValue: AuthContextValue = {
    authState,
    authDispatch: vi.fn(),
  }

  const appValue: AppContextValue = {
    state: {
      vaults: [],
      selectedVaultId: null,
      directoryTree: null,
      vaultTrees: {},
      vaultTreesLoading: new Set(),
      selectedFile: null,
      loading: false,
      error: null,
    },
    dispatch: vi.fn(),
    apiClient: createMockApiClient(),
  }

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      AuthContext.Provider,
      { value: authValue },
      React.createElement(AppContext.Provider, { value: appValue }, children),
    )
  }
}

/** Creates an admin AuthContext wrapper (role: 'admin') with AppContext. */
function createAdminWrapper() {
  return createAuthWrapper({ user: {
    userId: 'u1',
    username: 'adminuser',
    displayName: 'Admin User',
    email: 'admin@example.com',
    avatarUrl: '',
    role: 'admin',
    preferredLanguage: 'de',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: '2024-01-01T00:00:00Z',
  } })
}

describe('SettingsPanel', () => {
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when open is false', () => {
    const { container } = render(
      React.createElement(SettingsPanel, { open: false, onClose }),
      { wrapper: createAuthWrapper() },
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders overlay and panel when open is true', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Einstellungen')).toBeInTheDocument()
  })

  it('has correct ARIA attributes on the dialog', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Einstellungen')
  })

  it('renders navigation landmark', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('renders main content landmark', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('closes when Escape is pressed', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    const panel = screen.getByRole('dialog').querySelector('.settings-panel')!
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when overlay background is clicked', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    const overlay = screen.getByRole('dialog')
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when panel content is clicked', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    const panel = screen.getByRole('dialog').querySelector('.settings-panel')!
    fireEvent.click(panel)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when the close button is clicked', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    const closeBtn = screen.getByLabelText('Einstellungen schließen')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('registers global Ctrl+, shortcut', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    // Ctrl+, while panel is open should focus the panel (not close)
    const event = new KeyboardEvent('keydown', {
      key: ',',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)
    // Panel should still be open — onClose should not have been called
    expect(onClose).not.toHaveBeenCalled()
  })

  it('has a mobile navigation toggle button', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    const toggleBtn = screen.getByRole('button', { name: /Navigation/i })
    expect(toggleBtn).toBeInTheDocument()
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('toggles mobile nav open state on button click', () => {
    render(
      React.createElement(SettingsPanel, { open: true, onClose }),
      { wrapper: createAuthWrapper() },
    )
    const toggleBtn = screen.getByRole('button', { name: /Navigation/i })
    fireEvent.click(toggleBtn)
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggleBtn)
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
  })

  describe('section navigation', () => {
    it('navigating to "Sitzungen" shows the section heading', () => {
      render(
        React.createElement(SettingsPanel, { open: true, onClose }),
        { wrapper: createAuthWrapper() },
      )
      const sessionsBtn = screen.getByRole('button', { name: 'Sitzungen' })
      fireEvent.click(sessionsBtn)
      expect(screen.getByRole('heading', { level: 2, name: 'Sitzungen' })).toBeInTheDocument()
    })

    it('focuses the h2 heading after section change', async () => {
      render(
        React.createElement(SettingsPanel, { open: true, onClose }),
        { wrapper: createAuthWrapper() },
      )
      const sessionsBtn = screen.getByRole('button', { name: 'Sitzungen' })
      fireEvent.click(sessionsBtn)
      // SettingsContent uses useEffect to focus h2
      await waitFor(() => {
        const heading = screen.getByRole('heading', { level: 2, name: 'Sitzungen' })
        expect(document.activeElement).toBe(heading)
      })
    })

    it('disables vault sections when no vault is active in app state', () => {
      const appValue = {
        state: {
          vaults: [{ id: 'v1', name: 'Test Vault', permission: 'owner' }],
          selectedVaultId: null,
          directoryTree: null,
          vaultTrees: {},
          vaultTreesLoading: new Set(),
          selectedFile: null,
          loading: false,
          error: null,
        },
        dispatch: vi.fn(),
        apiClient: createMockApiClient(),
      }
      render(
        React.createElement(
          AuthContext.Provider,
          { value: { authState: { isAuthenticated: true, user: { userId: 'u1', username: 'testuser', displayName: 'Test User', email: 'test@example.com', avatarUrl: '', role: 'user', preferredLanguage: 'de', colorScheme: 'system', suspended: false, mustChangePassword: false, createdAt: '2024-01-01T00:00:00Z' }, token: 'test-token', csrfToken: 'test-csrf', mustChangePassword: false, isLoading: false, error: null }, authDispatch: vi.fn() } },
          React.createElement(
            AppContext.Provider,
            { value: appValue as unknown as AppContextValue },
            React.createElement(SettingsPanel, { open: true, onClose }),
          ),
        ),
      )
      // Vault-specific sections should be disabled when no vault is active
      const syncBtn = screen.getByRole('button', { name: 'Synchronisation' })
      expect(syncBtn).toBeDisabled()
    })
  })

  describe('accessibility', () => {
    it('active nav button has aria-current="page", inactive ones do not', () => {
      render(
        React.createElement(SettingsPanel, { open: true, onClose }),
        { wrapper: createAuthWrapper() },
      )
      // Default section is "Profil"
      const profilBtn = screen.getByRole('button', { name: 'Profil' })
      expect(profilBtn).toHaveAttribute('aria-current', 'page')

      const sessionsBtn = screen.getByRole('button', { name: 'Sitzungen' })
      expect(sessionsBtn).not.toHaveAttribute('aria-current')
    })

    it('after navigation, new section has aria-current="page"', () => {
      render(
        React.createElement(SettingsPanel, { open: true, onClose }),
        { wrapper: createAuthWrapper() },
      )
      const sessionsBtn = screen.getByRole('button', { name: 'Sitzungen' })
      fireEvent.click(sessionsBtn)
      expect(sessionsBtn).toHaveAttribute('aria-current', 'page')

      const profilBtn = screen.getByRole('button', { name: 'Profil' })
      expect(profilBtn).not.toHaveAttribute('aria-current')
    })

    it('keyboard ArrowDown moves focus to next nav item', () => {
      render(
        React.createElement(SettingsPanel, { open: true, onClose }),
        { wrapper: createAuthWrapper() },
      )
      const profilBtn = screen.getByRole('button', { name: 'Profil' })
      profilBtn.focus()
      expect(document.activeElement).toBe(profilBtn)

      // Fire ArrowDown on the parent list (SettingsNavList listens on the <ul>)
      const navList = profilBtn.closest('ul.settings-nav-list')!
      fireEvent.keyDown(navList, { key: 'ArrowDown' })

      const passwordBtn = screen.getByRole('button', { name: 'Passwort ändern' })
      expect(document.activeElement).toBe(passwordBtn)
    })
  })

  describe('admin visibility', () => {
    it('admin user sees "Serverkonfiguration" section in nav', () => {
      render(
        React.createElement(SettingsPanel, { open: true, onClose }),
        { wrapper: createAdminWrapper() },
      )
      expect(screen.getByRole('button', { name: 'Serverkonfiguration' })).toBeInTheDocument()
    })

    it('non-admin user does NOT see "Serverkonfiguration" section in nav', () => {
      render(
        React.createElement(SettingsPanel, { open: true, onClose }),
        { wrapper: createAuthWrapper() },
      )
      expect(screen.queryByRole('button', { name: 'Serverkonfiguration' })).not.toBeInTheDocument()
    })

    it('non-admin user does NOT see "Benutzerverwaltung" section in nav', () => {
      render(
        React.createElement(SettingsPanel, { open: true, onClose }),
        { wrapper: createAuthWrapper() },
      )
      expect(screen.queryByRole('button', { name: 'Benutzerverwaltung' })).not.toBeInTheDocument()
    })
  })
})
