import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { syncReducer, initialSyncState, type SyncState, type SyncAction } from './syncState'

/** Context value shape exposing sync state and dispatch. */
export interface SyncContextValue {
  state: SyncState
  dispatch: Dispatch<SyncAction>
}

/** React Context for sync state management. */
export const SyncContext = createContext<SyncContextValue | null>(null)

/** Props for the SyncProvider component. */
interface SyncProviderProps {
  children: ReactNode
}

/**
 * Provider component that wraps the sync area with sync state management.
 * Uses useReducer for predictable sync state transitions.
 */
export function SyncProvider({ children }: SyncProviderProps) {
  const [state, dispatch] = useReducer(syncReducer, initialSyncState)

  return React.createElement(
    SyncContext.Provider,
    { value: { state, dispatch } },
    children,
  )
}

/**
 * Hook to access the SyncContext. Throws if used outside SyncProvider.
 */
export function useSyncContext(): SyncContextValue {
  const context = useContext(SyncContext)
  if (context === null) {
    throw new Error('useSyncContext must be used within a SyncProvider')
  }
  return context
}
