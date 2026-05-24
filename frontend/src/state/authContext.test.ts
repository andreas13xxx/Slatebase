import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { AuthProvider, useAuthContext } from './authContext'
import type { PublicUserInfo } from './authState'

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

describe('useAuthContext', () => {
  it('throws when used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuthContext())
    }).toThrow('useAuthContext must be used within an AuthProvider')
  })

  it('provides initial auth state', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)

    const { result } = renderHook(() => useAuthContext(), { wrapper })

    expect(result.current.authState.isAuthenticated).toBe(false)
    expect(result.current.authState.user).toBeNull()
    expect(result.current.authState.token).toBeNull()
    expect(result.current.authState.csrfToken).toBeNull()
    expect(result.current.authState.isLoading).toBe(false)
    expect(result.current.authState.error).toBeNull()
  })

  it('dispatches LOGIN_STARTED and updates state', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)

    const { result } = renderHook(() => useAuthContext(), { wrapper })

    act(() => {
      result.current.authDispatch({ type: 'LOGIN_STARTED' })
    })

    expect(result.current.authState.isLoading).toBe(true)
  })

  it('dispatches LOGIN_SUCCESS and updates state', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)

    const { result } = renderHook(() => useAuthContext(), { wrapper })

    act(() => {
      result.current.authDispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          token: 'test-token',
          csrfToken: 'test-csrf',
          user: mockUser,
        },
      })
    })

    expect(result.current.authState.isAuthenticated).toBe(true)
    expect(result.current.authState.user).toEqual(mockUser)
    expect(result.current.authState.token).toBe('test-token')
    expect(result.current.authState.csrfToken).toBe('test-csrf')
  })

  it('dispatches LOGOUT and resets state', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)

    const { result } = renderHook(() => useAuthContext(), { wrapper })

    // First login
    act(() => {
      result.current.authDispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          token: 'test-token',
          csrfToken: 'test-csrf',
          user: mockUser,
        },
      })
    })

    // Then logout
    act(() => {
      result.current.authDispatch({ type: 'LOGOUT' })
    })

    expect(result.current.authState.isAuthenticated).toBe(false)
    expect(result.current.authState.user).toBeNull()
    expect(result.current.authState.token).toBeNull()
  })
})

describe('AuthProvider', () => {
  it('renders children', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)

    const { result } = renderHook(() => useAuthContext(), { wrapper })

    expect(result.current).toBeDefined()
    expect(result.current.authState).toBeDefined()
    expect(result.current.authDispatch).toBeDefined()
  })
})
