/**
 * HotkeysLifecycle — loads the open vault's key bindings from `.obsidian/hotkeys.json` into the
 * keybindings store when the vault is opened and whenever the server reports a change to the file
 * (`vault:change`, e.g. from Obsidian, a sync or another user). Renders nothing; mounted once near
 * the app root, next to BookmarksLifecycle.
 */
import { useEffect } from 'react'
import { useAppContext } from '../state'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { loadVaultHotkeys } from '../state/keybindingsStore'

const HOTKEYS_PATH = '.obsidian/hotkeys.json'

export function HotkeysLifecycle(): null {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  useEffect(() => {
    if (!apiClient || !vaultId) return
    void loadVaultHotkeys(vaultId)
    return onRealtimeVaultChange((event) => {
      if (event.vaultId === vaultId && event.path === HOTKEYS_PATH) void loadVaultHotkeys(vaultId)
    })
  }, [apiClient, vaultId])

  return null
}
