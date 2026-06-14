import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { realtimeReducer, initialRealtimeState, type RealtimeState, type RealtimeAction } from './realtimeState'

/** Context value shape exposing realtime state and dispatch. */
export interface RealtimeContextValue {
  state: RealtimeState
  dispatch: Dispatch<RealtimeAction>
}

/** React Context for realtime SSE connection state management. */
export const RealtimeContext = createContext<RealtimeContextValue | null>(null)

/** Props for the RealtimeProvider component. */
interface RealtimeProviderProps {
  children: ReactNode
}

/**
 * Provider component that wraps the application with realtime SSE state management.
 * Uses useReducer for predictable realtime state transitions.
 */
export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const [state, dispatch] = useReducer(realtimeReducer, initialRealtimeState)

  return React.createElement(
    RealtimeContext.Provider,
    { value: { state, dispatch } },
    children,
  )
}

/**
 * Hook to access the RealtimeContext. Throws if used outside RealtimeProvider.
 */
export function useRealtimeContext(): RealtimeContextValue {
  const context = useContext(RealtimeContext)
  if (context === null) {
    throw new Error('useRealtimeContext must be used within a RealtimeProvider')
  }
  return context
}
