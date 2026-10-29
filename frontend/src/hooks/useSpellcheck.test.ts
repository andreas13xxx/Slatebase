import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSpellcheck } from './useSpellcheck'
import {
  _reset as resetVaultSettings,
  setActiveVault,
  updateVaultSettings,
} from '../state/vaultSettingsStore'
import {
  _reset as resetAppConfig,
  initialize as initializeAppConfig,
  setActiveVault as setActiveAppConfigVault,
} from '../state/vaultAppConfigStore'
import type { IApiClient } from '../api'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

describe('useSpellcheck', () => {
  /** Whether it runs is a vault setting (`spellcheck` in app.json); the dictionary stays personal. */
  let appJson: Record<string, unknown>

  beforeEach(async () => {
    resetVaultSettings()
    resetAppConfig()
    appJson = {}
    initializeAppConfig({
      getAppConfig: vi.fn(async () => ({ ...appJson })),
      patchAppConfig: vi.fn(async (_vaultId: string, patch: Record<string, unknown>) => {
        appJson = { ...appJson, ...patch }
        return { ...appJson }
      }),
    } as unknown as IApiClient)
    await setActiveVault('vault-1')
    await setActiveAppConfigVault('vault-1')
  })

  describe('initial state', () => {
    it('defaults to enabled (matches the browser default it replaced)', () => {
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.enabled).toBe(true)
    })

    it('reads spellcheck from the vault’s app.json', async () => {
      appJson = { spellcheck: false }
      await setActiveAppConfigVault(null)
      await setActiveAppConfigVault('vault-1')
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.enabled).toBe(false)
    })
  })

  describe('toggle', () => {
    it('toggles from enabled to disabled and writes app.json', async () => {
      const { result } = renderHook(() => useSpellcheck())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(false)
      await waitFor(() => expect(appJson).toEqual({ spellcheck: false }))
    })

    it('toggles from disabled to enabled', async () => {
      appJson = { spellcheck: false }
      await setActiveAppConfigVault(null)
      await setActiveAppConfigVault('vault-1')
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
