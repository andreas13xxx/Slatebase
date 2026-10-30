import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../../state'
import { KeychainSection } from './KeychainSection'
import type { IApiClient } from '../../api'
import type { VaultInfo } from '../../types'

vi.mock('../ToastNotification', () => ({ showToast: vi.fn() }))
vi.mock('../../plugins/compat/obsidian-api-extensions', () => ({ reloadVaultSecretStorage: vi.fn().mockResolvedValue(undefined) }))

function VaultSeeder({ permission }: { permission?: VaultInfo['permission'] }) {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: [{ id: 'vault1', name: 'My Vault', ...(permission ? { permission } : {}) }] })
    dispatch({ type: 'VAULT_SELECTED', payload: 'vault1' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function createApi(initial: Record<string, string> = { 'openai-key': 'sk-123', 'other-token': 'tok' }) {
  const secrets = new Map(Object.entries(initial))
  return {
    secrets,
    listKeychainSecrets: vi.fn(async () => [...secrets.keys()].sort()),
    getKeychainSecret: vi.fn(async (_v: string, id: string) => secrets.get(id) ?? null),
    setKeychainSecret: vi.fn(async (_v: string, id: string, value: string) => { secrets.set(id, value) }),
    deleteKeychainSecret: vi.fn(async (_v: string, id: string) => { secrets.delete(id) }),
  }
}

function renderSection(api: ReturnType<typeof createApi>, permission?: VaultInfo['permission']) {
  return render(
    <AppProvider apiClient={api as unknown as IApiClient}>
      <VaultSeeder permission={permission} />
      <KeychainSection />
    </AppProvider>,
  )
}

describe('KeychainSection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the entries with masked values', async () => {
    renderSection(createApi())
    await screen.findByText('openai-key')
    expect(screen.getByText('other-token')).toBeInTheDocument()
    expect(screen.queryByText('sk-123')).not.toBeInTheDocument()
    expect(screen.getAllByText('••••••••')).toHaveLength(2)
  })

  it('shows a value only on request and hides it again', async () => {
    const api = createApi()
    renderSection(api)
    await screen.findByText('openai-key')

    fireEvent.click(screen.getByRole('button', { name: 'Wert von openai-key anzeigen' }))
    expect(await screen.findByText('sk-123')).toBeInTheDocument()
    expect(api.getKeychainSecret).toHaveBeenCalledWith('vault1', 'openai-key')

    fireEvent.click(screen.getByRole('button', { name: 'Wert von openai-key verbergen' }))
    expect(screen.queryByText('sk-123')).not.toBeInTheDocument()
  })

  it('adds an entry and refreshes the list', async () => {
    const api = createApi({})
    renderSection(api)
    await screen.findByText('Noch keine Einträge.')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'new-key' } })
    fireEvent.change(screen.getByLabelText('Wert'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }))

    await waitFor(() => expect(api.setKeychainSecret).toHaveBeenCalledWith('vault1', 'new-key', 'secret'))
    expect(await screen.findByText('new-key')).toBeInTheDocument()
  })

  it('blocks invalid and duplicate names', async () => {
    renderSection(createApi())
    await screen.findByText('openai-key')
    const add = screen.getByRole('button', { name: 'Hinzufügen' })
    fireEvent.change(screen.getByLabelText('Wert'), { target: { value: 'x' } })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bad_Name' } })
    expect(add).toBeDisabled()
    expect(screen.getByText('Ungültiger Name.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'openai-key' } })
    expect(add).toBeDisabled()
    expect(screen.getByText(/existiert schon/)).toBeInTheDocument()
  })

  it('replaces the value of an entry', async () => {
    const api = createApi()
    renderSection(api)
    await screen.findByText('openai-key')

    fireEvent.click(screen.getByRole('button', { name: 'Wert von openai-key ändern' }))
    fireEvent.change(screen.getByPlaceholderText('Neuer Wert'), { target: { value: 'sk-new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(api.setKeychainSecret).toHaveBeenCalledWith('vault1', 'openai-key', 'sk-new'))
  })

  it('deletes an entry only after confirmation', async () => {
    const api = createApi()
    renderSection(api)
    await screen.findByText('openai-key')

    fireEvent.click(screen.getByRole('button', { name: 'openai-key löschen' }))
    expect(api.deleteKeychainSecret).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Löschen' }))

    await waitFor(() => expect(api.deleteKeychainSecret).toHaveBeenCalledWith('vault1', 'openai-key'))
    await waitFor(() => expect(screen.queryByText('openai-key')).not.toBeInTheDocument())
  })

  it('is read-only for collaborators with read access', async () => {
    const api = createApi()
    renderSection(api, 'read')
    await screen.findByText('openai-key')

    expect(screen.getByText(/nur die Namen/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /anzeigen/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /löschen/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hinzufügen' })).not.toBeInTheDocument()
    expect(api.getKeychainSecret).not.toHaveBeenCalled()
  })

  it('shows an error when the keychain cannot be loaded', async () => {
    const api = { ...createApi(), listKeychainSecrets: vi.fn().mockRejectedValue(new Error('offline')) }
    renderSection(api)
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/)
  })

  it('has no axe violations', async () => {
    const { container } = renderSection(createApi())
    await screen.findByText('openai-key')
    expect(await axe(container)).toHaveNoViolations()
  }, 30_000) // axe is slow on the 2-core host; the default 5 s limit times out
})
