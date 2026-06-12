import { createContext, useContext, useReducer, useEffect, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { authReducer, initialAuthState, type AuthState, type AuthAction, type PublicUserInfo } from './authState'

/** Storage keys for persisting auth tokens and user info. */
const STORAGE_KEY_TOKEN = 'slatebase_token'
const STORAGE_KEY_CSRF = 'slatebase_csrf'
const STORAGE_KEY_USER = 'slatebase_user'

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
 * Attempts to read auth state from a given Storage instance.
 * Returns the restored AuthState if all keys are present and valid, or null otherwise.
 */
function readFromStorage(storage: Storage): AuthState | null {
  const token = storage.getItem(STORAGE_KEY_TOKEN)
  const csrfToken = storage.getItem(STORAGE_KEY_CSRF)
  const userJson = storage.getItem(STORAGE_KEY_USER)

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
  return null
}

/**
 * Reads persisted session from localStorage (primary) or sessionStorage (migration).
 * Migration path: if sessionStorage has keys but localStorage doesn't, copies to
 * localStorage and clears sessionStorage.
 * Returns the initial auth state — either restored or default.
 */
function getRestoredState(): AuthState {
  try {
    // 1. Try localStorage first (new primary storage)
    const fromLocal = readFromStorage(localStorage)
    if (fromLocal) {
      return fromLocal
    }

    // 2. If not found, try sessionStorage (migration from old format)
    const fromSession = readFromStorage(sessionStorage)
    if (fromSession) {
      // Migrate: copy to localStorage and clear sessionStorage
      localStorage.setItem(STORAGE_KEY_TOKEN, sessionStorage.getItem(STORAGE_KEY_TOKEN)!)
      localStorage.setItem(STORAGE_KEY_CSRF, sessionStorage.getItem(STORAGE_KEY_CSRF)!)
      localStorage.setItem(STORAGE_KEY_USER, sessionStorage.getItem(STORAGE_KEY_USER)!)
      sessionStorage.removeItem(STORAGE_KEY_TOKEN)
      sessionStorage.removeItem(STORAGE_KEY_CSRF)
      sessionStorage.removeItem(STORAGE_KEY_USER)
      return fromSession
    }
  } catch {
    // Corrupted storage — clean up both and start fresh
    localStorage.removeItem(STORAGE_KEY_TOKEN)
    localStorage.removeItem(STORAGE_KEY_CSRF)
    localStorage.removeItem(STORAGE_KEY_USER)
    sessionStorage.removeItem(STORAGE_KEY_TOKEN)
    sessionStorage.removeItem(STORAGE_KEY_CSRF)
    sessionStorage.removeItem(STORAGE_KEY_USER)
  }

  // 3. Neither found — return default initial state
  return initialAuthState
}

/**
 * Persists or clears auth data in localStorage based on auth state changes.
 * On logout/session-expired: clears both localStorage and sessionStorage (belt-and-suspenders).
 */
function syncStorage(state: AuthState): void {
  if (state.isAuthenticated && state.token && state.csrfToken && state.user) {
    localStorage.setItem(STORAGE_KEY_TOKEN, state.token)
    localStorage.setItem(STORAGE_KEY_CSRF, state.csrfToken)
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(state.user))
  } else {
    // Clear both storages on logout/session-expired
    localStorage.removeItem(STORAGE_KEY_TOKEN)
    localStorage.removeItem(STORAGE_KEY_CSRF)
    localStorage.removeItem(STORAGE_KEY_USER)
    sessionStorage.removeItem(STORAGE_KEY_TOKEN)
    sessionStorage.removeItem(STORAGE_KEY_CSRF)
    sessionStorage.removeItem(STORAGE_KEY_USER)
  }
}

/**
 * Provider component that wraps the app with auth state management.
 * Uses useReducer for predictable auth state transitions.
 * Tokens are persisted in localStorage (survives page reload AND tab close).
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, authDispatch] = useReducer(authReducer, undefined, getRestoredState)

  // Sync to localStorage whenever auth state changes
  useEffect(() => {
    syncStorage(authState)
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
