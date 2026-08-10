import { describe, it, expect, vi } from 'vitest'
import { SettingsManager, wasRecentSettingsWrite, type ISettingsApiClient } from './settings-manager'

function makeApiClient(overrides: Partial<ISettingsApiClient> = {}): ISettingsApiClient {
  return {
    loadSettings: vi.fn().mockResolvedValue(null),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('SettingsManager', () => {
  describe('loadData', () => {
    it('returns the parsed settings object', async () => {
      const apiClient = makeApiClient({ loadSettings: vi.fn().mockResolvedValue('{"foo":"bar"}') })
      const manager = new SettingsManager(apiClient, 'vault-1')

      expect(await manager.loadData('plugin-a')).toEqual({ foo: 'bar' })
    })

    it('returns null on the first call (no settings yet)', async () => {
      const apiClient = makeApiClient()
      const manager = new SettingsManager(apiClient, 'vault-1')

      expect(await manager.loadData('plugin-a')).toBeNull()
    })

    it('returns null and does not throw on invalid JSON', async () => {
      const apiClient = makeApiClient({ loadSettings: vi.fn().mockResolvedValue('not json') })
      const manager = new SettingsManager(apiClient, 'vault-1')

      expect(await manager.loadData('plugin-a')).toBeNull()
    })

    it('returns null when loadSettings is unavailable on the api client', async () => {
      const manager = new SettingsManager({}, 'vault-1')

      expect(await manager.loadData('plugin-a')).toBeNull()
    })
  })

  describe('saveData', () => {
    it('persists JSON-serialized data via the api client', async () => {
      const apiClient = makeApiClient()
      const manager = new SettingsManager(apiClient, 'vault-1')

      await manager.saveData('plugin-a', { foo: 'bar' })

      expect(apiClient.saveSettings).toHaveBeenCalledWith('vault-1', 'plugin-a', '{"foo":"bar"}')
    })

    it('rejects circular data instead of hanging or crashing the caller', async () => {
      const apiClient = makeApiClient()
      const manager = new SettingsManager(apiClient, 'vault-1')
      const circular: Record<string, unknown> = {}
      circular.self = circular

      await expect(manager.saveData('plugin-a', circular)).rejects.toThrow()
      expect(apiClient.saveSettings).not.toHaveBeenCalled()
    })

    it('rejects data over 1 MB', async () => {
      const apiClient = makeApiClient()
      const manager = new SettingsManager(apiClient, 'vault-1')

      await expect(manager.saveData('plugin-a', { big: 'x'.repeat(2 * 1024 * 1024) })).rejects.toThrow(/1 MB/)
      expect(apiClient.saveSettings).not.toHaveBeenCalled()
    })
  })

  describe('wasRecentSettingsWrite (loop prevention for onExternalSettingsChange)', () => {
    it('is true immediately after saveData() for that vault+plugin', async () => {
      const apiClient = makeApiClient()
      const manager = new SettingsManager(apiClient, 'vault-loop-1')

      await manager.saveData('plugin-a', { x: 1 })

      expect(wasRecentSettingsWrite('vault-loop-1', 'plugin-a')).toBe(true)
    })

    it('is false for a vault/plugin combination that was never written', () => {
      expect(wasRecentSettingsWrite('vault-loop-never', 'plugin-never')).toBe(false)
    })

    it('does not mark the write when saveData() rejects before ever calling the api client', async () => {
      const apiClient = makeApiClient()
      const manager = new SettingsManager(apiClient, 'vault-loop-2')
      const circular: Record<string, unknown> = {}
      circular.self = circular

      await expect(manager.saveData('plugin-b', circular)).rejects.toThrow()

      expect(wasRecentSettingsWrite('vault-loop-2', 'plugin-b')).toBe(false)
    })

    it('distinguishes between plugins in the same vault', async () => {
      const apiClient = makeApiClient()
      const manager = new SettingsManager(apiClient, 'vault-loop-3')

      await manager.saveData('plugin-c', { x: 1 })

      expect(wasRecentSettingsWrite('vault-loop-3', 'plugin-c')).toBe(true)
      expect(wasRecentSettingsWrite('vault-loop-3', 'plugin-d')).toBe(false)
    })
  })
})
