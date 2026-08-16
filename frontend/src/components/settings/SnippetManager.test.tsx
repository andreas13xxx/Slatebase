import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../../state'
import { snippetInjector } from '../../plugins/appearance/snippet-injector'
import { SnippetManager } from './SnippetManager'
import type { IApiClient, SnippetMeta, SnippetRegistryData } from '../../api'
import type { VaultInfo } from '../../types'

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    listSnippets: vi.fn().mockResolvedValue({ snippets: [] }),
    createSnippet: vi.fn(),
    loadSnippetContent: vi.fn().mockResolvedValue(''),
    saveSnippetContent: vi.fn(),
    deleteSnippet: vi.fn(),
    loadSnippetRegistry: vi.fn().mockResolvedValue({ version: 1, snippets: {} } satisfies SnippetRegistryData),
    saveSnippetRegistry: vi.fn(),
    ...overrides,
  } as unknown as IApiClient
}

function VaultSeeder({ vault }: { vault: VaultInfo }) {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: [vault] })
    dispatch({ type: 'VAULT_SELECTED', payload: vault.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

const testVault: VaultInfo = { id: 'vault1', name: 'My Vault' }

function renderManager(apiClient: IApiClient) {
  return render(
    <AppProvider apiClient={apiClient}>
      <VaultSeeder vault={testVault} />
      <SnippetManager />
    </AppProvider>
  )
}

describe('SnippetManager', () => {
  afterEach(() => {
    document.querySelectorAll('style[data-snippet-id]').forEach((el) => el.remove())
  })

  it('shows an empty state when the vault has no snippets', async () => {
    renderManager(createMockApiClient())

    expect(await screen.findByText('Keine CSS-Snippets in diesem Vault.')).toBeInTheDocument()
  })

  it('lists snippets with their enabled state', async () => {
    const meta: SnippetMeta = { id: 'dark-accent', filename: 'dark-accent.css', size: 42, updatedAt: '2026-01-01T00:00:00.000Z' }
    const apiClient = createMockApiClient({
      listSnippets: vi.fn().mockResolvedValue({ snippets: [meta] }),
      loadSnippetRegistry: vi.fn().mockResolvedValue({ version: 1, snippets: { 'dark-accent': { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' } } }),
    })

    renderManager(apiClient)

    expect(await screen.findByText('dark-accent.css')).toBeInTheDocument()
    expect(screen.getByLabelText('dark-accent.css aktivieren')).toBeChecked()
  })

  it('enabling a snippet loads its content and injects it', async () => {
    const meta: SnippetMeta = { id: 'dark-accent', filename: 'dark-accent.css', size: 42, updatedAt: '2026-01-01T00:00:00.000Z' }
    const apiClient = createMockApiClient({
      listSnippets: vi.fn().mockResolvedValue({ snippets: [meta] }),
      loadSnippetContent: vi.fn().mockResolvedValue('body { color: red; }'),
    })

    renderManager(apiClient)
    const checkbox = await screen.findByLabelText('dark-accent.css aktivieren')

    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(document.querySelector('style[data-snippet-id="dark-accent"]')).not.toBeNull()
    })
    expect(apiClient.saveSnippetRegistry).toHaveBeenCalled()
  })

  it('disabling a snippet removes its injected style', async () => {
    const meta: SnippetMeta = { id: 'dark-accent', filename: 'dark-accent.css', size: 42, updatedAt: '2026-01-01T00:00:00.000Z' }
    const apiClient = createMockApiClient({
      listSnippets: vi.fn().mockResolvedValue({ snippets: [meta] }),
      loadSnippetRegistry: vi.fn().mockResolvedValue({ version: 1, snippets: { 'dark-accent': { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' } } }),
    })
    snippetInjector.apply('dark-accent', 'body {}')

    renderManager(apiClient)
    const checkbox = await screen.findByLabelText('dark-accent.css aktivieren')
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(document.querySelector('style[data-snippet-id="dark-accent"]')).toBeNull()
    })
  })

  it('creating a new snippet opens the editor after creation', async () => {
    const created: SnippetMeta = { id: 'my-snippet', filename: 'my-snippet.css', size: 0, updatedAt: '2026-01-01T00:00:00.000Z' }
    const apiClient = createMockApiClient({
      createSnippet: vi.fn().mockResolvedValue(created),
      listSnippets: vi.fn()
        .mockResolvedValueOnce({ snippets: [] })
        .mockResolvedValue({ snippets: [created] }),
    })

    renderManager(apiClient)
    await screen.findByText('Keine CSS-Snippets in diesem Vault.')

    fireEvent.click(screen.getByText('Neu erstellen'))
    const input = screen.getByLabelText('Dateiname eingeben')
    fireEvent.change(input, { target: { value: 'my-snippet' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(apiClient.createSnippet).toHaveBeenCalledWith('vault1', 'my-snippet.css', '')
    })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('deleting a snippet asks for confirmation before calling the API', async () => {
    const meta: SnippetMeta = { id: 'dark-accent', filename: 'dark-accent.css', size: 42, updatedAt: '2026-01-01T00:00:00.000Z' }
    const apiClient = createMockApiClient({ listSnippets: vi.fn().mockResolvedValue({ snippets: [meta] }) })

    renderManager(apiClient)
    await screen.findByText('dark-accent.css')

    fireEvent.click(screen.getByLabelText('dark-accent.css löschen'))
    expect(apiClient.deleteSnippet).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Löschen'))

    await waitFor(() => {
      expect(apiClient.deleteSnippet).toHaveBeenCalledWith('vault1', 'dark-accent')
    })
  })

  it('shows an error when uploading a file exceeding 512 KB', async () => {
    const apiClient = createMockApiClient()
    renderManager(apiClient)
    await screen.findByText('Keine CSS-Snippets in diesem Vault.')

    const bigContent = 'x'.repeat(512 * 1024 + 1)
    const file = new File([bigContent], 'huge.css', { type: 'text/css' })
    const input = document.querySelector('.snippet-manager__file-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('512 KB')
    expect(apiClient.createSnippet).not.toHaveBeenCalled()
  })
})
