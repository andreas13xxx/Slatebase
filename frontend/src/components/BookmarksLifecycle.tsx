/**
 * BookmarksLifecycle — loads the open vault's bookmarks from `.obsidian/bookmarks.json` into the
 * favorites store when the vault is opened and whenever the server reports a change to the file
 * (`vault:change`, e.g. from Obsidian, a sync or another user). Renders nothing; mounted once near
 * the app root, next to GraphConfigLifecycle.
 */
import { useEffect } from 'react'
import { useAppContext } from '../state'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { loadVaultBookmarks } from '../state/favoritesStore'

const BOOKMARKS_PATH = '.obsidian/bookmarks.json'

export function BookmarksLifecycle(): null {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  useEffect(() => {
    if (!apiClient || !vaultId) return
    void loadVaultBookmarks(vaultId)
    return onRealtimeVaultChange((event) => {
      if (event.vaultId === vaultId && event.path === BOOKMARKS_PATH) void loadVaultBookmarks(vaultId)
    })
  }, [apiClient, vaultId])

  return null
}
