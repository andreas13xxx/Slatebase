import { createContext, useContext, useReducer, useEffect, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { authReducer, initialAuthState, type AuthState, type AuthAction } from './authState'

/**
 * Stale keys from the pre-cookie auth design (session token + CSRF token +
 * user info in localStorage, with a sessionStorage migration path before
 * that). Cleared once on startup below — nothing reads these anymore, they'd
 * otherwise just sit there as dead weight.
 */
const STALE_STORAGE_KEYS = ['slatebase_token', 'slatebase_csrf', 'slatebase_user']

/**
 * Window-scoped in-memory holder for the current CSRF token, kept in sync by
 * AuthProvider below. This exists (rather than just closing over React state)
 * because the CSRF token must reach two consumers outside this module's own
 * import graph:
 * - `plugins/compat/sandbox.ts` imports `getCsrfToken()` directly (same JS
 *   context, ordinary import).
 * - `plugins/compat/plugin-loader.ts` interpolates `window.__slatebaseCsrfToken`
 *   as a literal string into a Blob-URL-imported plugin bundle, which runs in
 *   its own module scope with no access to this file's imports at all.
 *
 * The token is never persisted (no localStorage/sessionStorage) — only ever
 * held in memory for the lifetime of the tab.
 */
declare global {
  interface Window {
    __slatebaseCsrfToken?: string | null
  }
}

/**
 * Provider component that wraps the app with auth state management.
 *
 * The session token lives in an HttpOnly cookie the browser manages —
 * there's nothing for this provider to read or persist for it. On mount,
 * `AuthGuard` (in App.tsx, which owns the `apiClient` instance) resolves the
 * initial `isAuthenticated`/`user`/`csrfToken` state via `GET /api/v1/auth/session`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, authDispatch] = useReducer(authReducer, initialAuthState)

  // One-time cleanup of the pre-cookie storage keys — see STALE_STORAGE_KEYS.
  useEffect(() => {
    for (const key of STALE_STORAGE_KEYS) {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    }
  }, [])

  // Keep the window-global CSRF token in sync with auth state.
  useEffect(() => {
    window.__slatebaseCsrfToken = authState.csrfToken
  }, [authState.csrfToken])

  return React.createElement(
    AuthContext.Provider,
    { value: { authState, authDispatch } },
    children,
  )
}

/** Context value shape exposing auth state and dispatch. */
export interface AuthContextValue {
  authState: AuthState
  authDispatch: Dispatch<AuthAction>
}

/** React Context for auth state management. */
export const AuthContext = createContext<AuthContextValue | null>(null)

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

/**
 * Reads the current in-memory CSRF token, outside of React. The single point
 * of access for code that can't use useAuthContext() — the plugin
 * compatibility layer's `sandbox.ts`, which authenticates its own proxied
 * fetches on the plugin's behalf. See the `window.__slatebaseCsrfToken` doc
 * comment above for why this is window-scoped rather than a closure.
 */
export function getCsrfToken(): string | null {
  return window.__slatebaseCsrfToken ?? null
}
