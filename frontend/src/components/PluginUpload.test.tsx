/**
 * Unit tests for PluginUpload: ZIP upload and the "activate after installation" option.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PluginUpload } from './PluginUpload'
import type { IApiClient, PluginInstallResult } from '../api'

const result: PluginInstallResult = {
  pluginId: 'calendar',
  manifest: { id: 'calendar', name: 'Calendar', version: '1.0.0' },
  isUpgrade: false,
}

function createApi(upload = vi.fn().mockResolvedValue(result)): IApiClient {
  return { uploadPlugin: upload } as unknown as IApiClient
}

function pickZip(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['zip'], 'calendar.zip', { type: 'application/zip' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('PluginUpload', () => {
  it('shows the checkbox only when a change handler is given', () => {
    const { rerender } = render(<PluginUpload apiClient={createApi()} vaultId="v" />)
    expect(screen.queryByLabelText('Nach der Installation aktivieren')).toBeNull()
    rerender(<PluginUpload apiClient={createApi()} vaultId="v" onActivateAfterInstallChange={vi.fn()} />)
    expect(screen.getByLabelText('Nach der Installation aktivieren')).toBeInTheDocument()
  })

  it('activates before notifying the parent when the option is on', async () => {
    const order: string[] = []
    const onActivate = vi.fn().mockImplementation(async () => { order.push('activate') })
    const onPluginInstalled = vi.fn().mockImplementation(() => { order.push('installed') })
    const { container } = render(
      <PluginUpload
        apiClient={createApi()}
        vaultId="v"
        onPluginInstalled={onPluginInstalled}
        activateAfterInstall
        onActivateAfterInstallChange={vi.fn()}
        onActivate={onActivate}
      />,
    )
    pickZip(container)
    await waitFor(() => { expect(onPluginInstalled).toHaveBeenCalled() })
    expect(onActivate).toHaveBeenCalledWith(result)
    expect(order).toEqual(['activate', 'installed'])
  })

  it('does not activate when the option is off', async () => {
    const onActivate = vi.fn()
    const onPluginInstalled = vi.fn()
    const { container } = render(
      <PluginUpload
        apiClient={createApi()}
        vaultId="v"
        onPluginInstalled={onPluginInstalled}
        onActivateAfterInstallChange={vi.fn()}
        onActivate={onActivate}
      />,
    )
    pickZip(container)
    await waitFor(() => { expect(onPluginInstalled).toHaveBeenCalled() })
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('reports a failed activation but keeps the plugin installed', async () => {
    const onPluginInstalled = vi.fn()
    const { container } = render(
      <PluginUpload
        apiClient={createApi()}
        vaultId="v"
        onPluginInstalled={onPluginInstalled}
        activateAfterInstall
        onActivateAfterInstallChange={vi.fn()}
        onActivate={vi.fn().mockRejectedValue(new Error('boom'))}
      />,
    )
    pickZip(container)
    await waitFor(() => { expect(onPluginInstalled).toHaveBeenCalled() })
    expect(screen.getByText(/konnte aber nicht aktiviert werden: boom/)).toBeInTheDocument()
  })

  it('hints that a running plugin needs a reload after an upgrade', async () => {
    const upload = vi.fn().mockResolvedValue({ ...result, isUpgrade: true })
    const { container } = render(<PluginUpload apiClient={createApi(upload)} vaultId="v" />)
    pickZip(container)
    await screen.findByText(/erst nach einem Neuladen der Seite wirksam/)
  })

  it('shows no reload hint for a fresh install', async () => {
    const { container } = render(<PluginUpload apiClient={createApi()} vaultId="v" />)
    pickZip(container)
    await screen.findByText(/Plugin installiert/)
    expect(screen.queryByText(/Neuladen der Seite/)).toBeNull()
  })
})
