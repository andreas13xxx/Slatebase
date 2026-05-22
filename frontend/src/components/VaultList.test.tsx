import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { VaultList } from './VaultList'
import { AppContext } from '../state'
import type { AppState, AppAction } from '../types'
import { initialState } from '../state'
import type { Dispatch } from 'react'
import type { IApiClient } from '../api'

/** Mock API client for testing. */
function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    fetchVaults: vi.fn().mockResolvedValue([]),
    fetchVaultTree: vi.fn().mockResolvedValue({ name: 'root', type: 'directory', path: '/', children: [] }),
    fetchFileContent: vi.fn().mockResolvedValue({ path: '', name: '', content: '', size: 0, encoding: 'utf-8', isBinary: false, isTruncated: false }),
    createVault: vi.fn().mockResolvedValue({ id: 'new-id', name: 'New Vault' }),
    deleteVault: vi.fn().mockResolvedValue(undefined),
    importFile: vi.fn().mockResolvedValue(undefined),
    importFolder: vi.fn().mockResolvedValue(undefined),
    deleteContent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

/** Helper to render VaultList with a custom state and capture dispatched actions. */
function renderVaultList(stateOverrides: Partial<AppState> = {}, apiClientOverrides: Partial<IApiClient> = {}) {
  const dispatch = vi.fn() as Dispatch<AppAction> & ReturnType<typeof vi.fn>
  const state: AppState = { ...initialState, ...stateOverrides }
  const apiClient = createMockApiClient(apiClientOverrides)

  render(
    React.createElement(
      AppContext.Provider,
      { value: { state, dispatch, apiClient } },
      React.createElement(VaultList),
    ),
  )

  return { dispatch, apiClient }
}

describe('VaultList (Dropdown)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a dropdown trigger button', () => {
    renderVaultList()

    expect(screen.getByRole('button', { name: 'Vault auswählen' })).toBeInTheDocument()
  })

  it('shows placeholder text when no vault is selected', () => {
    renderVaultList({ vaults: [{ id: 'v1', name: 'Test' }] })

    expect(screen.getByText('Vault auswählen…')).toBeInTheDocument()
  })

  it('shows selected vault name in trigger', () => {
    renderVaultList({
      vaults: [{ id: 'v1', name: 'My Vault' }],
      selectedVaultId: 'v1',
    })

    expect(screen.getByText('My Vault')).toBeInTheDocument()
  })

  it('opens dropdown menu on click', async () => {
    const user = userEvent.setup()
    renderVaultList({
      vaults: [{ id: 'v1', name: 'Vault A' }, { id: 'v2', name: 'Vault B' }],
    })

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('Vault A')).toBeInTheDocument()
    expect(screen.getByText('Vault B')).toBeInTheDocument()
  })

  it('shows empty message in dropdown when no vaults exist', async () => {
    const user = userEvent.setup()
    renderVaultList({ vaults: [] })

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))

    expect(screen.getByText('Keine Vaults vorhanden')).toBeInTheDocument()
  })

  it('dispatches VAULT_SELECTED on vault click and closes dropdown', async () => {
    const user = userEvent.setup()
    const { dispatch } = renderVaultList({
      vaults: [{ id: 'abc123', name: 'Vault A' }, { id: 'def456', name: 'Vault B' }],
    })

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))
    await user.click(screen.getByRole('button', { name: 'Vault: Vault B' }))

    expect(dispatch).toHaveBeenCalledWith({ type: 'VAULT_SELECTED', payload: 'def456' })
    // Dropdown should close
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows "+ Neuer Vault" button in dropdown', async () => {
    const user = userEvent.setup()
    renderVaultList()

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))

    expect(screen.getByText('+ Neuer Vault')).toBeInTheDocument()
  })

  it('reveals create form when "+ Neuer Vault" is clicked', async () => {
    const user = userEvent.setup()
    renderVaultList()

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))
    await user.click(screen.getByText('+ Neuer Vault'))

    expect(screen.getByPlaceholderText('Vault-Name…')).toBeInTheDocument()
  })

  it('shows validation error for empty name', async () => {
    const user = userEvent.setup()
    renderVaultList()

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))
    await user.click(screen.getByText('+ Neuer Vault'))
    await user.click(screen.getByRole('button', { name: 'OK' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Vault-Name darf nicht leer sein')
  })

  it('shows validation error for name conflict', async () => {
    const user = userEvent.setup()
    renderVaultList({ vaults: [{ id: 'v1', name: 'Existing' }] })

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))
    await user.click(screen.getByText('+ Neuer Vault'))
    await user.type(screen.getByPlaceholderText('Vault-Name…'), 'Existing')
    await user.click(screen.getByRole('button', { name: 'OK' }))

    expect(screen.getByRole('alert')).toHaveTextContent('existiert bereits')
  })

  it('calls createVault API on valid submission', async () => {
    const user = userEvent.setup()
    const mockCreateVault = vi.fn().mockResolvedValue({ id: 'new-id', name: 'New Vault' })
    const { dispatch } = renderVaultList({}, { createVault: mockCreateVault })

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))
    await user.click(screen.getByText('+ Neuer Vault'))
    await user.type(screen.getByPlaceholderText('Vault-Name…'), 'New Vault')
    await user.click(screen.getByRole('button', { name: 'OK' }))

    expect(mockCreateVault).toHaveBeenCalledWith('New Vault')
    expect(dispatch).toHaveBeenCalledWith({ type: 'LOADING_STARTED' })
  })

  it('renders delete button for each vault in dropdown', async () => {
    const user = userEvent.setup()
    renderVaultList({
      vaults: [{ id: 'v1', name: 'Vault A' }, { id: 'v2', name: 'Vault B' }],
    })

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))

    expect(screen.getByRole('button', { name: /Vault "Vault A" löschen/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Vault "Vault B" löschen/ })).toBeInTheDocument()
  })

  it('calls deleteVault API after confirmation', async () => {
    const user = userEvent.setup()
    const mockDeleteVault = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { dispatch } = renderVaultList(
      { vaults: [{ id: 'v1', name: 'To Delete' }] },
      { deleteVault: mockDeleteVault },
    )

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))
    await user.click(screen.getByRole('button', { name: /Vault "To Delete" löschen/ }))

    expect(window.confirm).toHaveBeenCalled()
    expect(mockDeleteVault).toHaveBeenCalledWith('v1')
    expect(dispatch).toHaveBeenCalledWith({ type: 'LOADING_STARTED' })
  })

  it('does not call deleteVault when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const mockDeleteVault = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderVaultList(
      { vaults: [{ id: 'v1', name: 'Keep Me' }] },
      { deleteVault: mockDeleteVault },
    )

    await user.click(screen.getByRole('button', { name: 'Vault auswählen' }))
    await user.click(screen.getByRole('button', { name: /Vault "Keep Me" löschen/ }))

    expect(window.confirm).toHaveBeenCalled()
    expect(mockDeleteVault).not.toHaveBeenCalled()
  })
})
