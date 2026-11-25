/**
 * AppConfigLifecycle — keeps the app.json store pointed at the open vault and in sync with the
 * server. Renders nothing; mounted once near the app root (inside AppProvider), next to
 * ThemeLifecycle.
 *
 * The file lives in the vault (`.obsidian/app.json`), so it is re-read when the vault changes and
 * whenever the server reports a change to it (`vault:change`, e.g. from Obsidian or a sync).
 *
 * It is only mounted while someone is logged in, so unmounting it is the end of the session: the app.json
 * snapshot and the decrypted keychain caches are dropped then, and the next login starts from the server.
 */
import { useEffect } from 'react'
import { useAppContext } from '../state'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { disconnectVaultSecretStorages } from '../plugins/compat/obsidian-api-extensions'
import {
  APP_CONFIG_PATH,
  disconnect as disconnectAppConfig,
  initialize as initializeAppConfig,
  refreshAppConfig,
  setActiveVault as setActiveAppConfigVault,
} from '../state/vaultAppConfigStore'
import {
  PAGE_PREVIEW_CONFIG_PATH,
  disconnect as disconnectPagePreviewConfig,
  initialize as initializePagePreviewConfig,
  refreshPagePreviewConfig,
  setActiveVault as setActivePagePreviewVault,
} from '../state/pagePreviewConfigStore'

export function AppConfigLifecycle(): null {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  useEffect(() => () => {
    disconnectAppConfig()
    disconnectPagePreviewConfig()
    disconnectVaultSecretStorages()
  }, [])

  useEffect(() => {
    if (apiClient) {
      initializeAppConfig(apiClient)
      initializePagePreviewConfig(apiClient)
    }
  }, [apiClient])

  useEffect(() => {
    if (!apiClient) return
    void setActiveAppConfigVault(vaultId)
    void setActivePagePreviewVault(vaultId)
    if (!vaultId) return
    return onRealtimeVaultChange((event) => {
      if (event.vaultId !== vaultId) return
      if (event.path === APP_CONFIG_PATH) void refreshAppConfig(vaultId)
      if (event.path === PAGE_PREVIEW_CONFIG_PATH) void refreshPagePreviewConfig(vaultId)
    })
  }, [apiClient, vaultId])

  return null
}
