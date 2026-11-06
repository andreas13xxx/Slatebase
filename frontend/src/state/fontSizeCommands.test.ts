import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _reset, getAppearanceValue, initialize, setActiveVault } from './vaultAppearanceStore'
import { decreaseFontSize, increaseFontSize, MAX_FONT_SIZE, MIN_FONT_SIZE } from './fontSizeCommands'
import type { IApiClient } from '../api'

function createClient(file: Record<string, unknown>) {
  return {
    getAppearanceConfig: vi.fn(async () => ({ ...file })),
    patchAppearanceConfig: vi.fn(async (_vaultId: string, patch: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete file[key]
        else file[key] = value
      }
      return { ...file }
    }),
  }
}

async function connect(file: Record<string, unknown>) {
  const client = createClient(file)
  initialize(client as unknown as IApiClient)
  await setActiveVault('v1')
  return client
}

describe('fontSizeCommands', () => {
  beforeEach(() => _reset())

  it('steps the vault base font size up and down by one pixel', async () => {
    const client = await connect({ baseFontSize: 18 })
    await increaseFontSize()
    expect(getAppearanceValue('baseFontSize')).toBe(19)
    await decreaseFontSize()
    await decreaseFontSize()
    expect(getAppearanceValue('baseFontSize')).toBe(17)
    expect(client.patchAppearanceConfig).toHaveBeenLastCalledWith('v1', { baseFontSize: 17 })
  })

  it('stores the default size as unset, like the settings form', async () => {
    const client = await connect({ baseFontSize: 17 })
    await decreaseFontSize()
    expect(client.patchAppearanceConfig).toHaveBeenLastCalledWith('v1', { baseFontSize: null })
    expect(getAppearanceValue('baseFontSize')).toBe(16)
  })

  it('does not write past the allowed range', async () => {
    const client = await connect({ baseFontSize: MAX_FONT_SIZE })
    await increaseFontSize()
    expect(client.patchAppearanceConfig).not.toHaveBeenCalled()

    _reset()
    const low = await connect({ baseFontSize: MIN_FONT_SIZE })
    await decreaseFontSize()
    expect(low.patchAppearanceConfig).not.toHaveBeenCalled()
  })
})
