import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useReadableLineLength } from './useReadableLineLength'
import {
  _reset as resetAppConfig,
  initialize as initializeAppConfig,
  setActiveVault,
} from '../state/vaultAppConfigStore'
import type { IApiClient } from '../api'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

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

describe('useReadableLineLength', () => {
  beforeEach(() => resetAppConfig())

  async function connect(client: ReturnType<typeof createClient>) {
    initializeAppConfig(client as unknown as IApiClient)
    await setActiveVault('vault-1')
  }

  it('defaults to enabled when app.json has no readableLineLength', async () => {
    await connect(createClient())
    expect(renderHook(() => useReadableLineLength()).result.current.enabled).toBe(true)
  })

  it('reads readableLineLength from the vault’s app.json', async () => {
    await connect(createClient({ 'vault-1': { readableLineLength: false } }))
    expect(renderHook(() => useReadableLineLength()).result.current.enabled).toBe(false)
  })

  it('toggling writes readableLineLength to app.json and keeps other keys', async () => {
    const client = createClient({ 'vault-1': { vimMode: true } })
    await connect(client)
    const { result } = renderHook(() => useReadableLineLength())

    act(() => { result.current.toggle() })

    expect(result.current.enabled).toBe(false)
    await waitFor(() => expect(client.files['vault-1']).toEqual({ vimMode: true, readableLineLength: false }))
  })

  it('shares state across hook instances', async () => {
    await connect(createClient())
    const first = renderHook(() => useReadableLineLength())
    const second = renderHook(() => useReadableLineLength())

    act(() => { first.result.current.toggle() })

    expect(second.result.current.enabled).toBe(false)
  })

  it('ignores a value of the wrong type in app.json and uses the default', async () => {
    await connect(createClient({ 'vault-1': { readableLineLength: 'no' } }))
    expect(renderHook(() => useReadableLineLength()).result.current.enabled).toBe(true)
  })
})
