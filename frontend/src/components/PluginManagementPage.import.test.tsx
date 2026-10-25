/**
 * Page-level tests for the "Importieren" tab and "activate after installation" in PluginManagementPage.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PluginManagementPage } from './PluginManagementPage'
import { PluginContext } from '../plugins/compat/plugin-context'
import type { PluginContextValue } from '../plugins/compat/plugin-context'
import type { IApiClient, PluginInstallResult } from '../api'

function installResult(warnings?: string[]): PluginInstallResult {
  return {
    pluginId: 'calendar',
    manifest: { id: 'calendar', name: 'Calendar', version: '1.0.0' },
    isUpgrade: false,
    ...(warnings ? { warnings } : {}),
  }
}

function createApi(result: PluginInstallResult): IApiClient {
  return {
    listPlugins: vi.fn().mockResolvedValue({ plugins: [] }),
    loadRegistry: vi.fn().mockResolvedValue({ version: 1, plugins: {} }),
    loadBundle: vi.fn().mockResolvedValue(''),
    checkPluginUpdates: vi.fn().mockResolvedValue({ plugins: [] }),
    uploadPlugin: vi.fn().mockResolvedValue(result),
  } as unknown as IApiClient
}

async function renderOnImportTab(result: PluginInstallResult, setPluginEnabled: ReturnType<typeof vi.fn>) {
  const ctx = { setPluginEnabled } as unknown as PluginContextValue
  const view = render(
    <PluginContext.Provider value={ctx}>
      <PluginManagementPage apiClient={createApi(result)} vaultId="v" />
    </PluginContext.Provider>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Importieren' }))
  return view
}

function pickZip(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['zip'], 'calendar.zip')] } })
}

describe('PluginManagementPage import tab', () => {
  it('moves the ZIP upload from "Installierte Plugins" to "Importieren"', async () => {
    const view = await renderOnImportTab(installResult(), vi.fn())
    expect(screen.getByLabelText('Plugin-ZIP hochladen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Installierte Plugins' }))
    expect(view.container.querySelector('.plugin-upload')).toBeNull()
  })

  it('activates an uploaded plugin when the checkbox is on', async () => {
    const setPluginEnabled = vi.fn().mockResolvedValue(undefined)
    const view = await renderOnImportTab(installResult(), setPluginEnabled)
    fireEvent.click(screen.getByLabelText('Nach der Installation aktivieren'))
    pickZip(view.container)
    await waitFor(() => expect(setPluginEnabled).toHaveBeenCalledWith('calendar', true))
  })

  it('does not activate when the checkbox is off', async () => {
    const setPluginEnabled = vi.fn().mockResolvedValue(undefined)
    const view = await renderOnImportTab(installResult(), setPluginEnabled)
    pickZip(view.container)
    await screen.findByText(/Plugin installiert/)
    expect(setPluginEnabled).not.toHaveBeenCalled()
  })

  it('refuses to auto-activate a plugin that uses eval and says why', async () => {
    const setPluginEnabled = vi.fn().mockResolvedValue(undefined)
    const view = await renderOnImportTab(installResult(['uses eval(']), setPluginEnabled)
    fireEvent.click(screen.getByLabelText('Nach der Installation aktivieren'))
    pickZip(view.container)
    await screen.findByText(/nutzt eval und wurde nicht automatisch aktiviert/)
    expect(setPluginEnabled).not.toHaveBeenCalled()
  })
})
