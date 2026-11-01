import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  _reset,
  getAppearanceRaw,
  getAppearanceValue,
  initialize,
  refreshAppearance,
  setActiveVault,
  updateAppearance,
} from './vaultAppearanceStore'
import type { IApiClient } from '../api'

function createClient(files: Record<string, Record<string, unknown>> = {}) {
  return {
    files,
    getAppearanceConfig: vi.fn(async (vaultId: string) => ({ ...(files[vaultId] ?? {}) })),
    patchAppearanceConfig: vi.fn(async (vaultId: string, patch: Record<string, unknown>) => {
      const next = { ...(files[vaultId] ?? {}) }
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete next[key]
        else next[key] = value
      }
      files[vaultId] = next
      return next
    }),
  }
}

describe('vaultAppearanceStore', () => {
  beforeEach(() => _reset())
  const connect = (client: ReturnType<typeof createClient>) => initialize(client as unknown as IApiClient)

  it('serves the defaults before a vault is active and for keys the file lacks', async () => {
    expect(getAppearanceValue('baseFontSize')).toBe(16)
    connect(createClient({ v1: { accentColor: '#ff0000', cssTheme: 'Minimal' } }))
    await setActiveVault('v1')
    expect(getAppearanceValue('accentColor')).toBe('#ff0000')
    expect(getAppearanceValue('theme')).toBe('system')
    expect(getAppearanceRaw('cssTheme')).toBe('Minimal')
  })

  it('ignores a value of the wrong type, uses the default, and warns once about it and about unknown keys', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    connect(createClient({ v1: { baseFontSize: 'big', fancy: 1, cssTheme: 'x' } }))
    await setActiveVault('v1')
    await refreshAppearance('v1')

    expect(getAppearanceValue('baseFontSize')).toBe(16)
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('[appearance.json] baseFontSize: expected a number'),
      expect.stringContaining('[appearance.json] fancy: unknown key'),
    ])
    warn.mockRestore()
  })

  it('changes at once, saves, and removes a key on null', async () => {
    const client = createClient({ v1: {} })
    connect(client)
    await setActiveVault('v1')

    const saving = updateAppearance({ baseFontSize: 20, accentColor: '#00ff00' })
    expect(getAppearanceValue('baseFontSize')).toBe(20)
    await saving
    expect(client.patchAppearanceConfig).toHaveBeenCalledWith('v1', { baseFontSize: 20, accentColor: '#00ff00' })

    await updateAppearance({ accentColor: null })
    expect(getAppearanceValue('accentColor')).toBe('')
    expect(client.files['v1']).toEqual({ baseFontSize: 20 })
  })

  it('puts the old value back and rejects when the write is refused', async () => {
    const client = createClient({ v1: { baseFontSize: 18 } })
    client.patchAppearanceConfig.mockRejectedValue(new Error('forbidden'))
    connect(client)
    await setActiveVault('v1')

    await expect(updateAppearance({ baseFontSize: 24 })).rejects.toThrow('forbidden')
    expect(getAppearanceValue('baseFontSize')).toBe(18)
  })

  it('does not let a slow answer for an earlier vault win', async () => {
    let releaseV1: (fields: Record<string, unknown>) => void = () => {}
    const client = createClient({ v2: { baseFontSize: 22 } })
    client.getAppearanceConfig.mockImplementation((vaultId: string) =>
      vaultId === 'v1' ? new Promise((resolve) => { releaseV1 = resolve }) : Promise.resolve({ ...(client.files[vaultId] ?? {}) }))
    connect(client)

    const first = setActiveVault('v1')
    await setActiveVault('v2')
    releaseV1({ baseFontSize: 12 })
    await first

    expect(getAppearanceValue('baseFontSize')).toBe(22)
  })

  it('keeps what it shows when a read fails', async () => {
    const client = createClient({ v1: { baseFontSize: 18 } })
    connect(client)
    await setActiveVault('v1')
    client.getAppearanceConfig.mockRejectedValue(new Error('offline'))
    await refreshAppearance('v1')
    expect(getAppearanceValue('baseFontSize')).toBe(18)
  })
})
