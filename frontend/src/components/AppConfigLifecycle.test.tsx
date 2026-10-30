import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../state'
import { AppConfigLifecycle } from './AppConfigLifecycle'
import { _reset, getAppConfigValue } from '../state/vaultAppConfigStore'
import { dispatchRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { getVaultSecretStorage } from '../plugins/compat/obsidian-api-extensions'
import type { IApiClient } from '../api'

function VaultSeeder({ vaultId }: { vaultId: string }) {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: [{ id: vaultId, name: vaultId }] })
    dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function createClient(file: Record<string, unknown>) {
  return {
    file,
    getAppConfig: vi.fn(async () => ({ ...file })),
    listKeychainSecrets: vi.fn(async () => ['k']),
    getKeychainSecret: vi.fn(async () => 'geheim'),
    setKeychainSecret: vi.fn(async () => {}),
  }
}

function mount(client: ReturnType<typeof createClient>, vaultId = 'v1') {
  return render(
    <AppProvider apiClient={client as unknown as IApiClient}>
      <VaultSeeder vaultId={vaultId} />
      <AppConfigLifecycle />
    </AppProvider>,
  )
}

describe('AppConfigLifecycle', () => {
  beforeEach(() => _reset())

  it('loads the selected vault’s app.json', async () => {
    mount(createClient({ showLineNumber: true }))
    await waitFor(() => expect(getAppConfigValue('showLineNumber')).toBe(true))
  })

  it('re-reads the file when the server reports a change to it, and ignores other files and vaults', async () => {
    const client = createClient({ showLineNumber: false })
    mount(client)
    await waitFor(() => expect(client.getAppConfig).toHaveBeenCalledTimes(1))

    client.file['showLineNumber'] = true
    act(() => { dispatchRealtimeVaultChange({ vaultId: 'v1', action: 'saved', path: 'notes/a.md', userId: 'u', username: 'u' }) })
    act(() => { dispatchRealtimeVaultChange({ vaultId: 'other', action: 'saved', path: '.obsidian/app.json', userId: 'u', username: 'u' }) })
    expect(client.getAppConfig).toHaveBeenCalledTimes(1)

    act(() => { dispatchRealtimeVaultChange({ vaultId: 'v1', action: 'saved', path: '.obsidian/app.json', userId: 'u', username: 'u' }) })
    await waitFor(() => expect(getAppConfigValue('showLineNumber')).toBe(true))
  })

  it('drops the app.json snapshot and the decrypted keychain caches when the session ends (unmount)', async () => {
    const client = createClient({ showLineNumber: true })
    const view = mount(client)
    await waitFor(() => expect(getAppConfigValue('showLineNumber')).toBe(true))

    const storage = getVaultSecretStorage(client as unknown as IApiClient, 'v1')
    await storage.initialize()
    expect(storage.getSecret('k')).toBe('geheim')

    view.unmount()

    expect(getAppConfigValue('showLineNumber')).toBe(false)
    // The next login gets a fresh instance that has to ask the server again.
    expect(getVaultSecretStorage(client as unknown as IApiClient, 'v1')).not.toBe(storage)
  })
})
