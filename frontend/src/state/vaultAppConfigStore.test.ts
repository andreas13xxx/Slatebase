import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DEFAULT_APP_CONFIG,
  _reset,
  getAppConfigRaw,
  getAppConfigValue,
  initialize,
  refreshAppConfig,
  setActiveVault,
  updateAppConfig,
} from './vaultAppConfigStore'
import type { IApiClient } from '../api'

function createClient(files: Record<string, Record<string, unknown>> = {}) {
  return {
    files,
    getAppConfig: vi.fn(async (vaultId: string) => ({ ...(files[vaultId] ?? {}) })),
    patchAppConfig: vi.fn(async (vaultId: string, patch: Record<string, unknown>) => {
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

describe('vaultAppConfigStore', () => {
  beforeEach(() => _reset())

  const connect = (client: ReturnType<typeof createClient>) => initialize(client as unknown as IApiClient)

  it('serves the defaults before a vault is active and for keys the file lacks', async () => {
    expect(getAppConfigValue('readableLineLength')).toBe(DEFAULT_APP_CONFIG.readableLineLength)
    connect(createClient({ v1: { showLineNumber: true } }))
    await setActiveVault('v1')
    expect(getAppConfigValue('showLineNumber')).toBe(true)
    expect(getAppConfigValue('spellcheck')).toBe(true)
  })

  it('ignores a known key with the wrong type, and passes unknown keys through', async () => {
    connect(createClient({ v1: { spellcheck: 'yes', vimMode: true } }))
    await setActiveVault('v1')
    expect(getAppConfigValue('spellcheck')).toBe(true)
    expect(getAppConfigRaw('vimMode')).toBe(true)
    expect(getAppConfigRaw('doesNotExist')).toBeNull()
  })

  it('swaps to the defaults at once on a vault switch, then loads the new vault', async () => {
    const client = createClient({ v1: { readableLineLength: false }, v2: {} })
    connect(client)
    await setActiveVault('v1')
    expect(getAppConfigValue('readableLineLength')).toBe(false)

    await setActiveVault('v2')

    expect(getAppConfigValue('readableLineLength')).toBe(true)
  })

  it('keeps what is shown when a read fails', async () => {
    const client = createClient({ v1: { showLineNumber: true } })
    connect(client)
    await setActiveVault('v1')
    client.getAppConfig.mockRejectedValueOnce(new Error('offline'))

    await refreshAppConfig('v1')

    expect(getAppConfigValue('showLineNumber')).toBe(true)
  })

  it('picks up a change made outside (refresh)', async () => {
    const client = createClient({ v1: {} })
    connect(client)
    await setActiveVault('v1')

    client.files['v1'] = { showLineNumber: true }
    await refreshAppConfig('v1')

    expect(getAppConfigValue('showLineNumber')).toBe(true)
  })

  it('applies a write at once and sends only the patch', async () => {
    const client = createClient({ v1: { vimMode: true } })
    connect(client)
    await setActiveVault('v1')

    const pending = updateAppConfig({ spellcheck: false })
    expect(getAppConfigValue('spellcheck')).toBe(false)
    await pending

    expect(client.patchAppConfig).toHaveBeenCalledWith('v1', { spellcheck: false })
    expect(getAppConfigRaw('vimMode')).toBe(true)
  })

  it('null removes a key and brings the default back', async () => {
    const client = createClient({ v1: { readableLineLength: false } })
    connect(client)
    await setActiveVault('v1')

    await updateAppConfig({ readableLineLength: null })

    expect(getAppConfigValue('readableLineLength')).toBe(true)
    expect(client.files['v1']).toEqual({})
  })

  it('puts the previous value back and rejects when the write fails', async () => {
    const client = createClient({ v1: { spellcheck: true } })
    client.patchAppConfig.mockRejectedValueOnce(new Error('Kein Schreibzugriff'))
    connect(client)
    await setActiveVault('v1')

    await expect(updateAppConfig({ spellcheck: false })).rejects.toThrow('Kein Schreibzugriff')

    expect(getAppConfigValue('spellcheck')).toBe(true)
  })

  it('rejects a write while no vault is active', async () => {
    connect(createClient())
    await expect(updateAppConfig({ spellcheck: false })).rejects.toThrow(/Kein Vault/)
  })

  it('does not let a slow response of a previous vault overwrite the new one', async () => {
    let releaseV1: (fields: Record<string, unknown>) => void = () => {}
    const client = createClient({ v2: { showLineNumber: true } })
    client.getAppConfig.mockImplementation((vaultId: string) =>
      vaultId === 'v1' ? new Promise((resolve) => { releaseV1 = resolve }) : Promise.resolve({ ...(client.files[vaultId] ?? {}) }))
    connect(client)

    const first = setActiveVault('v1')
    await setActiveVault('v2')
    releaseV1({ showLineNumber: false, readableLineLength: false })
    await first

    expect(getAppConfigValue('showLineNumber')).toBe(true)
    expect(getAppConfigValue('readableLineLength')).toBe(true)
  })
})
