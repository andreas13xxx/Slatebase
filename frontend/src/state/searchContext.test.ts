import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { SearchProvider, useSearchContext } from './searchContext'

describe('SearchProvider', () => {
  it('provides initial search state and dispatch', () => {
    const { result } = renderHook(() => useSearchContext(), {
      wrapper: ({ children }) => React.createElement(SearchProvider, null, children),
    })

    expect(result.current.state.query).toBe('')
    expect(result.current.state.replacement).toBe('')
    expect(result.current.state.caseSensitive).toBe(false)
    expect(result.current.state.regex).toBe(false)
    expect(result.current.state.scope).toBe('single')
    expect(result.current.state.results).toBeNull()
    expect(result.current.state.loading).toBe(false)
    expect(result.current.state.error).toBeNull()
    expect(typeof result.current.dispatch).toBe('function')
  })

  it('dispatches SET_QUERY and updates state', () => {
    const { result } = renderHook(() => useSearchContext(), {
      wrapper: ({ children }) => React.createElement(SearchProvider, null, children),
    })

    act(() => {
      result.current.dispatch({ type: 'SET_QUERY', payload: 'hello' })
    })

    expect(result.current.state.query).toBe('hello')
  })
})

describe('useSearchContext', () => {
  it('throws when used outside SearchProvider', () => {
    expect(() => {
      renderHook(() => useSearchContext())
    }).toThrow('useSearchContext must be used within a SearchProvider')
  })
})
