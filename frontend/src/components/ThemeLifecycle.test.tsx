import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../state'
import { dispatchRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { ThemeLifecycle } from './ThemeLifecycle'
import { themeInjector } from '../plugins/appearance/theme-injector'
import type { IApiClient } from '../api'
import type { VaultInfo } from '../types'

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    getActiveTheme: vi.fn().mockResolvedValue(null),
    loadTheme: vi.fn().mockResolvedValue({ css: '', meta: {} }),
    ...overrides,
  } as unknown as IApiClient
}

function VaultSwitcher({ vaults }: { vaults: VaultInfo[] }) {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: vaults })
    dispatch({ type: 'VAULT_SELECTED', payload: vaults[0]!.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** Switches to the given vault on demand (used to simulate a vault change). */
function VaultSelector({ vaultId }: { vaultId: string }) {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
  }, [dispatch, vaultId])
  return null
}

const vaultA: VaultInfo = { id: 'vault-a', name: 'Vault A' }
const vaultB: VaultInfo = { id: 'vault-b', name: 'Vault B' }
const themeTag = (): Element | null => document.head.querySelector('style[data-slatebase-theme]')

describe('ThemeLifecycle', () => {
  afterEach(() => {
    themeInjector.remove()
    vi.restoreAllMocks()
  })

  it('applies the vault\'s active theme when the vault opens', async () => {
    const apiClient = createMockApiClient({
      getActiveTheme: vi.fn().mockResolvedValue('Things'),
      loadTheme: vi.fn().mockResolvedValue({ css: 'body { color: red; }', meta: {} }),
    })

    render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA]} />
        <ThemeLifecycle />
      </AppProvider>,
    )

    await waitFor(() => expect(themeTag()?.textContent).toBe('body { color: red; }'))
    expect(apiClient.loadTheme).toHaveBeenCalledWith('vault-a', 'Things')
    expect(document.documentElement.getAttribute('data-obsidian-theme')).toBe('Things')
  })

  it('applies a built-in theme from its id alone, without asking the server for CSS', async () => {
    const apiClient = createMockApiClient({ getActiveTheme: vi.fn().mockResolvedValue('builtin:obsidian') })

    render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA]} />
        <ThemeLifecycle />
      </AppProvider>,
    )

    await waitFor(() => expect(document.documentElement.getAttribute('data-obsidian-theme')).toBe('builtin:obsidian'))
    expect(apiClient.loadTheme).not.toHaveBeenCalled()
    expect(themeTag()).toBeNull()
  })

  it('falls back to the default look when the selected theme is over the size limit, even after a built-in theme', async () => {
    themeInjector.applyBuiltin('builtin:obsidian')
    const apiClient = createMockApiClient({
      getActiveTheme: vi.fn().mockResolvedValue('Huge'),
      loadTheme: vi.fn().mockResolvedValue({ css: 'a'.repeat(6 * 1024 * 1024 + 1), meta: {} }),
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA]} />
        <ThemeLifecycle />
      </AppProvider>,
    )

    await waitFor(() => expect(apiClient.loadTheme).toHaveBeenCalledWith('vault-a', 'Huge'))
    await waitFor(() => expect(document.documentElement.hasAttribute('data-obsidian-theme')).toBe(false))
    expect(themeTag()).toBeNull()
  })

  it('applies nothing when the vault has no active theme', async () => {
    const apiClient = createMockApiClient()
    render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA]} />
        <ThemeLifecycle />
      </AppProvider>,
    )

    await waitFor(() => expect(apiClient.getActiveTheme).toHaveBeenCalledWith('vault-a'))
    expect(themeTag()).toBeNull()
    expect(apiClient.loadTheme).not.toHaveBeenCalled()
  })

  it('keeps the applied theme when a refresh fails (unknown is not gone)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const getActiveTheme = vi.fn().mockResolvedValue('Things')
    const apiClient = createMockApiClient({
      getActiveTheme,
      loadTheme: vi.fn().mockResolvedValue({ css: 'body { color: red; }', meta: {} }),
    })

    render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA]} />
        <ThemeLifecycle />
      </AppProvider>,
    )
    await waitFor(() => expect(themeTag()).not.toBeNull())

    getActiveTheme.mockRejectedValue(new Error('network down'))
    act(() => {
      dispatchRealtimeVaultChange({ vaultId: 'vault-a', action: 'saved', path: '.obsidian/appearance.json', userId: 'u2', username: 'o' })
    })

    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(themeTag()?.textContent).toBe('body { color: red; }')
  })

  it('falls back to the default look when the selected theme no longer exists', async () => {
    const apiClient = createMockApiClient({
      getActiveTheme: vi.fn().mockResolvedValue('Gone'),
      loadTheme: vi.fn().mockRejectedValue({ code: 'THEME_NOT_FOUND', message: 'nope' }),
    })

    render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA]} />
        <ThemeLifecycle />
      </AppProvider>,
    )

    await waitFor(() => expect(apiClient.loadTheme).toHaveBeenCalled())
    expect(themeTag()).toBeNull()
    expect(document.documentElement.hasAttribute('data-obsidian-theme')).toBe(false)
  })

  it('swaps the theme when another vault is selected', async () => {
    const apiClient = createMockApiClient({
      getActiveTheme: vi.fn().mockImplementation(async (vaultId: string) => (vaultId === 'vault-a' ? 'ThemeA' : null)),
      loadTheme: vi.fn().mockResolvedValue({ css: 'a { color: red; }', meta: {} }),
    })

    const { rerender } = render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA, vaultB]} />
        <ThemeLifecycle />
      </AppProvider>,
    )
    await waitFor(() => expect(themeTag()).not.toBeNull())

    rerender(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA, vaultB]} />
        <VaultSelector vaultId="vault-b" />
        <ThemeLifecycle />
      </AppProvider>,
    )

    await waitFor(() => expect(themeTag()).toBeNull())
    expect(apiClient.getActiveTheme).toHaveBeenCalledWith('vault-b')
  })

  it('re-reads the selection when the server reports a change to appearance.json', async () => {
    const getActiveTheme = vi.fn().mockResolvedValue(null)
    const apiClient = createMockApiClient({
      getActiveTheme,
      loadTheme: vi.fn().mockResolvedValue({ css: 'b { color: blue; }', meta: {} }),
    })

    render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA]} />
        <ThemeLifecycle />
      </AppProvider>,
    )
    await waitFor(() => expect(getActiveTheme).toHaveBeenCalledTimes(1))

    getActiveTheme.mockResolvedValue('Minimal')
    act(() => {
      dispatchRealtimeVaultChange({
        vaultId: 'vault-a',
        action: 'saved',
        path: '.obsidian/appearance.json',
        userId: 'u2',
        username: 'other',
      })
    })

    await waitFor(() => expect(themeTag()?.textContent).toBe('b { color: blue; }'))
  })

  it('ignores vault changes that are not theme related or belong to another vault', async () => {
    const getActiveTheme = vi.fn().mockResolvedValue(null)
    const apiClient = createMockApiClient({ getActiveTheme })

    render(
      <AppProvider apiClient={apiClient}>
        <VaultSwitcher vaults={[vaultA]} />
        <ThemeLifecycle />
      </AppProvider>,
    )
    await waitFor(() => expect(getActiveTheme).toHaveBeenCalledTimes(1))

    act(() => {
      dispatchRealtimeVaultChange({ vaultId: 'vault-a', action: 'saved', path: 'notes/a.md', userId: 'u2', username: 'o' })
      dispatchRealtimeVaultChange({ vaultId: 'vault-b', action: 'saved', path: '.obsidian/appearance.json', userId: 'u2', username: 'o' })
    })

    expect(getActiveTheme).toHaveBeenCalledTimes(1)
  })

  it('does not clear the theme when only the api client changes for the same vault', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const first = createMockApiClient({
      getActiveTheme: vi.fn().mockResolvedValue('Things'),
      loadTheme: vi.fn().mockResolvedValue({ css: 'body { color: red; }', meta: {} }),
    })
    const second = createMockApiClient({
      getActiveTheme: vi.fn().mockRejectedValue(new Error('network down')),
    })

    const { rerender } = render(
      <AppProvider apiClient={first}>
        <VaultSwitcher vaults={[vaultA]} />
        <ThemeLifecycle />
      </AppProvider>,
    )
    await waitFor(() => expect(themeTag()).not.toBeNull())

    rerender(
      <AppProvider apiClient={second}>
        <VaultSwitcher vaults={[vaultA]} />
        <ThemeLifecycle />
      </AppProvider>,
    )

    await waitFor(() => expect(second.getActiveTheme).toHaveBeenCalledWith('vault-a'))
    // The re-read failed: "unknown" must not undo the applied theme.
    expect(themeTag()?.textContent).toBe('body { color: red; }')
  })
})
