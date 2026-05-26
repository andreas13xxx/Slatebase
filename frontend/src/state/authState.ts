/**
 * Auth state management for authentication and session handling.
 * Manages login state, user info, tokens, and auth-related errors.
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

/** Authentication state managed via useReducer. */
export interface AuthState {
  isAuthenticated: boolean
  user: PublicUserInfo | null
  token: string | null
  csrfToken: string | null
  mustChangePassword: boolean
  isLoading: boolean
  error: string | null
}

/** Discriminated union of all auth actions. */
export type AuthAction =
  | { type: 'LOGIN_STARTED' }
  | { type: 'LOGIN_SUCCESS'; payload: { token: string; csrfToken: string; user: PublicUserInfo } }
  | { type: 'LOGIN_FAILED'; payload: { message: string } }
  | { type: 'LOGOUT' }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'PASSWORD_CHANGED' }
  | { type: 'PROFILE_UPDATED'; payload: { user: PublicUserInfo } }

/** Initial auth state — unauthenticated with no user data. */
export const initialAuthState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  csrfToken: null,
  mustChangePassword: false,
  isLoading: false,
  error: null,
}

/**
 * Pure reducer handling all auth state transitions.
 *
 * - LOGIN_STARTED: sets loading, clears error
 * - LOGIN_SUCCESS: stores user/token/csrfToken, sets authenticated, clears loading
 * - LOGIN_FAILED: sets error message, clears loading
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
        user: action.payload.user,
        token: action.payload.token,
        csrfToken: action.payload.csrfToken,
        mustChangePassword: action.payload.user.mustChangePassword,
        isLoading: false,
        error: null,
      }

    case 'LOGIN_FAILED':
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        csrfToken: null,
        mustChangePassword: false,
        isLoading: false,
        error: action.payload.message,
      }

    case 'LOGOUT':
      return { ...initialAuthState }

    case 'SESSION_EXPIRED':
      return {
        ...initialAuthState,
        error: 'auth.sessionExpired',
      }

    case 'PASSWORD_CHANGED':
      return {
        ...state,
        mustChangePassword: false,
      }

    case 'PROFILE_UPDATED':
      return {
        ...state,
        user: action.payload.user,
      }
  }
}
