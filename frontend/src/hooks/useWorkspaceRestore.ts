import { useEffect, useRef } from 'react'
import type { Dispatch } from 'react'
import type { IApiClient } from '../api'
import type { AppAction, VaultInfo } from '../types'
import type { TabState } from '../state/tabState'
import type { AppPage } from '../App'
import {
  getState as getWorkspaceState,
  updateLayout as updateWorkspaceLayout,
  updateTabs as updateWorkspaceTabs,
  updatePaneTree as updateWorkspacePaneTree,
  update as updateWorkspace,
  flush as flushWorkspace,
} from '../state/workspaceStore'
import {
  rehydratePaneTree,
  migrateFlatTabsToPaneTree,
  serializePaneTree,
  listPanes,
  type PaneTree,
  type PaneTreeAction,
  type PersistedPaneTab,
} from '../state/paneTreeState'

/** LocalStorage key for persisting the last selected vault (also used by App.tsx's logout handler). */
export const LAST_VAULT_KEY = 'slatebase_last_vault'

/** Deterministic id for the single pane produced by migrating a legacy flat tab list. */
const MIGRATION_PANE_ID = 'pane-root'

/**
 * Compute the pane tree to seed `PaneTreeProvider` with, from persisted
 * workspace state — synchronously, before the first React render (mirrors the
 * module-level `initializeWorkspace()` call). Returns a live `PaneTree` whose
 * tabs are in their `loading` state (content fetched post-mount by the restore
 * effect), or `null` when there is nothing to restore (fresh single pane).
 *
 * Resolution order: an explicit persisted `paneTree` wins; otherwise the legacy
 * flat `tabs`/`activeTabId` blob is migrated into a single pane; an empty
 * workspace yields `null`.
 */
export function getInitialPaneTree(): PaneTree | null {
  const ws = getWorkspaceState()
  if (ws.paneTree) {
    return rehydratePaneTree(ws.paneTree)
  }
  if (ws.tabs.length > 0) {
    const persistedTabs: PersistedPaneTab[] = ws.tabs.map((t) => {
      const tab: PersistedPaneTab = {
        vaultId: t.vaultId,
        filePath: t.filePath,
        fileName: t.fileName,
        mode: t.mode,
        pinned: t.pinned ?? false,
      }
      return tab
    })
    return rehydratePaneTree(migrateFlatTabsToPaneTree(persistedTabs, ws.activeTabId, MIGRATION_PANE_ID))
  }
  return null
}

/** Params for useWorkspaceRestore. */
export interface UseWorkspaceRestoreParams {
  vaults: VaultInfo[]
  selectedVaultId: string | null
  dispatch: Dispatch<AppAction>
  tabs: TabState['tabs']
  activeTabId: TabState['activeTabId']
  /** The live pane tree (bridged source of truth for the layout). */
  paneTree: PaneTree
  /** Dispatch to the pane tree, used to deliver fetched content to each pane. */
  paneTreeDispatch: Dispatch<PaneTreeAction>
  /** Currently active settings page, or null — persisted verbatim, not interpreted. */
  activeSettingsPage: AppPage | null
  showSidebar: boolean
  showRightPanel: boolean
  apiClient: IApiClient
}

/**
 * Owns the app's session-persistence lifecycle: restoring vault selection,
 * the split-pane layout, and panel layout from the workspace store on mount
 * (survives page reload and session expiry), then continuously persisting
 * changes back to it. Falls back to the simpler LAST_VAULT_KEY localStorage
 * entry for vault selection when no workspace state exists yet.
 *
 * The pane tree is seeded synchronously via `getInitialPaneTree()` (passed as
 * `PaneTreeProvider`'s `initialTree`), so the layout is correct on first paint;
 * this hook only fetches each restored tab's content afterwards and keeps the
 * persisted tree in sync as the layout changes.
 */
export function useWorkspaceRestore({
  vaults,
  selectedVaultId,
  dispatch,
  tabs,
  activeTabId,
  paneTree,
  paneTreeDispatch,
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

  // Persist open tabs to workspace store (skip during initial restore phase).
  // Kept for backward compat: `tabs`/`activeTabId` reflect the ACTIVE pane via
  // the useTabContext bridge, so this mirrors today's flat shape and lets an
  // older build (without pane-tree support) still restore a usable single pane.
  const isRestoringRef = useRef(true)
  useEffect(() => {
    // Don't persist until the restore effect has run at least once
    if (isRestoringRef.current) return
    const persistedTabs = tabs.map((t) => ({
      vaultId: t.vaultId,
      filePath: t.filePath,
      fileName: t.fileName,
      mode: t.mode,
      pinned: t.pinned,
    }))
    updateWorkspaceTabs(persistedTabs, activeTabId)
  }, [tabs, activeTabId])

  // Persist the full split-pane layout (structure, sizes, per-pane tabs,
  // active pane) whenever it changes. Content-free and debounced, so it is
  // cheap. This is the authoritative layout on the next restore.
  useEffect(() => {
    if (isRestoringRef.current) return
    updateWorkspacePaneTree(serializePaneTree(paneTree))
  }, [paneTree])

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

  // Restore UI state from workspace store (survives page reload and session
  // expiry). The pane tree itself was seeded synchronously before first render
  // (via getInitialPaneTree → PaneTreeProvider's initialTree), so every tab
  // already exists in its loading state; this effect only fetches each tab's
  // content and delivers it to the pane that owns it.
  const hasRestoredRef = useRef(false)
  useEffect(() => {
    if (hasRestoredRef.current) return
    if (vaults.length === 0) return

    const wsState = getWorkspaceState()
    // Nothing to restore if there are no persisted tabs/tree and no vault.
    const hasPanesWithTabs = listPanes(paneTree).some((p) => p.tabState.tabs.length > 0)
    if (!hasPanesWithTabs && !wsState.selectedVaultId) {
      hasRestoredRef.current = true
      isRestoringRef.current = false
      return
    }

    hasRestoredRef.current = true

    // Restore vault selection
    if (wsState.selectedVaultId && vaults.some((v) => v.id === wsState.selectedVaultId)) {
      dispatch({ type: 'VAULT_SELECTED', payload: wsState.selectedVaultId })
    }

    // Fetch content for every pane's tabs. `cancelled` guards against a late
    // fetch resolving after the restore was torn down (StrictMode double-mount,
    // fast logout) and dispatching into a stale tree.
    let cancelled = false
    const validVaultIds = new Set(vaults.map((v) => v.id))

    for (const pane of listPanes(paneTree)) {
      for (const tab of pane.tabState.tabs) {
        const tabId = tab.id
        // A tab whose vault no longer exists is closed in its own pane.
        if (!validVaultIds.has(tab.vaultId)) {
          paneTreeDispatch({
            type: 'PANE_TAB_ACTION',
            payload: { paneId: pane.id, action: { type: 'CLOSE_TAB', payload: { tabId } } },
          })
          continue
        }
        // Virtual tabs (graph, plugin views) carry no file content.
        if (tab.filePath.startsWith('__')) {
          paneTreeDispatch({
            type: 'PANE_TAB_ACTION',
            payload: {
              paneId: pane.id,
              action: { type: 'TAB_CONTENT_LOADED', payload: { tabId, content: '', isBinary: false } },
            },
          })
          continue
        }
        apiClient.fetchFileContent(tab.vaultId, tab.filePath).then(
          (result) => {
            if (cancelled) return
            paneTreeDispatch({
              type: 'PANE_TAB_ACTION',
              payload: {
                paneId: pane.id,
                action: {
                  type: 'TAB_CONTENT_LOADED',
                  payload: { tabId, content: result.content, isBinary: result.isBinary },
                },
              },
            })
          },
          () => {
            if (cancelled) return
            // File no longer exists — close the tab in its pane.
            paneTreeDispatch({
              type: 'PANE_TAB_ACTION',
              payload: { paneId: pane.id, action: { type: 'CLOSE_TAB', payload: { tabId } } },
            })
          },
        )
      }
    }

    // Enable persistence now that restore is complete.
    isRestoringRef.current = false

    return () => {
      cancelled = true
    }
    // paneTree is intentionally read once at restore time (it is pre-seeded and
    // stable on mount); re-running on every tree change would re-fetch content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaults, dispatch, paneTreeDispatch, apiClient])
}
