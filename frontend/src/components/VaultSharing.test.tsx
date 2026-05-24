import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { VaultSharing, type VaultShareEntry } from './VaultSharing'
import type { IApiClient } from '../api'

/** Mock API client for testing. */
function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn().mockReturnValue('test-token'),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn().mockReturnValue('test-csrf'),
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
    login: vi.fn(),
    logout: vi.fn(),
    getSessions: vi.fn(),
    invalidateSession: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
    ...overrides,
  } as IApiClient
}

/** Sample share entries for testing. */
const sampleShares: VaultShareEntry[] = [
  { vaultId: 'vault-1', userId: 'user-alice', permission: 'read', grantedBy: 'owner-1', grantedAt: '2025-01-01T00:00:00Z' },
  { vaultId: 'vault-1', userId: 'user-bob', permission: 'write', grantedBy: 'owner-1', grantedAt: '2025-01-02T00:00:00Z' },
]

describe('VaultSharing', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state initially', () => {
    fetchSpy.mockReturnValue(new Promise(() => {})) // never resolves
    const apiClient = createMockApiClient()

    render(React.createElement(VaultSharing, { apiClient, vaultId: 'vault-1' }))

    expect(screen.getByText('Laden…')).toBeInTheDocument()
  })

  it('displays shares after loading', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(sampleShares), { status: 200 }))
    const apiClient = createMockApiClient()

    render(React.createElement(VaultSharing, { apiClient, vaultId: 'vault-1' }))

    await waitFor(() => {
      expect(screen.getByText('user-alice')).toBeInTheDocument()
    })
    expect(screen.getByText('user-bob')).toBeInTheDocument()
  })

  it('shows empty message when no shares exist', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    const apiClient = createMockApiClient()

    render(React.createElement(VaultSharing, { apiClient, vaultId: 'vault-1' }))

    await waitFor(() => {
      expect(screen.getByText('Keine Freigaben vorhanden.')).toBeInTheDocument()
    })
  })

  it('shows error message on fetch failure', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Server error' }), { status: 500 }))
    const apiClient = createMockApiClient()

    render(React.createElement(VaultSharing, { apiClient, vaultId: 'vault-1' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error')
    })
  })

  it('shows add share form', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    const apiClient = createMockApiClient()

    render(React.createElement(VaultSharing, { apiClient, vaultId: 'vault-1' }))

    await waitFor(() => {
      expect(screen.getByText('Freigabe hinzufügen')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument()
    expect(screen.getByLabelText('Berechtigung')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hinzufügen' })).toBeInTheDocument()
  })

  it('validates empty username on submit', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    const apiClient = createMockApiClient()

    render(React.createElement(VaultSharing, { apiClient, vaultId: 'vault-1' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hinzufügen' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }))

    expect(screen.getByText('Benutzername darf nicht leer sein.')).toBeInTheDocument()
  })

  it('calls POST endpoint when adding a share', async () => {
    const user = userEvent.setup()
    // First call: load shares (empty)
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    const apiClient = createMockApiClient()

    render(React.createElement(VaultSharing, { apiClient, vaultId: 'vault-1' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hinzufügen' })).toBeInTheDocument()
    })

    // Second call: create share
    const newShare: VaultShareEntry = { vaultId: 'vault-1', userId: 'new-user', permission: 'read', grantedBy: 'owner-1', grantedAt: '2025-01-03T00:00:00Z' }
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(newShare), { status: 201 }))
    // Third call: reload shares
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([newShare]), { status: 200 }))

    await user.type(screen.getByLabelText('Benutzername'), 'new-user')
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }))

    await waitFor(() => {
      expect(screen.getByText('new-user')).toBeInTheDocument()
    })

    // Verify the POST was called with correct params
    const postCall = fetchSpy.mock.calls.find(
      (call) => call[1] && (call[1] as RequestInit).method === 'POST',
    )
    expect(postCall).toBeDefined()
    expect(postCall![0]).toBe('/api/v1/vaults/vault-1/shares')
    const body = JSON.parse((postCall![1] as RequestInit).body as string)
    expect(body).toEqual({ userId: 'new-user', permission: 'read' })
  })

  it('calls DELETE endpoint when revoking a share', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(sampleShares), { status: 200 }))
    const apiClient = createMockApiClient()

    render(React.createElement(VaultSharing, { apiClient, vaultId: 'vault-1' }))

    await waitFor(() => {
      expect(screen.getByText('user-alice')).toBeInTheDocument()
    })

    // Revoke response
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }))
    // Reload shares (without alice)
    const remainingShares = sampleShares.filter((s) => s.userId !== 'user-alice')
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(remainingShares), { status: 200 }))

    await user.click(screen.getByRole('button', { name: 'Freigabe für user-alice widerrufen' }))

    await waitFor(() => {
      expect(screen.queryByText('user-alice')).not.toBeInTheDocument()
    })

    const deleteCall = fetchSpy.mock.calls.find(
      (call) => call[1] && (call[1] as RequestInit).method === 'DELETE',
    )
    expect(deleteCall).toBeDefined()
    expect(deleteCall![0]).toBe('/api/v1/vaults/vault-1/shares/user-alice')
  })

  it('shows max limit message when 20 shares exist', async () => {
    const twentyShares: VaultShareEntry[] = Array.from({ length: 20 }, (_, i) => ({
      vaultId: 'vault-1',
      userId: `user-${i}`,
      permission: 'read' as const,
      grantedBy: 'owner-1',
      grantedAt: '2025-01-01T00:00:00Z',
    }))
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(twentyShares), { status: 200 }))
    const apiClient = createMockApiClient()

    render(React.createElement(VaultSharing, { apiClient, vaultId: 'vault-1' }))

    await waitFor(() => {
      expect(screen.getByText('Maximale Anzahl erreicht (20)')).toBeInTheDocument()
    })
    // Add form should not be visible
    expect(screen.queryByText('Freigabe hinzufügen')).not.toBeInTheDocument()
  })

  it('sends authorization headers with requests', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    const apiClient = createMockApiClient()

    render(React.createElement(VaultSharing, { apiClient, vaultId: 'vault-1' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    const firstCall = fetchSpy.mock.calls[0]
    const headers = (firstCall![1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-token')
  })
})
