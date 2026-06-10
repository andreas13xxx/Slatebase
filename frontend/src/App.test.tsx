import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockFetchVaults, mockFetchVaultTree, mockFetchFileContent, mockCreateVault, mockDeleteVault, mockImportFile, mockImportFolder, mockDeleteContent, mockLogin, mockLogout, mockSetToken, mockSetCsrfToken, mockSetOnSessionExpired, mockLoadFeatures } = vi.hoisted(() => ({
  mockFetchVaults: vi.fn(),
  mockFetchVaultTree: vi.fn(),
  mockFetchFileContent: vi.fn(),
  mockCreateVault: vi.fn(),
  mockDeleteVault: vi.fn(),
  mockImportFile: vi.fn(),
  mockImportFolder: vi.fn(),
  mockDeleteContent: vi.fn(),
  mockLogin: vi.fn(),
  mockLogout: vi.fn(),
  mockSetToken: vi.fn(),
  mockSetCsrfToken: vi.fn(),
  mockSetOnSessionExpired: vi.fn(),
  mockLoadFeatures: vi.fn(),
}))

// Mock the API client with a class that uses shared mock functions
vi.mock('./api', () => {
  class MockApiClient {
    fetchVaults = mockFetchVaults
    fetchVaultTree = mockFetchVaultTree
    fetchFileContent = mockFetchFileContent
    createVault = mockCreateVault
    deleteVault = mockDeleteVault
    importFile = mockImportFile
    importFolder = mockImportFolder
    deleteContent = mockDeleteContent
    login = mockLogin
    logout = mockLogout
    setToken = mockSetToken
    setCsrfToken = mockSetCsrfToken
    setOnSessionExpired = mockSetOnSessionExpired
    loadFeatures = mockLoadFeatures
    getToken = vi.fn().mockReturnValue(null)
    getCsrfToken = vi.fn().mockReturnValue(null)
  }
  return { ApiClient: MockApiClient }
})

// Import App after mock is set up
import { App } from './App'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadFeatures.mockResolvedValue([
      { name: 'chat', enabled: true },
      { name: 'vault-sync', enabled: false },
      { name: 'mcp', enabled: true },
      { name: 'knowledge-graph', enabled: true },
      { name: 'obsidian-plugin-compat', enabled: false },
    ])
    mockFetchVaults.mockResolvedValue([
      { id: 'vault1', name: 'My Notes' },
      { id: 'vault2', name: 'Work Vault' },
    ])
    mockFetchVaultTree.mockResolvedValue({
      name: 'root',
      type: 'directory',
      path: '/',
      children: [
        { name: 'readme.md', type: 'file', path: 'readme.md' },
      ],
    })
    mockFetchFileContent.mockResolvedValue({
      path: 'readme.md',
      name: 'readme.md',
      content: '# Hello',
      size: 7,
      encoding: 'utf-8',
      isBinary: false,
      isTruncated: false,
    })
    mockLogin.mockResolvedValue({
      token: 'test-token',
      csrfToken: 'test-csrf',
      user: {
        userId: 'user1',
        username: 'admin',
        displayName: 'Administrator',
        email: '',
        avatarUrl: '',
        role: 'admin',
        preferredLanguage: 'de',
        colorScheme: 'system',
        suspended: false,
        mustChangePassword: false,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      expiresAt: '2025-01-02T00:00:00.000Z',
    })
    mockLogout.mockResolvedValue(undefined)
  })

  it('shows login page when not authenticated', () => {
    render(<App />)

    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument()
    expect(screen.getByLabelText('Passwort')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('shows main app after successful login', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Fill in login form
    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    // After login, main app should render
    await waitFor(() => {
      expect(screen.getByText('Slatebase')).toBeInTheDocument()
    })
    expect(mockSetToken).toHaveBeenCalledWith('test-token')
    expect(mockSetCsrfToken).toHaveBeenCalledWith('test-csrf')
  })

  it('shows logout button when authenticated and handles logout', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Login first
    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    // Open user menu
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Benutzermenü' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Benutzermenü' }))

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Abmelden' })).toBeInTheDocument()
    })

    // Click logout
    await user.click(screen.getByRole('menuitem', { name: 'Abmelden' }))

    // Should return to login page
    await waitFor(() => {
      expect(screen.getByLabelText('Benutzername')).toBeInTheDocument()
    })
    expect(mockSetToken).toHaveBeenCalledWith(null)
    expect(mockSetCsrfToken).toHaveBeenCalledWith(null)
  })

  it('shows password change placeholder when mustChangePassword is true', async () => {
    mockLogin.mockResolvedValue({
      token: 'test-token',
      csrfToken: 'test-csrf',
      user: {
        userId: 'user1',
        username: 'admin',
        displayName: 'Administrator',
        email: '',
        avatarUrl: '',
        role: 'admin',
        preferredLanguage: 'de',
        colorScheme: 'system',
        suspended: false,
        mustChangePassword: true,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      expiresAt: '2025-01-02T00:00:00.000Z',
    })

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Passwort ändern' })).toBeInTheDocument()
    })
    expect(screen.getByText(/Sie müssen Ihr Passwort ändern/)).toBeInTheDocument()
  })

  it('wires onSessionExpired callback on the ApiClient', () => {
    render(<App />)

    expect(mockSetOnSessionExpired).toHaveBeenCalledWith(expect.any(Function))
  })

  it('returns to login page when session expires via callback', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Login first
    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => {
      expect(screen.getByText('Slatebase')).toBeInTheDocument()
    })

    // Simulate session expiry by calling the callback that was registered
    const sessionExpiredCallback = mockSetOnSessionExpired.mock.calls[0]?.[0]
    if (sessionExpiredCallback) {
      sessionExpiredCallback()
    }

    // Should return to login page with session expired error
    await waitFor(() => {
      expect(screen.getByLabelText('Benutzername')).toBeInTheDocument()
    })
  })

  it('fetches vaults after login', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => {
      expect(mockFetchVaults).toHaveBeenCalled()
    })
  })
})
