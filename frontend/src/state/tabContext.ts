import { createContext, useContext, useCallback, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { tabReducer, initialTabState, type TabState, type TabAction } from './tabState'
import { PaneTreeContext } from './paneTreeContext'

/** Context value shape exposing tab state and dispatch. */
export interface TabContextValue {
  tabState: TabState
  tabDispatch: Dispatch<TabAction>
}

/** React Context for tab state management. */
export const TabContext = createContext<TabContextValue | null>(null)

/** Props for the TabProvider component. */
interface TabProviderProps {
  children: ReactNode
}

/**
 * Bridge provider for the global tab context.
 *
 * Historically this held its own `useReducer(tabReducer)`. With Split Panes the
 * authoritative tab state lives in the pane tree (`PaneTreeProvider`), one
 * `TabState` per pane. This provider now BRIDGES to that: when a
 * `PaneTreeProvider` is present above it, the global `useTabContext()` reflects
 * the ACTIVE pane and every dispatch is routed to the active pane as a
 * `PANE_TAB_ACTION`. The 8 app-global consumers of `useTabContext()`
 * (App.tsx, navigation history, command palette, file explorer, graph view,
 * plugin context) therefore keep working unchanged — they always operate on the
 * active pane, which is exactly the semantics they had when there was only one.
 *
 * When NO `PaneTreeProvider` is present (unit tests mounting `TabProvider`
 * standalone), it falls back to a local reducer — identical to the old
 * behaviour — so existing tests keep passing.
 */
export function TabProvider({ children }: TabProviderProps) {
  const paneCtx = useContext(PaneTreeContext)
  if (paneCtx) {
    return React.createElement(BridgedTabProvider, { paneCtx, children })
  }
  return React.createElement(LocalTabProvider, null, children)
}

// ─── Bridged mode: delegate to the active pane ─────────────────────────────────

function BridgedTabProvider({
  paneCtx,
  children,
}: {
  paneCtx: NonNullable<React.ContextType<typeof PaneTreeContext>>
  children: ReactNode
}) {
  const { paneTree, paneTreeDispatch, activePaneTabState } = paneCtx
  const activePaneId = paneTree.activePaneId
  const tabState = activePaneTabState ?? initialTabState

  const tabDispatch = useCallback<Dispatch<TabAction>>(
    (action) => {
      paneTreeDispatch({ type: 'PANE_TAB_ACTION', payload: { paneId: activePaneId, action } })
    },
    [paneTreeDispatch, activePaneId],
  )

  const value = useMemo<TabContextValue>(() => ({ tabState, tabDispatch }), [tabState, tabDispatch])
  return React.createElement(TabContext.Provider, { value }, children)
}

// ─── Standalone mode: own reducer (test/back-compat path) ──────────────────────

function LocalTabProvider({ children }: TabProviderProps) {
  const [tabState, tabDispatch] = useReducer(tabReducer, initialTabState)
  const value = useMemo(() => ({ tabState, tabDispatch }), [tabState, tabDispatch])
  return React.createElement(TabContext.Provider, { value }, children)
}

/**
 * Hook to access the TabContext. Throws if used outside TabProvider.
 */
export function useTabContext(): TabContextValue {
  const context = useContext(TabContext)
  if (context === null) {
    throw new Error('useTabContext must be used within a TabProvider')
  }
  return context
}
