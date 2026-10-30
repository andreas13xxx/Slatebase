import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLineNumbers } from './useLineNumbers'
import {
  _reset as resetAppConfig,
  initialize as initializeAppConfig,
  setActiveVault,
} from '../state/vaultAppConfigStore'
import { showToast } from '../components/ToastNotification'
import type { IApiClient } from '../api'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

/** A tiny in-memory app.json per vault; `readOnly` makes every write fail like a 403. */
function createClient(files: Record<string, Record<string, unknown>> = {}, readOnly = false) {
  return {
    files,
    getAppConfig: vi.fn(async (vaultId: string) => ({ ...(files[vaultId] ?? {}) })),
    patchAppConfig: vi.fn(async (vaultId: string, patch: Record<string, unknown>) => {
      if (readOnly) throw { code: 'FORBIDDEN', message: 'Kein Schreibzugriff' }
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

describe('useLineNumbers', () => {
  beforeEach(() => {
    resetAppConfig()
    vi.mocked(showToast).mockClear()
  })

  async function connect(client: ReturnType<typeof createClient>, vaultId = 'vault-1') {
    initializeAppConfig(client as unknown as IApiClient)
    await setActiveVault(vaultId)
  }

  it('defaults to disabled when app.json has no showLineNumber', async () => {
    await connect(createClient())
    const { result } = renderHook(() => useLineNumbers())
    expect(result.current.enabled).toBe(false)
  })

  it('reads showLineNumber from the vault’s app.json', async () => {
    await connect(createClient({ 'vault-1': { showLineNumber: true } }))
    const { result } = renderHook(() => useLineNumbers())
    expect(result.current.enabled).toBe(true)
  })

  it('toggling writes showLineNumber to app.json', async () => {
    const client = createClient()
    await connect(client)
    const { result } = renderHook(() => useLineNumbers())

    act(() => { result.current.toggle() })

    expect(result.current.enabled).toBe(true)
    await waitFor(() => expect(client.patchAppConfig).toHaveBeenCalledWith('vault-1', { showLineNumber: true }))
    expect(client.files['vault-1']).toEqual({ showLineNumber: true })
  })

  it('shares state across hook instances', async () => {
    await connect(createClient())
    const first = renderHook(() => useLineNumbers())
    const second = renderHook(() => useLineNumbers())

    act(() => { first.result.current.toggle() })

    expect(second.result.current.enabled).toBe(true)
  })

  it('follows the vault: another vault has its own app.json', async () => {
    await connect(createClient({ 'vault-1': { showLineNumber: true } }))
    const { result } = renderHook(() => useLineNumbers())
    expect(result.current.enabled).toBe(true)

    await act(async () => { await setActiveVault('vault-2') })

    expect(result.current.enabled).toBe(false)
  })

  it('puts the value back and says why when the write is refused', async () => {
    await connect(createClient({}, true))
    const { result } = renderHook(() => useLineNumbers())

    act(() => { result.current.toggle() })
    expect(result.current.enabled).toBe(true)

    await waitFor(() => expect(result.current.enabled).toBe(false))
    expect(showToast).toHaveBeenCalledWith('error', expect.stringContaining('Kein Schreibzugriff'))
  })

  it('does nothing when no vault is active', async () => {
    initializeAppConfig(createClient() as unknown as IApiClient)
    await setActiveVault(null)
    const { result } = renderHook(() => useLineNumbers())

    act(() => { result.current.toggle() })

    expect(result.current.enabled).toBe(false)
    await waitFor(() => expect(showToast).toHaveBeenCalled())
  })
})
