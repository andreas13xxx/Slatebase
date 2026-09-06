/**
 * Auth state management for authentication and session handling.
 * Manages login state, user info, the in-memory CSRF token, and auth-related errors.
 */

/** User role within the system. */
export type UserRole = 'admin' | 'user'

/**
 * Public user information returned by the backend after login.
 * Matches the backend PublicUserInfo interface.
 */
export interface PublicUserInfo {
  userId: string
  username: string
  displayName: string
  email: string
  avatarUrl: string
  role: UserRole
  preferredLanguage: 'de' | 'en'
  colorScheme: 'light' | 'dark' | 'system'
  suspended: boolean
  mustChangePassword: boolean
  createdAt: string
}

/**
 * Authentication state managed via useReducer.
 *
 * The session token itself lives in an HttpOnly cookie the browser manages —
 * it never enters this state (or any JS-readable storage at all). Only the
 * CSRF token is tracked here, and only in memory (never persisted).
 */
export interface AuthState {
  isAuthenticated: boolean
  /**
   * True until the initial `GET /api/v1/auth/session` bootstrap call
   * resolves. There is no synchronous signal (like the old localStorage
   * read) for whether a session cookie exists, so the app must wait for
   * this to settle before it can render either the login page or the app.
   */
  isBootstrapping: boolean
  user: PublicUserInfo | null
  csrfToken: string | null
  mustChangePassword: boolean
  isLoading: boolean
  error: string | null
}

/** Discriminated union of all auth actions. */
export type AuthAction =
  | { type: 'LOGIN_STARTED' }
  | { type: 'LOGIN_SUCCESS'; payload: { csrfToken: string; user: PublicUserInfo } }
  | { type: 'LOGIN_FAILED'; payload: { message: string } }
  /** The startup session bootstrap confirmed there is no valid session. */
  | { type: 'BOOTSTRAP_FAILED' }
  | { type: 'LOGOUT' }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'PASSWORD_CHANGED' }
  | { type: 'PROFILE_UPDATED'; payload: { user: PublicUserInfo } }

/** Initial auth state — unauthenticated, session bootstrap not yet resolved. */
export const initialAuthState: AuthState = {
  isAuthenticated: false,
  isBootstrapping: true,
  user: null,
  csrfToken: null,
  mustChangePassword: false,
  isLoading: false,
  error: null,
}

/**
 * Pure reducer handling all auth state transitions.
 *
 * - LOGIN_STARTED: sets loading, clears error
 * - LOGIN_SUCCESS: stores user/csrfToken, sets authenticated — used both for
 *   an actual login and for a successful startup session bootstrap
 * - LOGIN_FAILED: sets error message, clears loading
 * - BOOTSTRAP_FAILED: settles into "not authenticated" with no error (this
 *   is the ordinary "not logged in yet" case, not a failure to show)
 * - LOGOUT: resets to initial state
 * - SESSION_EXPIRED: resets to initial state with session expired error
 * - PASSWORD_CHANGED: clears mustChangePassword flag
 */
export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_STARTED':
      return {
        ...state,
        isLoading: true,
        error: null,
      }

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        isBootstrapping: false,
        user: action.payload.user,
        csrfToken: action.payload.csrfToken,
        mustChangePassword: action.payload.user.mustChangePassword,
        isLoading: false,
        error: null,
      }

    case 'LOGIN_FAILED':
      return {
        ...state,
        isAuthenticated: false,
        isBootstrapping: false,
        user: null,
        csrfToken: null,
        mustChangePassword: false,
        isLoading: false,
        error: action.payload.message,
      }

    case 'BOOTSTRAP_FAILED':
      return {
        ...initialAuthState,
        isBootstrapping: false,
      }

    case 'LOGOUT':
      return { ...initialAuthState, isBootstrapping: false }

    case 'SESSION_EXPIRED':
      return {
        ...initialAuthState,
        isBootstrapping: false,
        error: 'auth.sessionExpired',
      }

    case 'PASSWORD_CHANGED':
      return {
        ...state,
        mustChangePassword: false,
        user: state.user ? { ...state.user, mustChangePassword: false } : state.user,
      }

    case 'PROFILE_UPDATED':
      return {
        ...state,
        user: action.payload.user,
      }
  }
}
