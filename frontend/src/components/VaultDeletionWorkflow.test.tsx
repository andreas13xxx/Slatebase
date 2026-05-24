import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { VaultDeletionWorkflow, type VaultShareEntry } from './VaultDeletionWorkflow'
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
    invalidateAllOtherSessions: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
    ...overrides,
  } as IApiClient
}

/** Sample share entries for testing. */
const readOnlyShares: VaultShareEntry[] = [
  { vaultId: 'vault-1', userId: 'user-alice', permission: 'read', grantedBy: 'owner-1', grantedAt: '2025-01-01T00:00:00Z' },
]

const writeShares: VaultShareEntry[] = [
  { vaultId: 'vault-1', userId: 'user-alice', permission: 'read', grantedBy: 'owner-1', grantedAt: '2025-01-01T00:00:00Z' },
  { vaultId: 'vault-1', userId: 'user-bob', permission: 'write', grantedBy: 'owner-1', grantedAt: '2025-01-02T00:00:00Z' },
]

describe('VaultDeletionWorkflow', () => {
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
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    expect(screen.getByText('Laden…')).toBeInTheDocument()
  })

  it('shows simple delete confirmation when no shares exist', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Vault löschen' })).toBeInTheDocument()
    })
    expect(screen.getByText(/keine aktiven Freigaben/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vault löschen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
  })

  it('calls deleteVault and shows done on simple delete', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    const deleteVault = vi.fn().mockResolvedValue(undefined)
    const apiClient = createMockApiClient({ deleteVault })
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Vault löschen' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Vault löschen' }))

    await waitFor(() => {
      expect(screen.getByText('Vorgang abgeschlossen.')).toBeInTheDocument()
    })
    expect(deleteVault).toHaveBeenCalledWith('vault-1')
  })

  it('shows choose-action step with shares listed when shares exist', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(writeShares), { status: 200 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByText('Aktive Freigaben (2)')).toBeInTheDocument()
    })
    expect(screen.getByText('user-alice')).toBeInTheDocument()
    expect(screen.getByText('user-bob')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alle Freigaben widerrufen und Vault löschen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Besitz übertragen' })).toBeInTheDocument()
  })

  it('shows write-share warning when write shares exist', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(writeShares), { status: 200 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByText(/aktive Schreibfreigaben/)).toBeInTheDocument()
    })
  })

  it('does not show write-share warning when only read shares exist', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(readOnlyShares), { status: 200 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByText('Aktive Freigaben (1)')).toBeInTheDocument()
    })
    expect(screen.queryByText(/aktive Schreibfreigaben/)).not.toBeInTheDocument()
  })

  it('navigates to confirm-force step and performs force delete', async () => {
    const user = userEvent.setup()
    // Load shares
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(writeShares), { status: 200 }))
    const deleteVault = vi.fn().mockResolvedValue(undefined)
    const apiClient = createMockApiClient({ deleteVault })
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Alle Freigaben widerrufen und Vault löschen' })).toBeInTheDocument()
    })

    // Go to confirm step
    await user.click(screen.getByRole('button', { name: 'Alle Freigaben widerrufen und Vault löschen' }))

    expect(screen.getByText('Löschung bestätigen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Endgültig löschen' })).toBeInTheDocument()

    // Mock revoke calls (one per share) + delete
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 })) // revoke alice
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 })) // revoke bob

    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))

    await waitFor(() => {
      expect(screen.getByText('Vorgang abgeschlossen.')).toBeInTheDocument()
    })

    // Verify revoke calls
    const deleteCalls = fetchSpy.mock.calls.filter(
      (call: [unknown, unknown]) => call[1] && (call[1] as RequestInit).method === 'DELETE',
    )
    expect(deleteCalls).toHaveLength(2)
    expect(deleteCalls[0]![0]).toBe('/api/v1/vaults/vault-1/shares/user-alice')
    expect(deleteCalls[1]![0]).toBe('/api/v1/vaults/vault-1/shares/user-bob')
    expect(deleteVault).toHaveBeenCalledWith('vault-1')
  })

  it('navigates to transfer step and performs ownership transfer', async () => {
    const user = userEvent.setup()
    // Load shares
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(writeShares), { status: 200 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Besitz übertragen' })).toBeInTheDocument()
    })

    // Go to transfer step
    await user.click(screen.getByRole('button', { name: 'Besitz übertragen' }))

    expect(screen.getByRole('heading', { name: 'Besitz übertragen' })).toBeInTheDocument()
    expect(screen.getByLabelText('Neuer Besitzer')).toBeInTheDocument()

    // Type target user
    await user.type(screen.getByLabelText('Neuer Besitzer'), 'user-bob')

    // Mock revoke of alice (bob is the target, so only alice gets revoked)
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 })) // revoke alice
    // Mock transfer call
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ vaultId: 'vault-1', newOwnerId: 'user-bob' }), { status: 200 }))

    await user.click(screen.getByRole('button', { name: 'Besitz übertragen' }))

    await waitFor(() => {
      expect(screen.getByText('Vorgang abgeschlossen.')).toBeInTheDocument()
    })

    // Verify revoke call (only alice, not bob)
    const deleteCalls = fetchSpy.mock.calls.filter(
      (call: [unknown, unknown]) => call[1] && (call[1] as RequestInit).method === 'DELETE',
    )
    expect(deleteCalls).toHaveLength(1)
    expect(deleteCalls[0]![0]).toBe('/api/v1/vaults/vault-1/shares/user-alice')

    // Verify transfer call
    const postCalls = fetchSpy.mock.calls.filter(
      (call: [unknown, unknown]) => call[1] && (call[1] as RequestInit).method === 'POST',
    )
    expect(postCalls).toHaveLength(1)
    expect(postCalls[0]![0]).toBe('/api/v1/vaults/vault-1/transfer')
    const body = JSON.parse((postCalls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ newOwnerId: 'user-bob' })
  })

  it('shows transfer error when target user is empty', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(readOnlyShares), { status: 200 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Besitz übertragen' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Besitz übertragen' }))

    // The transfer button should be disabled when input is empty
    expect(screen.getByRole('button', { name: 'Besitz übertragen' })).toBeDisabled()
  })

  it('shows error state when shares fail to load', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Server error' }), { status: 500 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error')
    })
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
  })

  it('calls onComplete when cancel is clicked', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(onComplete).toHaveBeenCalled()
  })

  it('calls onComplete when done step close button is clicked', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    const deleteVault = vi.fn().mockResolvedValue(undefined)
    const apiClient = createMockApiClient({ deleteVault })
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Vault löschen' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Vault löschen' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Schließen' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Schließen' }))

    expect(onComplete).toHaveBeenCalled()
  })

  it('shows transfer error when backend returns error', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(readOnlyShares), { status: 200 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Besitz übertragen' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Besitz übertragen' }))

    await user.type(screen.getByLabelText('Neuer Besitzer'), 'nonexistent-user')

    // Mock revoke of alice (success)
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }))
    // Mock transfer failure
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ code: 'USER_NOT_FOUND', message: 'User not found' }),
      { status: 404 },
    ))

    await user.click(screen.getByRole('button', { name: 'Besitz übertragen' }))

    await waitFor(() => {
      expect(screen.getByText('Benutzer nicht gefunden.')).toBeInTheDocument()
    })
  })

  it('sends authorization headers with requests', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    const firstCall = fetchSpy.mock.calls[0]
    const headers = (firstCall![1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('navigates back from confirm-force to choose-action', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(writeShares), { status: 200 }))
    const apiClient = createMockApiClient()
    const onComplete = vi.fn()

    render(React.createElement(VaultDeletionWorkflow, { apiClient, vaultId: 'vault-1', onComplete }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Alle Freigaben widerrufen und Vault löschen' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Alle Freigaben widerrufen und Vault löschen' }))
    expect(screen.getByText('Löschung bestätigen')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Zurück' }))

    expect(screen.getByText('Aktive Freigaben (2)')).toBeInTheDocument()
  })
})
