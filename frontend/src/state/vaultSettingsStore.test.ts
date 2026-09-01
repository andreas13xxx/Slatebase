import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IApiClient, UserVaultSettings } from '../api'
import {
  initialize,
  setActiveVault,
  getVaultSettings,
  updateVaultSettings,
  refreshFromServer,
  DEFAULT_VAULT_SETTINGS,
  _reset,
} from './vaultSettingsStore'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

/** Server stub holding one settings object per vault, merging patches. */
function createMockApiClient(seed: Record<string, Partial<UserVaultSettings>> = {}) {
  const store = new Map<string, UserVaultSettings>()
  for (const [vaultId, values] of Object.entries(seed)) {
    store.set(vaultId, { ...structuredClone(DEFAULT_VAULT_SETTINGS), ...values })
  }

  return {
    getVaultSettings: vi.fn(async (vaultId: string) => ({
      settings: structuredClone(store.get(vaultId) ?? DEFAULT_VAULT_SETTINGS),
    })),
    saveVaultSettings: vi.fn(async (vaultId: string, patch: Partial<UserVaultSettings>) => {
      const next = { ...(store.get(vaultId) ?? structuredClone(DEFAULT_VAULT_SETTINGS)), ...patch }
      store.set(vaultId, next)
      return { settings: structuredClone(next) }
    }),
    _stored: (vaultId: string) => store.get(vaultId),
  } as unknown as IApiClient & {
    getVaultSettings: ReturnType<typeof vi.fn>
    saveVaultSettings: ReturnType<typeof vi.fn>
    _stored: (vaultId: string) => UserVaultSettings | undefined
  }
}

describe('vaultSettingsStore', () => {
  beforeEach(() => {
    _reset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('scoping', () => {
    it('starts from the shipped defaults', async () => {
      await setActiveVault('vault-1')
      expect(getVaultSettings()).toEqual(DEFAULT_VAULT_SETTINGS)
    })

    it('keeps settings separate per vault', async () => {
      const client = createMockApiClient()
      initialize(client)

      await setActiveVault('vault-1')
      updateVaultSettings({ lineNumbers: true })
      expect(getVaultSettings().lineNumbers).toBe(true)

      await setActiveVault('vault-2')
      expect(getVaultSettings().lineNumbers).toBe(false)
    })

    it('loads the server copy when switching to a vault', async () => {
      const client = createMockApiClient({ 'vault-2': { zoom: 1.5 } })
      initialize(client)

      await setActiveVault('vault-2')

      expect(getVaultSettings().zoom).toBe(1.5)
    })

    it('ignores writes while no vault is active', () => {
      updateVaultSettings({ lineNumbers: true })
      expect(getVaultSettings().lineNumbers).toBe(false)
    })

    it('falls back to defaults when the vault is deselected', async () => {
      const client = createMockApiClient({ 'vault-1': { lineNumbers: true } })
      initialize(client)
      await setActiveVault('vault-1')
      expect(getVaultSettings().lineNumbers).toBe(true)

      await setActiveVault(null)

      expect(getVaultSettings()).toEqual(DEFAULT_VAULT_SETTINGS)
    })
  })

  describe('server sync', () => {
    it('sends only the changed fields, for the right vault', async () => {
      const client = createMockApiClient()
      initialize(client)
      await setActiveVault('vault-1')

      vi.useFakeTimers()
      try {
        updateVaultSettings({ lineNumbers: true })
        await vi.advanceTimersByTimeAsync(800)
      } finally {
        vi.useRealTimers()
      }

      expect(client.saveVaultSettings).toHaveBeenCalledWith('vault-1', { lineNumbers: true })
    })

    it('flushes a change made just before switching vaults', async () => {
      const client = createMockApiClient()
      initialize(client)
      await setActiveVault('vault-1')

      vi.useFakeTimers()
      try {
        updateVaultSettings({ lineNumbers: true })
        // Switch away before the debounce elapses — the queued patch belongs to
        // vault-1 and must still reach the server.
        const switched = setActiveVault('vault-2')
        await vi.advanceTimersByTimeAsync(800)
        await switched
      } finally {
        vi.useRealTimers()
      }

      expect(client.saveVaultSettings).toHaveBeenCalledWith('vault-1', { lineNumbers: true })
      expect(client._stored('vault-1')?.lineNumbers).toBe(true)
    })

    it('coalesces rapid changes into one request', async () => {
      const client = createMockApiClient()
      initialize(client)
      await setActiveVault('vault-1')

      vi.useFakeTimers()
      try {
        updateVaultSettings({ lineNumbers: true })
        updateVaultSettings({ spellcheck: false })
        await vi.advanceTimersByTimeAsync(800)
      } finally {
        vi.useRealTimers()
      }

      expect(client.saveVaultSettings).toHaveBeenCalledTimes(1)
      expect(client.saveVaultSettings).toHaveBeenCalledWith('vault-1', {
        lineNumbers: true,
        spellcheck: false,
      })
    })
  })

  describe('refreshFromServer', () => {
    it('adopts what another device changed for the active vault', async () => {
      const client = createMockApiClient()
      initialize(client)
      await setActiveVault('vault-1')

      client.getVaultSettings.mockResolvedValueOnce({
        settings: { ...structuredClone(DEFAULT_VAULT_SETTINGS), lineNumbers: true },
      })
      await refreshFromServer('vault-1')

      expect(getVaultSettings().lineNumbers).toBe(true)
    })

    it('ignores a refresh for a vault that is no longer active', async () => {
      const client = createMockApiClient()
      initialize(client)
      await setActiveVault('vault-1')

      await refreshFromServer('vault-2')

      expect(client.getVaultSettings).not.toHaveBeenCalledWith('vault-2')
    })
  })

  describe('resilience', () => {
    it('keeps the cached values when the server is unreachable', async () => {
      const client = {
        getVaultSettings: vi.fn().mockRejectedValue(new Error('offline')),
        saveVaultSettings: vi.fn(),
      } as unknown as IApiClient
      initialize(client)

      await setActiveVault('vault-1')

      expect(getVaultSettings()).toEqual(DEFAULT_VAULT_SETTINGS)
    })
  })
})
