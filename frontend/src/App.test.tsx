import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockFetchVaults, mockFetchVaultTree, mockFetchFileContent, mockCreateVault, mockDeleteVault, mockImportFile, mockImportFolder, mockDeleteContent } = vi.hoisted(() => ({
  mockFetchVaults: vi.fn(),
  mockFetchVaultTree: vi.fn(),
  mockFetchFileContent: vi.fn(),
  mockCreateVault: vi.fn(),
  mockDeleteVault: vi.fn(),
  mockImportFile: vi.fn(),
  mockImportFolder: vi.fn(),
  mockDeleteContent: vi.fn(),
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
  }
  return { ApiClient: MockApiClient }
})

// Import App after mock is set up
import App from './App'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  it('renders within AppProvider and shows loading initially', () => {
    render(<App />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Laden…')).toBeInTheDocument()
  })

  it('fetches vaults on mount', () => {
    render(<App />)

    expect(mockFetchVaults).toHaveBeenCalledTimes(1)
  })

  it('shows vault list after vaults are loaded', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Slatebase')).toBeInTheDocument()
    })
    // The dropdown trigger should show "Vault auswählen…" since no vault is selected
    expect(screen.getByRole('button', { name: 'Vault auswählen' })).toBeInTheDocument()
  })

  it('shows file explorer when a vault is selected', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Vault auswählen' })).toBeInTheDocument()
    })

    // Open dropdown and select a vault
    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))
    await user.click(screen.getByRole('button', { name: 'Vault: My Notes' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Import file' })).toBeInTheDocument()
    })
  })

  it('keeps vault dropdown visible when a vault is selected', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Vault auswählen' })).toBeInTheDocument()
    })

    // Open dropdown and select a vault
    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))
    await user.click(screen.getByRole('button', { name: 'Vault: My Notes' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Import file' })).toBeInTheDocument()
    })

    // Dropdown trigger should show selected vault name
    expect(screen.getByText('My Notes')).toBeInTheDocument()
    expect(screen.getByText('Slatebase')).toBeInTheDocument()
  })

  it('shows error message when API fails', async () => {
    mockFetchVaults.mockReset()
    mockFetchVaults.mockRejectedValue({ code: 'NETWORK_ERROR', message: 'Connection failed' })

    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByText(/NETWORK_ERROR/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Connection failed/).length).toBeGreaterThan(0)
    })
  })
})
