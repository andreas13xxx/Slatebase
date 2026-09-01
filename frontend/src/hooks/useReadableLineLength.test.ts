import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useReadableLineLength } from './useReadableLineLength'
import {
  _reset as resetVaultSettings,
  setActiveVault,
  updateVaultSettings,
} from '../state/vaultSettingsStore'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

describe('useReadableLineLength', () => {
  beforeEach(async () => {
    resetVaultSettings()
    await setActiveVault('vault-1')
  })

  describe('initial state', () => {
    it('defaults to enabled', () => {
      const { result } = renderHook(() => useReadableLineLength())
      expect(result.current.enabled).toBe(true)
    })

    it('reads the active vault’s stored value', () => {
      updateVaultSettings({ readableLineLength: false })
      const { result } = renderHook(() => useReadableLineLength())
      expect(result.current.enabled).toBe(false)
    })
  })

  describe('toggle', () => {
    it('toggles from enabled to disabled', () => {
      const { result } = renderHook(() => useReadableLineLength())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(false)
    })

    it('toggles from disabled to enabled', () => {
      updateVaultSettings({ readableLineLength: false })
      const { result } = renderHook(() => useReadableLineLength())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)
    })

    it('shares state across hook instances', () => {
      const first = renderHook(() => useReadableLineLength())
      const second = renderHook(() => useReadableLineLength())

      act(() => { first.result.current.toggle() })

      expect(second.result.current.enabled).toBe(false)
    })
  })

  it('keeps the setting separate per vault', async () => {
    const { result } = renderHook(() => useReadableLineLength())
    act(() => { result.current.toggle() })
    expect(result.current.enabled).toBe(false)

    await act(async () => { await setActiveVault('vault-2') })

    expect(result.current.enabled).toBe(true)
  })
})
