import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { authReducer, initialAuthState, type AuthState, type AuthAction } from './authState'

/** Context value shape exposing auth state and dispatch. */
export interface AuthContextValue {
  authState: AuthState
  authDispatch: Dispatch<AuthAction>
}

/** React Context for auth state management. */
export const AuthContext = createContext<AuthContextValue | null>(null)

/** Props for the AuthProvider component. */
interface AuthProviderProps {
  children: ReactNode
}

/**
 * Provider component that wraps the app with auth state management.
 * Uses useReducer for predictable auth state transitions.
 * Tokens are stored in-memory only (no localStorage).
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, authDispatch] = useReducer(authReducer, initialAuthState)

  return React.createElement(
    AuthContext.Provider,
    { value: { authState, authDispatch } },
    children,
  )
}

/**
 * Hook to access the AuthContext. Throws if used outside AuthProvider.
 */
export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }
  return context
}
