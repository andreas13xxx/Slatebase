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
    getVersion = vi.fn().mockResolvedValue({ version: '1.0.0' })
    getVaultConfig = vi.fn().mockResolvedValue({ templatesDirectory: '', dailyNotesDirectory: '', dailyNoteTemplateName: '' })
    getSseTicket = vi.fn().mockResolvedValue({ ticket: 'mock-ticket' })
    checkSessionAlive = vi.fn().mockResolvedValue(true)
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
      { name: 'mcp', enabled: true },
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

  it('does not let a stale vault-tree fetch corrupt the currently selected vault (race condition regression)', async () => {
    // Regression test for the TREE_LOADED race: switching vaults before an
    // in-flight fetchVaultTree() resolves must not let the stale response
    // overwrite the tree of the vault the user has since switched to.
    function createDeferred<T>() {
      let resolve!: (value: T) => void
      const promise = new Promise<T>((res) => { resolve = res })
      return { promise, resolve }
    }

    const vault1Tree = {
      name: 'root',
      type: 'directory' as const,
      path: '/',
      children: [{ name: 'personal-file.md', type: 'file' as const, path: 'personal-file.md' }],
    }
    const vault2Tree = {
      name: 'root',
      type: 'directory' as const,
      path: '/',
      children: [{ name: 'work-file.md', type: 'file' as const, path: 'work-file.md' }],
    }
    const vault1Deferred = createDeferred<typeof vault1Tree>()
    const vault2Deferred = createDeferred<typeof vault2Tree>()
    mockFetchVaultTree.mockImplementation((vaultId: string) => {
      if (vaultId === 'vault1') return vault1Deferred.promise
      if (vaultId === 'vault2') return vault2Deferred.promise
      return Promise.reject(new Error(`unexpected vaultId: ${vaultId}`))
    })

    // Clean slate: no leftover auth/workspace state from earlier tests, and
    // pre-select vault1 via the "last selected vault" restore mechanism so
    // its tree fetch is triggered purely by App.tsx's vault-switch effect —
    // not by clicking it in the sidebar (which would also trigger
    // FileExplorer's own, independently vault-scoped VAULT_TREE_LOADED fetch).
    localStorage.clear()
    localStorage.setItem('slatebase_last_vault', 'vault1')

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Benutzername'), 'admin')
    await user.type(screen.getByLabelText('Passwort'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    // vault1 gets auto-selected on load; its tree fetch is now in flight.
    await waitFor(() => {
      expect(mockFetchVaultTree).toHaveBeenCalledWith('vault1')
    })

    // Switch to vault2 before vault1's fetch resolves.
    await waitFor(() => {
      expect(screen.getByTitle('Work Vault')).toBeInTheDocument()
    })
    await user.click(screen.getByTitle('Work Vault'))

    await waitFor(() => {
      expect(mockFetchVaultTree).toHaveBeenCalledWith('vault2')
    })

    // vault2's fetch resolves first. Filenames render without their
    // extension (tree-node-file-name span); the full name lives in `title`.
    vault2Deferred.resolve(vault2Tree)
    await waitFor(() => {
      expect(screen.getByTitle('work-file.md')).toBeInTheDocument()
    })

    // vault1's stale fetch resolves late — must not corrupt vault2's tree.
    vault1Deferred.resolve(vault1Tree)
    await waitFor(() => {
      expect(screen.getByTitle('work-file.md')).toBeInTheDocument()
    })
    expect(screen.queryByTitle('personal-file.md')).not.toBeInTheDocument()
  })
})
