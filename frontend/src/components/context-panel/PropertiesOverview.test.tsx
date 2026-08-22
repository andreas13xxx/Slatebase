import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertiesOverview } from './PropertiesOverview'
import { AppContext, type AppContextValue } from '../../state'
import type { GraphMeta } from '../../types'
import type { PropertyTypeRegistry } from '../../state/propertyTypes'

function makeApiClient(overrides: Partial<{
  getGraphMeta: () => Promise<GraphMeta>
  getPropertyTypes: () => Promise<PropertyTypeRegistry>
  setPropertyType: (vaultId: string, key: string, type: string) => Promise<PropertyTypeRegistry>
}> = {}) {
  return {
    getGraphMeta: vi.fn(overrides.getGraphMeta ?? (() => Promise.resolve({ tags: [], propertyKeys: [{ key: 'title', count: 3 }, { key: 'tags', count: 1 }] }))),
    getPropertyTypes: vi.fn(overrides.getPropertyTypes ?? (() => Promise.resolve({ entries: [{ key: 'title', type: 'text' }] }))),
    setPropertyType: vi.fn(overrides.setPropertyType ?? ((vaultId: string, key: string, type: string) => Promise.resolve({ entries: [{ key, type }] }))),
  } as unknown as AppContextValue['apiClient']
}

function renderWithApi(apiClient: AppContextValue['apiClient'], props: Partial<React.ComponentProps<typeof PropertiesOverview>> = {}) {
  const value: AppContextValue = {
    state: { vaults: [], selectedVaultId: null, directoryTree: null, vaultTrees: {}, vaultTreesLoading: new Set(), loading: false, error: null },
    dispatch: vi.fn(),
    apiClient,
  } as unknown as AppContextValue

  return render(
    <AppContext.Provider value={value}>
      <PropertiesOverview vaultId="vault1" hasWriteAccess={true} {...props} />
    </AppContext.Provider>,
  )
}

describe('PropertiesOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a placeholder when no vault is selected', () => {
    renderWithApi(makeApiClient(), { vaultId: null })
    expect(screen.getByText('Kein Vault ausgewählt.')).toBeInTheDocument()
  })

  it('lists every vault-wide property key with its count and resolved type', async () => {
    renderWithApi(makeApiClient())

    expect(await screen.findByText('title')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('tags')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()

    // "title" has a registry entry (text); "tags" has none, so it falls back to text too.
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects.map((s) => s.value)).toEqual(['text', 'text'])
  })

  it('shows a plain type label instead of a dropdown without write access', async () => {
    renderWithApi(makeApiClient(), { hasWriteAccess: false })

    await screen.findByText('title')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getAllByText('Text')).toHaveLength(2)
  })

  it('shows the empty state when the vault has no properties', async () => {
    renderWithApi(makeApiClient({ getGraphMeta: () => Promise.resolve({ tags: [], propertyKeys: [] }) }))
    expect(await screen.findByText('Keine Eigenschaften in diesem Vault gefunden.')).toBeInTheDocument()
  })

  it('shows an error state when loading fails', async () => {
    renderWithApi(makeApiClient({ getGraphMeta: () => Promise.reject(new Error('network')) }))
    expect(await screen.findByText('Eigenschaften konnten nicht geladen werden.')).toBeInTheDocument()
  })

  it('changing a type persists it via the API and reflects the new value', async () => {
    const user = userEvent.setup()
    const apiClient = makeApiClient()
    renderWithApi(apiClient)

    await screen.findByText('title')
    const [titleSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[]
    await user.selectOptions(titleSelect!, 'checkbox')

    expect(apiClient.setPropertyType).toHaveBeenCalledWith('vault1', 'title', 'checkbox')
    await waitFor(() => expect(titleSelect!.value).toBe('checkbox'))
  })

  it('reverts the optimistic update if persisting the type fails', async () => {
    const user = userEvent.setup()
    const apiClient = makeApiClient({ setPropertyType: () => Promise.reject(new Error('forbidden')) })
    renderWithApi(apiClient)

    await screen.findByText('title')
    const [titleSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[]
    await user.selectOptions(titleSelect!, 'checkbox')

    await waitFor(() => expect(titleSelect!.value).toBe('text'))
  })
})
