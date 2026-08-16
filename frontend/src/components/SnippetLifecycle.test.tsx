import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../state'
import { SnippetLifecycle } from './SnippetLifecycle'
import type { IApiClient, SnippetMeta } from '../api'
import type { VaultInfo } from '../types'

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    listSnippets: vi.fn().mockResolvedValue({ snippets: [] }),
    loadSnippetRegistry: vi.fn().mockResolvedValue({ version: 1, snippets: {} }),
    loadSnippetContent: vi.fn().mockResolvedValue(''),
    ...overrides,
  } as unknown as IApiClient
}

function VaultSwitcher({ vaults }: { vaults: VaultInfo[] }) {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: vaults })
    dispatch({ type: 'VAULT_SELECTED', payload: vaults[0]!.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

const vaultA: VaultInfo = { id: 'vault-a', name: 'Vault A' }
const vaultB: VaultInfo = { id: 'vault-b', name: 'Vault B' }

describe('SnippetLifecycle', () => {
  afterEach(() => {
    document.querySelectorAll('style[data-snippet-id]').forEach((el) => el.remove())
  })

  it('applies enabled snippets when a vault opens', async () => {
    const meta: SnippetMeta = { id: 'dark-accent', filename: 'dark-accent.css', size: 10, updatedAt: '2026-01-01T00:00:00.000Z' }
    const apiClient = createMockApiClient({
      listSnippets: vi.fn().mockResolvedValue({ snippets: [meta] }),
      loadSnippetRegistry: vi.fn().mockResolvedValue({ version: 1, snippets: { 'dark-accent': { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' } } }),
      loadSnippetContent: vi.fn().mockResolvedValue('body { color: red; }'),
    })

    render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA]} />
        <SnippetLifecycle />
      </AppProvider>
    )

    await waitFor(() => {
      expect(document.querySelector('style[data-snippet-id="dark-accent"]')).not.toBeNull()
    })
  })

  it('does not apply disabled snippets', async () => {
    const meta: SnippetMeta = { id: 'unused', filename: 'unused.css', size: 10, updatedAt: '2026-01-01T00:00:00.000Z' }
    const apiClient = createMockApiClient({
      listSnippets: vi.fn().mockResolvedValue({ snippets: [meta] }),
      loadSnippetRegistry: vi.fn().mockResolvedValue({ version: 1, snippets: {} }),
    })

    render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA]} />
        <SnippetLifecycle />
      </AppProvider>
    )

    await waitFor(() => {
      expect(apiClient.listSnippets).toHaveBeenCalled()
    })
    expect(document.querySelector('style[data-snippet-id="unused"]')).toBeNull()
  })

  it('removes the previous vault snippets and applies the new vault snippets on switch', async () => {
    const metaA: SnippetMeta = { id: 'snippet-a', filename: 'snippet-a.css', size: 10, updatedAt: '2026-01-01T00:00:00.000Z' }
    const metaB: SnippetMeta = { id: 'snippet-b', filename: 'snippet-b.css', size: 10, updatedAt: '2026-01-01T00:00:00.000Z' }
    const apiClient = createMockApiClient({
      listSnippets: vi.fn().mockImplementation(async (vaultId: string) => ({
        snippets: vaultId === 'vault-a' ? [metaA] : [metaB],
      })),
      loadSnippetRegistry: vi.fn().mockResolvedValue({
        version: 1,
        snippets: { 'snippet-a': { enabled: true, updatedAt: '' }, 'snippet-b': { enabled: true, updatedAt: '' } },
      }),
      loadSnippetContent: vi.fn().mockImplementation(async (_v: string, id: string) => `/* ${id} */`),
    })

    function TestHarness() {
      const { dispatch } = useAppContext()
      return (
        <>
          <button onClick={() => { dispatch({ type: 'VAULTS_LOADED', payload: [vaultA, vaultB] }); dispatch({ type: 'VAULT_SELECTED', payload: 'vault-a' }) }}>select-a</button>
          <button onClick={() => dispatch({ type: 'VAULT_SELECTED', payload: 'vault-b' })}>select-b</button>
        </>
      )
    }

    const { getByText } = render(
      <AppProvider apiClient={apiClient}>
        <TestHarness />
        <SnippetLifecycle />
      </AppProvider>
    )

    fireEvent.click(getByText('select-a'))
    await waitFor(() => {
      expect(document.querySelector('style[data-snippet-id="snippet-a"]')).not.toBeNull()
    })

    fireEvent.click(getByText('select-b'))
    await waitFor(() => {
      expect(document.querySelector('style[data-snippet-id="snippet-b"]')).not.toBeNull()
    })
    expect(document.querySelector('style[data-snippet-id="snippet-a"]')).toBeNull()
  })

  it('does nothing when no vault is selected', () => {
    const apiClient = createMockApiClient()
    render(
      <AppProvider apiClient={apiClient}>
        <SnippetLifecycle />
      </AppProvider>
    )

    expect(apiClient.listSnippets).not.toHaveBeenCalled()
  })
})
