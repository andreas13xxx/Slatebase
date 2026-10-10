import { useCallback, useMemo, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { TabContext, type TabContextValue } from './tabContext'
import { initialTabState, type TabAction } from './tabState'
import { usePaneTree, type PaneTreeContextValue } from './paneTreeContext'
import { findPane } from './paneTreeState'

/**
 * Pane-local tab context provider.
 *
 * Unlike the global `TabProvider` bridge (which always targets the ACTIVE
 * pane), this supplies ONE specific pane's `tabState` and routes every dispatch
 * to THAT pane via `PANE_TAB_ACTION`. A `PaneContainer` wraps its content in
 * this so the unchanged `TabBar`/`TabContent` read `useTabContext()` and operate
 * on their own pane, not the active one.
 *
 * @module state/paneTabContext
 */

interface PaneTabProviderProps {
  paneId: string
  children: ReactNode
}

/** Provide the given pane's tab state + a dispatch scoped to that pane. */
export function PaneTabProvider({ paneId, children }: PaneTabProviderProps) {
  const { paneTree, paneTreeDispatch }: PaneTreeContextValue = usePaneTree()
  const tabState = findPane(paneTree, paneId)?.tabState ?? initialTabState

  const tabDispatch = useCallback<Dispatch<TabAction>>(
    (action) => {
      paneTreeDispatch({ type: 'PANE_TAB_ACTION', payload: { paneId, action } })
    },
    [paneTreeDispatch, paneId],
  )

  const value = useMemo<TabContextValue>(() => ({ tabState, tabDispatch }), [tabState, tabDispatch])
  return React.createElement(TabContext.Provider, { value }, children)
}
