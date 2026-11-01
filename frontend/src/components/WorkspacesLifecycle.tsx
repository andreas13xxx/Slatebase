/**
 * WorkspacesLifecycle — loads the open vault's saved layouts from `.obsidian/workspaces.json` into the
 * workspaces store when the vault is opened and whenever the server reports a change to the file
 * (`vault:change`, e.g. from Obsidian, a sync or another user). Renders nothing; mounted once near the
 * app root, next to HotkeysLifecycle.
 */
import { useEffect } from 'react'
import { useAppContext } from '../state'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { loadVaultWorkspaces } from '../state/workspacesStore'

const WORKSPACES_PATH = '.obsidian/workspaces.json'

export function WorkspacesLifecycle(): null {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  useEffect(() => {
    if (!apiClient || !vaultId) return
    void loadVaultWorkspaces(vaultId)
    return onRealtimeVaultChange((event) => {
      if (event.vaultId === vaultId && event.path === WORKSPACES_PATH) void loadVaultWorkspaces(vaultId)
    })
  }, [apiClient, vaultId])

  return null
}
