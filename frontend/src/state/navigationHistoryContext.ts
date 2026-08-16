import { createContext, useContext, useReducer, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react'
import React from 'react'
import {
  navigationHistoryReducer,
  initialNavigationHistoryState,
  type NavigationHistoryState,
  type NavHistoryEntry,
} from './navigationHistoryState'
import { useTabContext } from './tabContext'
import { useAppContext } from './index'
import { openTab } from './tabActions'
import { generateTabId } from './tabState'
import { collectFilesSorted } from '../plugins/link-resolver'
import { showToast } from '../components/ToastNotification'

/** Context value exposing the navigation history and the actions that drive it. */
export interface NavigationHistoryContextValue {
  state: NavigationHistoryState
  goBack: () => void
  goForward: () => void
  canGoBack: boolean
  canGoForward: boolean
}

export const NavigationHistoryContext = createContext<NavigationHistoryContextValue | null>(null)

interface NavigationHistoryProviderProps {
  children: ReactNode
}

/**
 * Tracks browser-like back/forward history of visited files.
 *
 * Rather than threading a "record this visit" call through every navigation
 * trigger (link click, backlink, search result, quick switcher, explorer,
 * graph node, tab click/cycle, …), this watches `tabState.activeTabId`
 * centrally: any change to which tab is active is a visit, no matter what
 * caused it. GO_BACK/GO_FORWARD suppress the next auto-record via
 * `suppressNextRef` since they re-activate a tab themselves and must not
 * record that as a brand-new visit (Requirement 1.1's exception clause).
 */
export function NavigationHistoryProvider({ children }: NavigationHistoryProviderProps) {
  const [state, dispatch] = useReducer(navigationHistoryReducer, initialNavigationHistoryState)
  const { tabState, tabDispatch } = useTabContext()
  const { state: appState, dispatch: appDispatch, apiClient } = useAppContext()
  const suppressNextRef = useRef(false)

  const activeTab = tabState.activeTabId
    ? tabState.tabs.find((t) => t.id === tabState.activeTabId) ?? null
    : null

  useEffect(() => {
    if (!activeTab) return

    if (suppressNextRef.current) {
      suppressNextRef.current = false
      return
    }

    dispatch({
      type: 'RECORD_VISIT',
      entry: { vaultId: activeTab.vaultId, filePath: activeTab.filePath, fileName: activeTab.fileName },
      origin: 'visit',
    })
    // Only the identity of the active tab matters here, not its content/loading state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id])

  // Requirement 1.12: switching vaults discards the history of the previous vault.
  const selectedVaultId = appState.selectedVaultId
  const prevVaultIdRef = useRef(selectedVaultId)
  useEffect(() => {
    if (prevVaultIdRef.current !== selectedVaultId) {
      prevVaultIdRef.current = selectedVaultId
      dispatch({ type: 'CLEAR' })
    }
  }, [selectedVaultId])

  /** Whether a history entry's file is still present in the vault (best-effort — unknown trees are assumed valid). */
  const entryExists = useCallback((entry: NavHistoryEntry): boolean => {
    const tree = appState.vaultTrees[entry.vaultId]
    if (!tree) return true // tree for that vault not loaded — can't verify, don't block navigation
    return collectFilesSorted(tree).some((f) => f.path === entry.filePath)
  }, [appState.vaultTrees])

  /** Opens the tab for a history entry and scrolls to its anchor, if any. */
  const openEntry = useCallback((entry: NavHistoryEntry) => {
    if (!apiClient) return
    // Only suppress the next auto-record if activating this entry will actually change the
    // active tab — otherwise the effect never fires to consume the flag, which would wrongly
    // swallow the *next* genuine visit.
    if (generateTabId(entry.vaultId, entry.filePath) !== tabState.activeTabId) {
      suppressNextRef.current = true
    }
    void openTab(tabDispatch, appDispatch, apiClient, entry.vaultId, entry.filePath, entry.fileName)
    if (entry.anchor) {
      requestAnimationFrame(() => {
        document.getElementById(entry.anchor!)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [apiClient, tabDispatch, appDispatch, tabState.activeTabId])

  /**
   * Walks from the top of `stack` (the end) inward, dropping entries whose file
   * no longer exists, until it finds a valid one or exhausts the stack.
   * Requirement 1.8: skip stale entries instead of stopping navigation.
   */
  const findNextValid = useCallback((stack: NavHistoryEntry[]): { target: NavHistoryEntry; dropped: NavHistoryEntry[] } | null => {
    const dropped: NavHistoryEntry[] = []
    for (let i = stack.length - 1; i >= 0; i--) {
      const candidate = stack[i]!
      if (entryExists(candidate)) return { target: candidate, dropped }
      dropped.push(candidate)
    }
    return null
  }, [entryExists])

  const goBack = useCallback(() => {
    if (state.back.length === 0) return
    const result = findNextValid(state.back)
    // Drop every stale entry encountered along the way (order doesn't matter for DROP_ENTRY).
    const staleEntries = result ? result.dropped : state.back
    for (const stale of staleEntries) {
      dispatch({ type: 'DROP_ENTRY', vaultId: stale.vaultId, filePath: stale.filePath })
    }
    if (staleEntries.length > 0) {
      const last = staleEntries[staleEntries.length - 1]!
      showToast('error', `Datei nicht mehr vorhanden: ${last.filePath}`)
    }
    if (!result) return
    dispatch({ type: 'GO_BACK' })
    openEntry(result.target)
  }, [state.back, findNextValid, openEntry])

  const goForward = useCallback(() => {
    if (state.forward.length === 0) return
    // Forward stack is nearest-first; walk it in that order (reverse before reusing findNextValid's
    // top-of-stack-first walk, then reverse the dropped list back for correct DROP_ENTRY ordering).
    const reversed = [...state.forward].reverse()
    const result = findNextValid(reversed)
    const staleEntries = result ? result.dropped : reversed
    for (const stale of staleEntries) {
      dispatch({ type: 'DROP_ENTRY', vaultId: stale.vaultId, filePath: stale.filePath })
    }
    if (staleEntries.length > 0) {
      const last = staleEntries[staleEntries.length - 1]!
      showToast('error', `Datei nicht mehr vorhanden: ${last.filePath}`)
    }
    if (!result) return
    dispatch({ type: 'GO_FORWARD' })
    openEntry(result.target)
  }, [state.forward, findNextValid, openEntry])

  const value = useMemo<NavigationHistoryContextValue>(() => ({
    state,
    goBack,
    goForward,
    canGoBack: state.back.length > 0,
    canGoForward: state.forward.length > 0,
  }), [state, goBack, goForward])

  return React.createElement(NavigationHistoryContext.Provider, { value }, children)
}

/** Hook to access the NavigationHistoryContext. Throws if used outside NavigationHistoryProvider. */
export function useNavigationHistory(): NavigationHistoryContextValue {
  const context = useContext(NavigationHistoryContext)
  if (context === null) {
    throw new Error('useNavigationHistory must be used within a NavigationHistoryProvider')
  }
  return context
}
