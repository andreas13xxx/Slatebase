import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../../state'
import { FeatureContext } from '../../state/featureContext'
import { initialFeatureState } from '../../state/featureState'
import { ThemesSection } from './ThemesSection'
import type { IApiClient } from '../../api'

function createMockApiClient(): IApiClient {
  return {
    listThemes: vi.fn().mockResolvedValue({ themes: [], activeThemeId: null }),
    listStoreThemes: vi.fn().mockResolvedValue({ themes: [], stale: false }),
  } as unknown as IApiClient
}

function VaultSeeder() {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: [{ id: 'vault1', name: 'My Vault' }] })
    dispatch({ type: 'VAULT_SELECTED', payload: 'vault1' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderSection(apiClient: IApiClient, storeEnabled: boolean) {
  return render(
    <FeatureContext.Provider
      value={{ state: initialFeatureState, dispatch: vi.fn(), isEnabled: (name) => storeEnabled && name === 'obsidian-theme-store' }}
    >
      <AppProvider apiClient={apiClient}>
        <VaultSeeder />
        <ThemesSection />
      </AppProvider>
    </FeatureContext.Provider>,
  )
}

describe('ThemesSection', () => {
  it('shows only the installed themes, without tabs, while the store feature is off', async () => {
    const apiClient = createMockApiClient()
    renderSection(apiClient, false)

    expect(await screen.findByLabelText('Slatebase (Standard)')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Entdecken' })).not.toBeInTheDocument()
    expect(apiClient.listStoreThemes).not.toHaveBeenCalled() // no catalog request, nothing leaves the server
  })

  it('offers "Installiert" and "Entdecken" when the store feature is on, starting on the installed themes', async () => {
    const apiClient = createMockApiClient()
    renderSection(apiClient, true)

    expect(await screen.findByLabelText('Slatebase (Standard)')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Installiert' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Entdecken' })).toHaveAttribute('aria-selected', 'false')
    expect(apiClient.listStoreThemes).not.toHaveBeenCalled() // the catalog loads only when its tab is opened
  })

  it('opens the catalog on "Entdecken" and returns to the installed themes', async () => {
    const apiClient = createMockApiClient()
    renderSection(apiClient, true)
    await screen.findByLabelText('Slatebase (Standard)')

    fireEvent.click(screen.getByRole('tab', { name: 'Entdecken' }))
    expect(await screen.findByLabelText('Suchen')).toBeInTheDocument()
    expect(apiClient.listStoreThemes).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Slatebase (Standard)')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Installiert' }))
    expect(await screen.findByLabelText('Slatebase (Standard)')).toBeInTheDocument()
  })

  it('moves between the tabs with the arrow keys, Home and End, and wires tab and panel together', async () => {
    renderSection(createMockApiClient(), true)
    await screen.findByLabelText('Slatebase (Standard)')
    const installed = screen.getByRole('tab', { name: 'Installiert' })
    const discover = screen.getByRole('tab', { name: 'Entdecken' })

    expect(installed).toHaveAttribute('tabindex', '0')
    expect(discover).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(installed, { key: 'ArrowRight' })
    expect(discover).toHaveAttribute('aria-selected', 'true')
    expect(discover).toHaveFocus()
    const panel = await screen.findByRole('tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', discover.id)
    expect(discover).toHaveAttribute('aria-controls', panel.id)

    fireEvent.keyDown(discover, { key: 'Home' })
    expect(installed).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(installed, { key: 'End' })
    expect(discover).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(discover, { key: 'ArrowRight' }) // wraps around
    expect(installed).toHaveAttribute('aria-selected', 'true')
  })
})
