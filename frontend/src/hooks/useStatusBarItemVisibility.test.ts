import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStatusBarItemVisibility } from './useStatusBarItemVisibility'
import { _reset as resetUiSettings, updateUiSettings } from '../state/userSettingsStore'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

describe('useStatusBarItemVisibility', () => {
  beforeEach(() => {
    // localStorage is cleared in test-setup.ts beforeEach
    resetUiSettings()
  })

  it('defaults to visible for an item the user has never touched', () => {
    const { result } = renderHook(() => useStatusBarItemVisibility('clock'))
    expect(result.current.visible).toBe(true)
  })

  it('reads a stored value', () => {
    updateUiSettings({ statusBarItems: { clock: false } })
    const { result } = renderHook(() => useStatusBarItemVisibility('clock'))
    expect(result.current.visible).toBe(false)
  })

  it('toggle() flips visibility', () => {
    const { result } = renderHook(() => useStatusBarItemVisibility('clock'))

    act(() => { result.current.toggle() })
    expect(result.current.visible).toBe(false)

    act(() => { result.current.toggle() })
    expect(result.current.visible).toBe(true)
  })

  it('shares state across hook instances for the same item', () => {
    const first = renderHook(() => useStatusBarItemVisibility('clock'))
    const second = renderHook(() => useStatusBarItemVisibility('clock'))

    act(() => { first.result.current.toggle() })

    expect(second.result.current.visible).toBe(false)
  })

  it('keeps items independent of each other', () => {
    const clock = renderHook(() => useStatusBarItemVisibility('clock'))
    const vaultName = renderHook(() => useStatusBarItemVisibility('vaultName'))

    act(() => { clock.result.current.toggle() })

    expect(clock.result.current.visible).toBe(false)
    expect(vaultName.result.current.visible).toBe(true)
  })
})
