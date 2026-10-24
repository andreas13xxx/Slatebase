import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../../state'
import { themeInjector } from '../../plugins/appearance/theme-injector'
import { ThemeImport } from './ThemeImport'
import type { IApiClient, ThemeMeta } from '../../api'
import type { VaultInfo } from '../../types'

const things: ThemeMeta = { id: 'Things', manifest: { name: 'Things', version: '2.1.0', author: 'Colin' }, size: 2048, updatedAt: '2026-10-17T00:00:00.000Z', externalHosts: [], hasStyleSettings: false }

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    listThemes: vi.fn().mockResolvedValue({ themes: [], activeThemeId: null }),
    saveTheme: vi.fn().mockResolvedValue(things),
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

function renderImport(apiClient: IApiClient) {
  return render(
    <AppProvider apiClient={apiClient}>
      <VaultSeeder vault={{ id: 'vault1', name: 'My Vault' }} />
      <ThemeImport />
    </AppProvider>,
  )
}

describe('ThemeImport', () => {
  afterEach(() => {
    themeInjector.remove()
  })

  it('imports a theme.css with its manifest under the manifest name', async () => {
    const apiClient = createMockApiClient()
    renderImport(apiClient)
    await screen.findByTestId('theme-file-input')

    const css = new File(['body { --x: 1 }'], 'theme.css')
    const manifest = new File([JSON.stringify({ name: 'Minimal', version: '7.0.0' })], 'manifest.json')
    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [css, manifest] } })

    await waitFor(() => expect(apiClient.saveTheme).toHaveBeenCalledWith('vault1', 'Minimal', 'body { --x: 1 }', { name: 'Minimal', version: '7.0.0' }))
  })


  it('explains what is missing when the name cannot be derived', async () => {
    const apiClient = createMockApiClient()
    renderImport(apiClient)
    await screen.findByTestId('theme-file-input')

    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [new File(['a{}'], 'theme.css')] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/Theme-Name fehlt/)
    expect(apiClient.saveTheme).not.toHaveBeenCalled()
  })


  it('asks before overwriting an existing theme', async () => {
    const apiClient = createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [things], activeThemeId: null }),
    })
    renderImport(apiClient)
    await screen.findByTestId('theme-file-input')

    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [new File(['a{}'], 'Things.css')] } })

    expect(await screen.findByText(/existiert bereits/)).toBeInTheDocument()
    expect(apiClient.saveTheme).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Überschreiben' }))
    await waitFor(() => expect(apiClient.saveTheme).toHaveBeenCalledWith('vault1', 'Things', 'a{}', {}))
  })


  it('treats a differently cased name as the existing theme and overwrites that folder', async () => {
    const minimal: ThemeMeta = { id: 'Minimal', manifest: { name: 'Minimal' }, size: 10, updatedAt: '2026-10-17T00:00:00.000Z', externalHosts: [], hasStyleSettings: false }
    const apiClient = createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [minimal], activeThemeId: null }),
    })
    renderImport(apiClient)
    await screen.findByTestId('theme-file-input')

    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [new File(['a{}'], 'minimal.css')] } })

    expect(await screen.findByText(/existiert bereits/)).toBeInTheDocument()
    expect(apiClient.saveTheme).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Überschreiben' }))
    await waitFor(() => expect(apiClient.saveTheme).toHaveBeenCalledWith('vault1', 'Minimal', 'a{}', {}))
  })


  it('imports a theme named "Active" under a free id instead of a reserved one', async () => {
    const apiClient = createMockApiClient()
    renderImport(apiClient)
    await screen.findByTestId('theme-file-input')

    const manifest = new File([JSON.stringify({ name: 'Active' })], 'manifest.json')
    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [new File(['a{}'], 'theme.css'), manifest] } })

    await waitFor(() => expect(apiClient.saveTheme).toHaveBeenCalledWith('vault1', 'Active-theme', 'a{}', { name: 'Active' }))
  })

  it('confirms a finished import and points to the installed themes', async () => {
    renderImport(createMockApiClient())
    await screen.findByTestId('theme-file-input')

    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [new File(['a{}'], 'Neon.css')] } })

    expect(await screen.findByText(/wurde importiert/)).toHaveTextContent(/Installiert/)
  })

  it('does not overwrite anything when the existing themes cannot be listed', async () => {
    const apiClient = createMockApiClient({ listThemes: vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', message: 'kaputt' }) })
    renderImport(apiClient)
    await screen.findByTestId('theme-file-input')

    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [new File(['a{}'], 'Things.css')] } })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(apiClient.saveTheme).not.toHaveBeenCalled()
  })

  it('re-applies an overwritten active theme right away', async () => {
    const apiClient = createMockApiClient({ listThemes: vi.fn().mockResolvedValue({ themes: [things], activeThemeId: 'Things' }) })
    renderImport(apiClient)
    await screen.findByTestId('theme-file-input')

    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [new File(['b{}'], 'Things.css')] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Überschreiben' }))

    await waitFor(() => expect(document.head.querySelector('style[data-slatebase-theme]')?.textContent).toBe('b{}'))
    expect(screen.getByText(/wurde überschrieben/)).toBeInTheDocument()
  })

  it('does not re-apply an overwritten theme that is not active any more by the time the overwrite is confirmed', async () => {
    const listThemes = vi.fn()
      .mockResolvedValueOnce({ themes: [things], activeThemeId: 'Things' }) // when the file is picked
      .mockResolvedValue({ themes: [things], activeThemeId: null }) // after the save
    renderImport(createMockApiClient({ listThemes }))
    await screen.findByTestId('theme-file-input')

    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [new File(['b{}'], 'Things.css')] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Überschreiben' }))

    await screen.findByText(/wurde überschrieben/)
    await waitFor(() => expect(listThemes).toHaveBeenCalledTimes(2))
    expect(document.head.querySelector('style[data-slatebase-theme]')).toBeNull()
  })

  it('shows an error when the dropped files cannot be read', async () => {
    renderImport(createMockApiClient())
    await screen.findByTestId('theme-file-input')
    const broken = new File(['a{}'], 'theme.css')
    Object.defineProperty(broken, 'text', { value: () => Promise.reject(new Error('Lesefehler')) })

    fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [broken] } })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
