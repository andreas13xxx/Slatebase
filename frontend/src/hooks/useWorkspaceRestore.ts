import { useEffect, useRef } from 'react'
import type { Dispatch } from 'react'
import type { IApiClient } from '../api'
import type { AppAction, VaultInfo } from '../types'
import type { TabAction, TabState } from '../state/tabState'
import type { AppPage } from '../App'
import {
  getState as getWorkspaceState,
  updateLayout as updateWorkspaceLayout,
  updateTabs as updateWorkspaceTabs,
  update as updateWorkspace,
  flush as flushWorkspace,
} from '../state/workspaceStore'

/** LocalStorage key for persisting the last selected vault (also used by App.tsx's logout handler). */
export const LAST_VAULT_KEY = 'slatebase_last_vault'

/** Params for useWorkspaceRestore. */
export interface UseWorkspaceRestoreParams {
  vaults: VaultInfo[]
  selectedVaultId: string | null
  dispatch: Dispatch<AppAction>
  tabs: TabState['tabs']
  activeTabId: TabState['activeTabId']
  tabDispatch: Dispatch<TabAction>
  /** Currently active settings page, or null — persisted verbatim, not interpreted. */
  activeSettingsPage: AppPage | null
  showSidebar: boolean
  showRightPanel: boolean
  apiClient: IApiClient
}

/**
 * Owns the app's session-persistence lifecycle: restoring vault selection,
 * open tabs, and panel layout from the workspace store on mount (survives
 * page reload and session expiry), then continuously persisting changes
 * back to it. Falls back to the simpler LAST_VAULT_KEY localStorage entry
 * for vault selection when no workspace state exists yet.
 *
 * Extracted from AppContent — these seven effects only coordinate with each
 * other (via isRestoringRef/hasRestoredRef) and have no rendering logic.
 */
export function useWorkspaceRestore({
  vaults,
  selectedVaultId,
  dispatch,
  tabs,
  activeTabId,
  tabDispatch,
  activeSettingsPage,
  showSidebar,
  showRightPanel,
  apiClient,
}: UseWorkspaceRestoreParams): void {
  // Restore last selected vault after vaults are loaded
  useEffect(() => {
    if (vaults.length === 0) return
    if (selectedVaultId !== null) return
    // Skip if workspace store has persisted state — the restore effect handles vault selection
    if (getWorkspaceState().selectedVaultId) return
    const lastId = localStorage.getItem(LAST_VAULT_KEY)
    if (lastId && vaults.some((v) => v.id === lastId)) {
      dispatch({ type: 'VAULT_SELECTED', payload: lastId })
    }
  }, [vaults, selectedVaultId, dispatch])

  // Persist selected vault to localStorage
  useEffect(() => {
    if (selectedVaultId) {
      localStorage.setItem(LAST_VAULT_KEY, selectedVaultId)
    }
  }, [selectedVaultId])

  // Persist panel visibility to workspace store
  useEffect(() => {
    updateWorkspaceLayout({ sidebarVisible: showSidebar, rightPanelVisible: showRightPanel })
  }, [showSidebar, showRightPanel])

  // Persist active settings page and selected vault to workspace store
  useEffect(() => {
    updateWorkspace({ activeSettingsPage, selectedVaultId })
  }, [activeSettingsPage, selectedVaultId])

  // Persist open tabs to workspace store (skip during initial restore phase)
  const isRestoringRef = useRef(true)
  useEffect(() => {
    // Don't persist until the restore effect has run at least once
    if (isRestoringRef.current) return
    const persistedTabs = tabs.map((t) => ({
      vaultId: t.vaultId,
      filePath: t.filePath,
      fileName: t.fileName,
      mode: t.mode,
    }))
    updateWorkspaceTabs(persistedTabs, activeTabId)
  }, [tabs, activeTabId])

  // Flush workspace state on page unload. `beforeunload` alone misses cases
  // like mobile backgrounding, tab discarding, or the OS killing the process —
  // `visibilitychange`/`pagehide` catch those so a pending debounced write
  // (e.g. a just-closed tab) isn't lost and later resurrected by a stale read.
  useEffect(() => {
    const handleFlush = () => { flushWorkspace() }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushWorkspace()
    }
    window.addEventListener('beforeunload', handleFlush)
    window.addEventListener('pagehide', handleFlush)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', handleFlush)
      window.removeEventListener('pagehide', handleFlush)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Restore UI state from workspace store (survives page reload and session expiry)
  const hasRestoredRef = useRef(false)
  useEffect(() => {
    if (hasRestoredRef.current) return
    if (vaults.length === 0) return

    const wsState = getWorkspaceState()
    // Only restore if there are persisted tabs
    if (wsState.tabs.length === 0 && !wsState.selectedVaultId) {
      // Nothing to restore — enable persistence immediately
      hasRestoredRef.current = true
      isRestoringRef.current = false
      return
    }

    hasRestoredRef.current = true

    // Restore vault selection
    if (wsState.selectedVaultId && vaults.some((v) => v.id === wsState.selectedVaultId)) {
      dispatch({ type: 'VAULT_SELECTED', payload: wsState.selectedVaultId })
    }

    // Restore tabs — only if the vaults still exist, then fetch content
    const validVaultIds = new Set(vaults.map((v) => v.id))
    for (const tab of wsState.tabs) {
      if (!validVaultIds.has(tab.vaultId)) continue
      tabDispatch({
        type: 'OPEN_TAB',
        payload: { vaultId: tab.vaultId, filePath: tab.filePath, fileName: tab.fileName },
      })
      // Fetch content for regular file tabs (skip virtual tabs like __graph__, __view::*)
      const tabId = `${tab.vaultId}::${tab.filePath}`
      if (!tab.filePath.startsWith('__')) {
        apiClient.fetchFileContent(tab.vaultId, tab.filePath).then(
          (result) => {
            tabDispatch({
              type: 'TAB_CONTENT_LOADED',
              payload: { tabId, content: result.content, isBinary: result.isBinary },
            })
          },
          () => {
            // File no longer exists — close the tab
            tabDispatch({ type: 'CLOSE_TAB', payload: { tabId } })
          },
        )
      } else {
        // Virtual tabs (graph, plugin views) don't need content fetch
        tabDispatch({
          type: 'TAB_CONTENT_LOADED',
          payload: { tabId, content: '', isBinary: false },
        })
      }
    }

    // Restore active tab
    if (wsState.activeTabId) {
      tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId: wsState.activeTabId } })
    }

    // Enable tab persistence now that restore is complete
    isRestoringRef.current = false
  }, [vaults, dispatch, tabDispatch, apiClient])
}
