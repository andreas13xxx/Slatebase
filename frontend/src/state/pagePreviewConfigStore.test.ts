import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IApiClient } from '../api'
import { registerHoverLinkSource, resetHoverLinkBus } from '../plugins/compat/hover-link-bus'
import {
  _reset,
  initialize,
  pagePreviewRequiresMod,
  setActiveVault,
  setPagePreviewRequiresMod,
} from './pagePreviewConfigStore'

function client(initial: Record<string, unknown>) {
  const getPagePreviewConfig = vi.fn().mockResolvedValue(initial)
  const patchPagePreviewConfig = vi.fn()
  initialize({ getPagePreviewConfig, patchPagePreviewConfig } as unknown as IApiClient)
  return { getPagePreviewConfig, patchPagePreviewConfig }
}

describe('pagePreviewConfigStore', () => {
  beforeEach(() => {
    _reset()
    resetHoverLinkBus()
  })

  it('shows previews on hover alone where the file says nothing', async () => {
    client({})
    await setActiveVault('v1')
    expect(pagePreviewRequiresMod('internal-link')).toBe(false)
    expect(pagePreviewRequiresMod('some-plugin')).toBe(false)
  })

  it('maps Slatebase\'s own links to the "preview" entry', async () => {
    client({ preview: true })
    await setActiveVault('v1')
    expect(pagePreviewRequiresMod('internal-link')).toBe(true)
  })

  it('uses the registered default of a plugin source until the file decides', async () => {
    registerHoverLinkSource('tasknotes', { display: 'Tasks', defaultMod: true })
    client({})
    await setActiveVault('v1')
    expect(pagePreviewRequiresMod('tasknotes')).toBe(true)

    _reset()
    client({ tasknotes: false })
    await setActiveVault('v1')
    expect(pagePreviewRequiresMod('tasknotes')).toBe(false)
  })

  it('writes optimistically and adopts the server copy', async () => {
    const api = client({})
    api.patchPagePreviewConfig.mockResolvedValue({ preview: true })
    await setActiveVault('v1')

    const pending = setPagePreviewRequiresMod('preview', true)
    expect(pagePreviewRequiresMod('internal-link')).toBe(true)
    await pending

    expect(api.patchPagePreviewConfig).toHaveBeenCalledWith('v1', { preview: true })
    expect(pagePreviewRequiresMod('internal-link')).toBe(true)
  })

  it('puts the old value back and rejects when the write is refused', async () => {
    const api = client({ preview: false })
    api.patchPagePreviewConfig.mockRejectedValue(new Error('forbidden'))
    await setActiveVault('v1')

    await expect(setPagePreviewRequiresMod('preview', true)).rejects.toThrow('forbidden')
    expect(pagePreviewRequiresMod('internal-link')).toBe(false)
  })

  it('keeps what is shown when the file cannot be read', async () => {
    const api = client({ preview: true })
    await setActiveVault('v1')
    api.getPagePreviewConfig.mockRejectedValue(new Error('offline'))
    const { refreshPagePreviewConfig } = await import('./pagePreviewConfigStore')
    await refreshPagePreviewConfig('v1')
    expect(pagePreviewRequiresMod('internal-link')).toBe(true)
  })
})
