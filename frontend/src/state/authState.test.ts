import { describe, it, expect } from 'vitest'
import {
  authReducer,
  initialAuthState,
  type AuthState,
  type AuthAction,
  type PublicUserInfo,
} from './authState'

const mockUser: PublicUserInfo = {
  userId: 'user-123',
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  avatarUrl: '',
  role: 'user',
  preferredLanguage: 'de',
  colorScheme: 'system',
  suspended: false,
  mustChangePassword: false,
  createdAt: '2025-01-01T00:00:00.000Z',
}

const mockAdminUser: PublicUserInfo = {
  ...mockUser,
  userId: 'admin-123',
  username: 'admin',
  role: 'admin',
  mustChangePassword: true,
}

describe('authReducer', () => {
  describe('LOGIN_STARTED', () => {
    it('sets isLoading to true and clears error', () => {
      const stateWithError: AuthState = {
        ...initialAuthState,
        error: 'Previous error',
      }
      const action: AuthAction = { type: 'LOGIN_STARTED' }

      const result = authReducer(stateWithError, action)

      expect(result.isLoading).toBe(true)
      expect(result.error).toBeNull()
    })
  })

  describe('LOGIN_SUCCESS', () => {
    it('stores user, token, csrfToken and sets authenticated', () => {
      const loadingState: AuthState = { ...initialAuthState, isLoading: true }
      const action: AuthAction = {
        type: 'LOGIN_SUCCESS',
        payload: {
          token: 'session-token-abc',
          csrfToken: 'csrf-token-xyz',
          user: mockUser,
        },
      }

      const result = authReducer(loadingState, action)

      expect(result.isAuthenticated).toBe(true)
      expect(result.user).toEqual(mockUser)
      expect(result.token).toBe('session-token-abc')
      expect(result.csrfToken).toBe('csrf-token-xyz')
      expect(result.mustChangePassword).toBe(false)
      expect(result.isLoading).toBe(false)
      expect(result.error).toBeNull()
    })

    it('sets mustChangePassword from user data', () => {
      const action: AuthAction = {
        type: 'LOGIN_SUCCESS',
        payload: {
          token: 'token',
          csrfToken: 'csrf',
          user: mockAdminUser,
        },
      }

      const result = authReducer(initialAuthState, action)

      expect(result.mustChangePassword).toBe(true)
    })
  })

  describe('LOGIN_FAILED', () => {
    it('sets error and clears auth state', () => {
      const loadingState: AuthState = { ...initialAuthState, isLoading: true }
      const action: AuthAction = {
        type: 'LOGIN_FAILED',
        payload: { message: 'Ungültige Anmeldedaten' },
      }

      const result = authReducer(loadingState, action)

      expect(result.isAuthenticated).toBe(false)
      expect(result.user).toBeNull()
      expect(result.token).toBeNull()
      expect(result.csrfToken).toBeNull()
      expect(result.mustChangePassword).toBe(false)
      expect(result.isLoading).toBe(false)
      expect(result.error).toBe('Ungültige Anmeldedaten')
    })
  })

  describe('LOGOUT', () => {
    it('resets to initial state', () => {
      const authenticatedState: AuthState = {
        isAuthenticated: true,
        user: mockUser,
        token: 'some-token',
        csrfToken: 'some-csrf',
        mustChangePassword: false,
        isLoading: false,
        error: null,
      }
      const action: AuthAction = { type: 'LOGOUT' }

      const result = authReducer(authenticatedState, action)

      expect(result).toEqual(initialAuthState)
    })
  })

  describe('SESSION_EXPIRED', () => {
    it('resets to initial state with error message', () => {
      const authenticatedState: AuthState = {
        isAuthenticated: true,
        user: mockUser,
        token: 'some-token',
        csrfToken: 'some-csrf',
        mustChangePassword: false,
        isLoading: false,
        error: null,
      }
      const action: AuthAction = { type: 'SESSION_EXPIRED' }

      const result = authReducer(authenticatedState, action)

      expect(result.isAuthenticated).toBe(false)
      expect(result.user).toBeNull()
      expect(result.token).toBeNull()
      expect(result.csrfToken).toBeNull()
      expect(result.error).toBe('auth.sessionExpired')
    })
  })

  describe('PASSWORD_CHANGED', () => {
    it('clears mustChangePassword flag', () => {
      const mustChangeState: AuthState = {
        isAuthenticated: true,
        user: mockAdminUser,
        token: 'token',
        csrfToken: 'csrf',
        mustChangePassword: true,
        isLoading: false,
        error: null,
      }
      const action: AuthAction = { type: 'PASSWORD_CHANGED' }

      const result = authReducer(mustChangeState, action)

      expect(result.mustChangePassword).toBe(false)
      expect(result.isAuthenticated).toBe(true)
      expect(result.user).toEqual(mockAdminUser)
    })
  })
})

describe('initialAuthState', () => {
  it('starts unauthenticated with no user data', () => {
    expect(initialAuthState.isAuthenticated).toBe(false)
    expect(initialAuthState.user).toBeNull()
    expect(initialAuthState.token).toBeNull()
    expect(initialAuthState.csrfToken).toBeNull()
    expect(initialAuthState.mustChangePassword).toBe(false)
    expect(initialAuthState.isLoading).toBe(false)
    expect(initialAuthState.error).toBeNull()
  })
})
