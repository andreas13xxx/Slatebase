import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStatusBarItemVisibility } from './useStatusBarItemVisibility'

describe('useStatusBarItemVisibility', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to visible when no stored preference exists', () => {
    const { result } = renderHook(() => useStatusBarItemVisibility('wordStats'))
    expect(result.current.visible).toBe(true)
  })

  it('toggle() flips visibility and persists it', () => {
    const { result } = renderHook(() => useStatusBarItemVisibility('cursorPosition'))

    act(() => {
      result.current.toggle()
    })

    expect(result.current.visible).toBe(false)
    expect(localStorage.getItem('slatebase:statusBarItem:cursorPosition')).toBe('false')
  })

  it('persists visibility across hook instances (reads localStorage)', () => {
    localStorage.setItem('slatebase:statusBarItem:vaultName', 'false')

    const { result } = renderHook(() => useStatusBarItemVisibility('vaultName'))

    expect(result.current.visible).toBe(false)
  })

  it('tracks each item independently', () => {
    const { result: wordStats } = renderHook(() => useStatusBarItemVisibility('wordStats'))
    const { result: clock } = renderHook(() => useStatusBarItemVisibility('clock'))

    act(() => {
      wordStats.current.toggle()
    })

    expect(wordStats.current.visible).toBe(false)
    expect(clock.current.visible).toBe(true)
  })
})
