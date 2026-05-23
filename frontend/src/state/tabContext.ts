import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { tabReducer, initialTabState, type TabState, type TabAction } from './tabState'

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
 * Provider component that wraps the content area with tab state management.
 * Uses useReducer for predictable tab state transitions.
 */
export function TabProvider({ children }: TabProviderProps) {
  const [tabState, tabDispatch] = useReducer(tabReducer, initialTabState)

  return React.createElement(
    TabContext.Provider,
    { value: { tabState, tabDispatch } },
    children,
  )
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
