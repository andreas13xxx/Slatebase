import { createContext, useContext, useReducer, useEffect, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { authReducer, initialAuthState, type AuthState, type AuthAction, type PublicUserInfo } from './authState'

/** SessionStorage keys for persisting auth across page reloads. */
const SESSION_KEY_TOKEN = 'slatebase_token'
const SESSION_KEY_CSRF = 'slatebase_csrf'
const SESSION_KEY_USER = 'slatebase_user'

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
 * Reads persisted session from sessionStorage.
 * Returns the initial auth state — either restored or default.
 */
function getRestoredState(): AuthState {
  try {
    const token = sessionStorage.getItem(SESSION_KEY_TOKEN)
    const csrfToken = sessionStorage.getItem(SESSION_KEY_CSRF)
    const userJson = sessionStorage.getItem(SESSION_KEY_USER)

    if (token && csrfToken && userJson) {
      const user: PublicUserInfo = JSON.parse(userJson)
      return {
        isAuthenticated: true,
        user,
        token,
        csrfToken,
        mustChangePassword: user.mustChangePassword,
        isLoading: false,
        error: null,
      }
    }
  } catch {
    // Corrupted sessionStorage — ignore and start fresh
    sessionStorage.removeItem(SESSION_KEY_TOKEN)
    sessionStorage.removeItem(SESSION_KEY_CSRF)
    sessionStorage.removeItem(SESSION_KEY_USER)
  }
  return initialAuthState
}

/**
 * Persists or clears session data in sessionStorage based on auth state changes.
 */
function syncSessionStorage(state: AuthState): void {
  if (state.isAuthenticated && state.token && state.csrfToken && state.user) {
    sessionStorage.setItem(SESSION_KEY_TOKEN, state.token)
    sessionStorage.setItem(SESSION_KEY_CSRF, state.csrfToken)
    sessionStorage.setItem(SESSION_KEY_USER, JSON.stringify(state.user))
  } else {
    sessionStorage.removeItem(SESSION_KEY_TOKEN)
    sessionStorage.removeItem(SESSION_KEY_CSRF)
    sessionStorage.removeItem(SESSION_KEY_USER)
  }
}

/**
 * Provider component that wraps the app with auth state management.
 * Uses useReducer for predictable auth state transitions.
 * Tokens are persisted in sessionStorage (survives page reload, cleared on tab close).
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, authDispatch] = useReducer(authReducer, undefined, getRestoredState)

  // Sync to sessionStorage whenever auth state changes
  useEffect(() => {
    syncSessionStorage(authState)
  }, [authState])

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
