import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import {
  paneTreeReducer,
  createInitialPaneTree,
  getActivePaneTabState,
  getActiveTabId,
  type PaneTree,
  type PaneTreeAction,
} from './paneTreeState'
import type { TabState } from './tabState'

/** Context value exposing the pane tree, its dispatch, and derived active state. */
export interface PaneTreeContextValue {
  paneTree: PaneTree
  paneTreeDispatch: Dispatch<PaneTreeAction>
  /** The active pane's tab state (null if the active id does not resolve). */
  activePaneTabState: TabState | null
  /** The derived global active tab id (active pane's active tab). */
  activeTabId: string | null
}

/** React Context for the pane-tree layout. */
export const PaneTreeContext = createContext<PaneTreeContextValue | null>(null)

interface PaneTreeProviderProps {
  children: ReactNode
  /** Initial active pane id (stable, caller-provided). */
  initialPaneId?: string
}

/** Deterministic default id for the first pane. */
const DEFAULT_PANE_ID = 'pane-root'

/**
 * Provider for the pane-tree layout. Starts as a single pane whose tab state is
 * the familiar empty `TabState`, so a fresh vault behaves exactly like today's
 * single tab row until a split is created.
 */
export function PaneTreeProvider({ children, initialPaneId = DEFAULT_PANE_ID }: PaneTreeProviderProps) {
  const [paneTree, paneTreeDispatch] = useReducer(
    paneTreeReducer,
    initialPaneId,
    createInitialPaneTree,
  )

  const value = useMemo<PaneTreeContextValue>(
    () => ({
      paneTree,
      paneTreeDispatch,
      activePaneTabState: getActivePaneTabState(paneTree),
      activeTabId: getActiveTabId(paneTree),
    }),
    [paneTree, paneTreeDispatch],
  )

  return React.createElement(PaneTreeContext.Provider, { value }, children)
}

/** Hook to access the PaneTreeContext. Throws if used outside PaneTreeProvider. */
export function usePaneTree(): PaneTreeContextValue {
  const context = useContext(PaneTreeContext)
  if (context === null) {
    throw new Error('usePaneTree must be used within a PaneTreeProvider')
  }
  return context
}
