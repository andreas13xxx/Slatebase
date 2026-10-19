import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../../state'
import { themeInjector } from '../../plugins/appearance/theme-injector'
import { ThemeManager } from './ThemeManager'
import type { IApiClient, ThemeMeta } from '../../api'
import type { VaultInfo } from '../../types'

const things: ThemeMeta = { id: 'Things', manifest: { name: 'Things', version: '2.1.0', author: 'Colin' }, size: 2048, updatedAt: '2026-10-17T00:00:00.000Z', externalHosts: [] }
const fonts: ThemeMeta = { id: 'Fancy', manifest: { name: 'Fancy' }, size: 100, updatedAt: '2026-10-17T00:00:00.000Z', externalHosts: ['fonts.googleapis.com'] }

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

  it('imports a theme.css with its manifest under the manifest name', async () => {
    const apiClient = createMockApiClient()
    renderManager(apiClient)
    await screen.findByLabelText('Slatebase (Standard)')

    const css = new File(['body { --x: 1 }'], 'theme.css')
    const manifest = new File([JSON.stringify({ name: 'Minimal', version: '7.0.0' })], 'manifest.json')
    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [css, manifest] } })

    await waitFor(() => expect(apiClient.saveTheme).toHaveBeenCalledWith('vault1', 'Minimal', 'body { --x: 1 }', { name: 'Minimal', version: '7.0.0' }))
  })

  it('explains what is missing when the name cannot be derived', async () => {
    const apiClient = createMockApiClient()
    renderManager(apiClient)
    await screen.findByLabelText('Slatebase (Standard)')

    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [new File(['a{}'], 'theme.css')] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/Theme-Name fehlt/)
    expect(apiClient.saveTheme).not.toHaveBeenCalled()
  })

  it('asks before overwriting an existing theme', async () => {
    const apiClient = createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [things], activeThemeId: null }),
    })
    renderManager(apiClient)
    await screen.findByRole('radio', { name: /Things/ })

    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [new File(['a{}'], 'Things.css')] } })

    expect(await screen.findByText(/existiert bereits/)).toBeInTheDocument()
    expect(apiClient.saveTheme).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Überschreiben' }))
    await waitFor(() => expect(apiClient.saveTheme).toHaveBeenCalledWith('vault1', 'Things', 'a{}', {}))
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
})
