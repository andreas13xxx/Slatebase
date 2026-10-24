import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { PluginManagementPage } from './PluginManagementPage'
import { dispatchRealtimeVaultChange } from '../state/realtimeVaultBridge'
import type { IApiClient } from '../api'

function manifest(id: string, name: string) {
  return { id, name, version: '1.0.0', author: 'A', description: '' }
}

function createApiClient(listPlugins: ReturnType<typeof vi.fn>): IApiClient {
  return {
    listPlugins,
    loadRegistry: vi.fn().mockResolvedValue({ version: 1, plugins: {} }),
    loadBundle: vi.fn().mockResolvedValue(''),
    checkPluginUpdates: vi.fn().mockResolvedValue({ plugins: [] }),
  } as unknown as IApiClient
}

function change(path: string, vaultId = 'vault-1'): void {
  act(() => {
    dispatchRealtimeVaultChange({ vaultId, action: 'saved', path, userId: 'other', username: 'other' })
  })
}

describe('PluginManagementPage refresh on vault changes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a plugin that another user installed, without a loading state', async () => {
    const listPlugins = vi.fn().mockResolvedValue({ plugins: [manifest('alpha', 'Alpha Plugin')] })
    render(<PluginManagementPage apiClient={createApiClient(listPlugins)} vaultId="vault-1" />)
    await screen.findByText('Alpha Plugin')

    listPlugins.mockResolvedValue({ plugins: [manifest('alpha', 'Alpha Plugin'), manifest('beta', 'Beta Plugin')] })
    change('.obsidian/plugins/beta/manifest.json')

    await screen.findByText('Beta Plugin')
    expect(screen.getByText('Alpha Plugin')).toBeTruthy()
    expect(screen.queryByText('Plugins werden geladen…')).toBeNull()
  })

  it('keeps showing the list when the background refresh fails', async () => {
    const listPlugins = vi.fn().mockResolvedValue({ plugins: [manifest('alpha', 'Alpha Plugin')] })
    render(<PluginManagementPage apiClient={createApiClient(listPlugins)} vaultId="vault-1" />)
    await screen.findByText('Alpha Plugin')

    listPlugins.mockRejectedValue(new Error('offline'))
    change('.obsidian/community-plugins.json')

    await waitFor(() => expect(listPlugins).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Alpha Plugin')).toBeTruthy()
    expect(screen.queryByText(/Fehler beim Laden/)).toBeNull()
  })

  it('ignores changes of other vaults, notes and a plugin\'s own data.json', async () => {
    const listPlugins = vi.fn().mockResolvedValue({ plugins: [manifest('alpha', 'Alpha Plugin')] })
    render(<PluginManagementPage apiClient={createApiClient(listPlugins)} vaultId="vault-1" />)
    await screen.findByText('Alpha Plugin')

    change('.obsidian/plugins/beta/manifest.json', 'vault-2')
    change('notes/a.md')
    change('.obsidian/plugins/alpha/data.json')
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(listPlugins).toHaveBeenCalledTimes(1)
  })
})
