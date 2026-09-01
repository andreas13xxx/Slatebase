import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLineNumbers } from './useLineNumbers'
import {
  _reset as resetVaultSettings,
  setActiveVault,
  updateVaultSettings,
} from '../state/vaultSettingsStore'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

describe('useLineNumbers', () => {
  beforeEach(async () => {
    // localStorage is cleared in test-setup.ts beforeEach
    resetVaultSettings()
    // No API client is connected, so this only sets the active vault and reads
    // the (empty) local cache — enough to exercise the store's semantics.
    await setActiveVault('vault-1')
  })

  describe('initial state', () => {
    it('defaults to disabled', () => {
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(false)
    })

    it('reads the active vault’s stored value', () => {
      updateVaultSettings({ lineNumbers: true })
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(true)
    })
  })

  describe('toggle', () => {
    it('toggles from disabled to enabled', () => {
      const { result } = renderHook(() => useLineNumbers())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)
    })

    it('toggles from enabled to disabled', () => {
      updateVaultSettings({ lineNumbers: true })
      const { result } = renderHook(() => useLineNumbers())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(false)
    })

    it('toggles multiple times correctly', () => {
      const { result } = renderHook(() => useLineNumbers())

      act(() => { result.current.toggle() })
      act(() => { result.current.toggle() })
      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)
    })

    it('shares state across hook instances', () => {
      const first = renderHook(() => useLineNumbers())
      const second = renderHook(() => useLineNumbers())

      act(() => { first.result.current.toggle() })

      expect(second.result.current.enabled).toBe(true)
    })
  })

  describe('vault scoping', () => {
    it('keeps the setting separate per vault', async () => {
      const { result } = renderHook(() => useLineNumbers())
      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)

      await act(async () => { await setActiveVault('vault-2') })

      expect(result.current.enabled).toBe(false)
    })

    it('does nothing when no vault is active', async () => {
      await act(async () => { await setActiveVault(null) })
      const { result } = renderHook(() => useLineNumbers())

      act(() => { result.current.toggle() })

      expect(result.current.enabled).toBe(false)
    })
  })
})
