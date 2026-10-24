import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../../state'
import { themeInjector } from '../../plugins/appearance/theme-injector'
import { FeatureContext } from '../../state/featureContext'
import { initialFeatureState } from '../../state/featureState'
import { ThemeManager } from './ThemeManager'
import type { IApiClient, ThemeMeta } from '../../api'
import type { VaultInfo } from '../../types'

const things: ThemeMeta = { id: 'Things', manifest: { name: 'Things', version: '2.1.0', author: 'Colin' }, size: 2048, updatedAt: '2026-10-17T00:00:00.000Z', externalHosts: [], hasStyleSettings: false }
const fonts: ThemeMeta = { id: 'Fancy', manifest: { name: 'Fancy' }, size: 100, updatedAt: '2026-10-17T00:00:00.000Z', externalHosts: ['fonts.googleapis.com'], hasStyleSettings: false }

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    listThemes: vi.fn().mockResolvedValue({ themes: [], activeThemeId: null }),
    loadTheme: vi.fn().mockResolvedValue({ css: 'body { color: red; }', meta: things }),
    saveTheme: vi.fn().mockResolvedValue(things),
    deleteTheme: vi.fn().mockResolvedValue(undefined),
    setActiveTheme: vi.fn().mockResolvedValue(undefined),
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
      <ThemeManager />
    </AppProvider>,
  )
}

const themeTag = (): Element | null => document.head.querySelector('style[data-slatebase-theme]')

describe('ThemeManager', () => {
  afterEach(() => {
    themeInjector.remove()
  })

  it('always offers the Slatebase default, even in a vault without themes', async () => {
    renderManager(createMockApiClient())

    expect(await screen.findByLabelText('Slatebase (Standard)')).toBeChecked()
    expect(screen.getByText(/Keine Themes in diesem Vault/)).toBeInTheDocument()
  })

  it('lists themes with their metadata and marks the active one', async () => {
    renderManager(createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [things], activeThemeId: 'Things' }),
    }))

    const radio = await screen.findByRole('radio', { name: /Things/ })
    expect(radio).toBeChecked()
    expect(screen.getByText('2.1.0 · Colin · 2.0 KB')).toBeInTheDocument()
    expect(screen.getByLabelText('Slatebase (Standard)')).not.toBeChecked()
  })

  it('warns when a theme loads resources from other hosts', async () => {
    renderManager(createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [fonts], activeThemeId: null }),
    }))

    expect(await screen.findByText(/Lädt Inhalte von: fonts\.googleapis\.com/)).toBeInTheDocument()
  })

  it('selects a theme: saves the choice and applies it right away in this tab', async () => {
    const apiClient = createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [things], activeThemeId: null }),
    })
    renderManager(apiClient)

    fireEvent.click(await screen.findByRole('radio', { name: /Things/ }))

    await waitFor(() => expect(apiClient.setActiveTheme).toHaveBeenCalledWith('vault1', 'Things'))
    await waitFor(() => expect(themeTag()?.textContent).toBe('body { color: red; }'))
    expect(screen.getByRole('radio', { name: /Things/ })).toBeChecked()
  })

  it('switching back to the default clears the theme', async () => {
    themeInjector.apply('Things', 'a{}')
    const apiClient = createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [things], activeThemeId: 'Things' }),
    })
    renderManager(apiClient)

    fireEvent.click(await screen.findByLabelText('Slatebase (Standard)'))

    await waitFor(() => expect(apiClient.setActiveTheme).toHaveBeenCalledWith('vault1', null))
    await waitFor(() => expect(themeTag()).toBeNull())
  })

  it('rolls the selection back and shows the error when saving the choice fails', async () => {
    const apiClient = createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [things], activeThemeId: null }),
      setActiveTheme: vi.fn().mockRejectedValue({ code: 'FORBIDDEN', message: 'Kein Schreibzugriff' }),
    })
    renderManager(apiClient)

    fireEvent.click(await screen.findByRole('radio', { name: /Things/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Kein Schreibzugriff|aktiviert/)
    expect(screen.getByLabelText('Slatebase (Standard)')).toBeChecked()
    expect(themeTag()).toBeNull()
  })

  it('deletes the active theme after confirmation and falls back to the default', async () => {
    themeInjector.apply('Things', 'a{}')
    const apiClient = createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [things], activeThemeId: 'Things' }),
    })
    renderManager(apiClient)

    fireEvent.click(await screen.findByRole('button', { name: 'Things löschen' }))
    expect(apiClient.deleteTheme).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Löschen' }))

    await waitFor(() => expect(apiClient.deleteTheme).toHaveBeenCalledWith('vault1', 'Things'))
    await waitFor(() => expect(themeTag()).toBeNull())
  })

  it('shows an error when the themes cannot be loaded', async () => {
    renderManager(createMockApiClient({ listThemes: vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', message: 'kaputt' }) }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('keeps the new selection when the choice was saved but showing it here fails', async () => {
    const apiClient = createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [things], activeThemeId: null }),
      loadTheme: vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', message: 'Netz weg' }),
    })
    renderManager(apiClient)

    fireEvent.click(await screen.findByRole('radio', { name: /Things/ }))

    await waitFor(() => expect(apiClient.setActiveTheme).toHaveBeenCalledWith('vault1', 'Things'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Netz weg|gespeichert/)
    // The vault now uses Things, so the UI must say so — no rollback to the default.
    expect(screen.getByRole('radio', { name: /Things/ })).toBeChecked()
  })

  describe('Style Settings hint', () => {
    const withSettings: ThemeMeta = { ...things, id: 'Minimal', manifest: { name: 'Minimal' }, hasStyleSettings: true }

    function renderWithRegistry(loadRegistry: IApiClient['loadRegistry'], themes: ThemeMeta[] = [withSettings]) {
      const apiClient = createMockApiClient({
        listThemes: vi.fn().mockResolvedValue({ themes, activeThemeId: null }),
        loadRegistry: vi.fn(loadRegistry),
      } as Partial<IApiClient>)
      renderManager(apiClient)
      return apiClient
    }

    const registryWith = (status?: string) => async () => ({
      version: 1 as const,
      plugins: status === undefined ? {} : { 'obsidian-style-settings': { status, permissions: {}, compatibilityLevel: 'full', installedAt: '', updatedAt: '' } },
    }) as unknown as Awaited<ReturnType<IApiClient['loadRegistry']>>

    it('shows the hint once and marks only the themes with settings by an icon', async () => {
      const other: ThemeMeta = { ...withSettings, id: 'Neon', manifest: { name: 'Neon' } }
      renderWithRegistry(registryWith(), [withSettings, other, things])
      await screen.findByRole('radio', { name: /Things/ })

      expect(await screen.findAllByText(/bringen eigene Einstellungen mit/)).toHaveLength(1)
      expect(screen.getAllByTitle('Hat eigene Einstellungen')).toHaveLength(2)
      // The radio is described by it, but its name stays the theme name.
      expect(screen.getByRole('radio', { name: /Minimal/ })).toHaveAccessibleDescription('Hat eigene Einstellungen')
      expect(screen.getByRole('radio', { name: /Minimal/ })).not.toHaveAccessibleName(/eigene Einstellungen/)
    })

    it('asks to install the plugin when it is not in the vault', async () => {
      renderWithRegistry(registryWith())
      expect(await screen.findByText(/Installiere dafür unter Einstellungen → Plugins das Plugin „Style Settings“/)).toBeInTheDocument()
    })

    it('asks to activate the plugin when it is installed but not active', async () => {
      renderWithRegistry(registryWith('inactive'))
      expect(await screen.findByText(/Aktiviere dafür unter Einstellungen → Plugins das Plugin „Style Settings“/)).toBeInTheDocument()
    })

    it('points to the plugin settings when it is active', async () => {
      renderWithRegistry(registryWith('active'))
      expect(await screen.findByText(/Du findest sie unter Einstellungen → Plugins → Style Settings → Einstellungen/)).toBeInTheDocument()
    })

    it.each(['error', 'loading'])('makes no claim when the plugin registry says "%s" (not "inactive")', async (status) => {
      renderWithRegistry(registryWith(status))
      expect(await screen.findByText(/ob es in diesem Vault installiert ist, konnte nicht geprüft werden/)).toBeInTheDocument()
      expect(screen.queryByText(/Aktiviere dafür/)).not.toBeInTheDocument()
    })

    it('does not call plugin compatibility "off" while the feature list is not loaded', async () => {
      const apiClient = createMockApiClient({
        listThemes: vi.fn().mockResolvedValue({ themes: [withSettings], activeThemeId: null }),
        loadRegistry: vi.fn(registryWith()),
      } as Partial<IApiClient>)
      render(
        // An empty, not yet loaded list: `isEnabled` would answer false for the unknown name.
        <FeatureContext.Provider value={{ state: initialFeatureState, dispatch: vi.fn(), isEnabled: () => false }}>
          <AppProvider apiClient={apiClient}>
            <VaultSeeder vault={testVault} />
            <ThemeManager />
          </AppProvider>
        </FeatureContext.Provider>,
      )
      expect(await screen.findByText(/Installiere dafür unter Einstellungen/)).toBeInTheDocument()
      expect(screen.queryByText(/Administrator/)).not.toBeInTheDocument()
    })

    it('makes no claim about the plugin when the lookup fails (unknown is not "not installed")', async () => {
      renderWithRegistry(async () => { throw new Error('offline') })
      expect(await screen.findByText(/ob es in diesem Vault installiert ist, konnte nicht geprüft werden/)).toBeInTheDocument()
      expect(screen.queryByText(/Installiere dafür/)).not.toBeInTheDocument()
    })

    it('shows nothing, and does not query the plugin registry, for themes without settings', async () => {
      const apiClient = renderWithRegistry(registryWith(), [things])
      await screen.findByRole('radio', { name: /Things/ })
      expect(screen.queryByText(/bringen eigene Einstellungen mit/)).not.toBeInTheDocument()
      expect(screen.queryByTitle('Hat eigene Einstellungen')).not.toBeInTheDocument()
      expect(apiClient.loadRegistry).not.toHaveBeenCalled()
    })

    it('says an administrator must enable plugin compatibility when that feature is off', async () => {
      const apiClient = createMockApiClient({
        listThemes: vi.fn().mockResolvedValue({ themes: [withSettings], activeThemeId: null }),
        loadRegistry: vi.fn(),
      } as Partial<IApiClient>)
      render(
        <FeatureContext.Provider
          value={{
            state: { ...initialFeatureState, features: [{ name: 'obsidian-plugin-compat', enabled: false, type: 'cold', description: '' }] },
            dispatch: vi.fn(),
            isEnabled: () => false,
          }}
        >
          <AppProvider apiClient={apiClient}>
            <VaultSeeder vault={testVault} />
            <ThemeManager />
          </AppProvider>
        </FeatureContext.Provider>,
      )
      expect(await screen.findByText(/dafür muss ein Administrator die Plugin-Kompatibilität aktivieren/)).toBeInTheDocument()
      expect(apiClient.loadRegistry).not.toHaveBeenCalled()
    })
  })
})
