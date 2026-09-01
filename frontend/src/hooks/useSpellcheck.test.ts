import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSpellcheck } from './useSpellcheck'
import {
  _reset as resetVaultSettings,
  setActiveVault,
  updateVaultSettings,
} from '../state/vaultSettingsStore'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

describe('useSpellcheck', () => {
  beforeEach(async () => {
    resetVaultSettings()
    await setActiveVault('vault-1')
  })

  describe('initial state', () => {
    it('defaults to enabled (matches the browser default it replaced)', () => {
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.enabled).toBe(true)
    })

    it('reads the active vault’s stored value', () => {
      updateVaultSettings({ spellcheck: false })
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.enabled).toBe(false)
    })
  })

  describe('toggle', () => {
    it('toggles from enabled to disabled', () => {
      const { result } = renderHook(() => useSpellcheck())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(false)
    })

    it('toggles from disabled to enabled', () => {
      updateVaultSettings({ spellcheck: false })
      const { result } = renderHook(() => useSpellcheck())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)
    })
  })

  describe('language', () => {
    it('defaults to German, matching <html lang="de">', () => {
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.language).toBe('de')
    })

    it('reads a stored language', () => {
      updateVaultSettings({ spellcheckLanguage: 'en' })
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.language).toBe('en')
    })

    it('falls back to German for an unknown stored language', () => {
      updateVaultSettings({ spellcheckLanguage: 'kl' })
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.language).toBe('de')
    })

    it('switches the language without touching the toggle', () => {
      const { result } = renderHook(() => useSpellcheck())

      act(() => { result.current.setLanguage('en') })

      expect(result.current.language).toBe('en')
      expect(result.current.enabled).toBe(true)
    })

    it('keeps the dictionary separate per vault', async () => {
      const { result } = renderHook(() => useSpellcheck())
      act(() => { result.current.setLanguage('en') })
      expect(result.current.language).toBe('en')

      await act(async () => { await setActiveVault('vault-2') })

      expect(result.current.language).toBe('de')
    })
  })
})
