import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useDeepLink, DEEP_LINK_VAULTS_WAIT_MS } from './useDeepLink'
import { storePendingDeepLink } from './pendingDeepLink'
import { consumeInvalidDeepLink } from './captureDeepLink'
import { clearAnchorJumps, peekAnchorJump } from '../state/anchorJumpBridge'
import * as Toast from '../components/ToastNotification'
import type { IApiClient } from '../api'

const NOT_FOUND = 'Link konnte nicht geöffnet werden: Ziel nicht gefunden oder kein Zugriff'
const vaults = [{ id: 'v1', name: 'Privat' }, { id: 'v2', name: 'Arbeit' }]

function setup(opts: { selected?: string | null; fetchFileContent?: ReturnType<typeof vi.fn> } = {}) {
  const dispatch = vi.fn()
  const tabDispatch = vi.fn()
  const fetchFileContent = opts.fetchFileContent ?? vi.fn().mockResolvedValue({ content: '# Titel', isBinary: false })
  const apiClient = { fetchFileContent } as unknown as IApiClient
  const view = renderHook(
    (props: { selected: string | null }) => useDeepLink({ vaults, selectedVaultId: props.selected, dispatch, tabDispatch, apiClient }),
    { initialProps: { selected: opts.selected === undefined ? 'v1' : opts.selected } },
  )
  return { dispatch, tabDispatch, fetchFileContent, ...view }
}

describe('useDeepLink', () => {
  let toast: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    window.sessionStorage.clear()
    consumeInvalidDeepLink()
    clearAnchorJumps()
    toast = vi.spyOn(Toast, 'showToast').mockReturnValue('t')
  })

  it('does nothing without a pending link', () => {
    const { tabDispatch, fetchFileContent } = setup()
    expect(tabDispatch).not.toHaveBeenCalled()
    expect(fetchFileContent).not.toHaveBeenCalled()
  })

  it('opens the file of the selected vault and loads its content', async () => {
    storePendingDeepLink({ vault: 'v1', path: 'Ordner/Notiz.md', anchor: null })
    const { tabDispatch, fetchFileContent } = setup()
    await waitFor(() => expect(tabDispatch).toHaveBeenCalledTimes(2))
    expect(fetchFileContent).toHaveBeenCalledWith('v1', 'Ordner/Notiz.md')
    expect(tabDispatch).toHaveBeenNthCalledWith(1, { type: 'OPEN_TAB', payload: { vaultId: 'v1', filePath: 'Ordner/Notiz.md', fileName: 'Notiz.md' } })
    expect(tabDispatch).toHaveBeenNthCalledWith(2, {
      type: 'TAB_CONTENT_LOADED',
      payload: { tabId: 'v1::Ordner/Notiz.md', content: '# Titel', isBinary: false },
    })
    expect(toast).not.toHaveBeenCalled()
  })

  it('parks the anchor for the tab', async () => {
    storePendingDeepLink({ vault: 'v1', path: 'n.md', anchor: { kind: 'heading', text: 'Titel' } })
    const { tabDispatch } = setup()
    await waitFor(() => expect(tabDispatch).toHaveBeenCalled())
    expect(peekAnchorJump('v1::n.md')).toEqual({ kind: 'heading', text: 'Titel' })
  })

  it('selects another vault first and opens the file only once it is selected', async () => {
    storePendingDeepLink({ vault: 'v2', path: 'n.md', anchor: null })
    const { dispatch, tabDispatch, fetchFileContent, rerender } = setup({ selected: 'v1' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'VAULT_SELECTED', payload: 'v2' })
    expect(fetchFileContent).not.toHaveBeenCalled()
    expect(tabDispatch).not.toHaveBeenCalled()

    rerender({ selected: 'v2' })
    await waitFor(() => expect(tabDispatch).toHaveBeenCalledTimes(2))
    expect(fetchFileContent).toHaveBeenCalledWith('v2', 'n.md')
  })

  it('resolves a vault by its unique name', async () => {
    storePendingDeepLink({ vault: 'Arbeit', path: null, anchor: null })
    const { dispatch } = setup({ selected: 'v1' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'VAULT_SELECTED', payload: 'v2' })
  })

  it('only selects the vault for a vault-only link', () => {
    storePendingDeepLink({ vault: 'v1', path: null, anchor: null })
    const { dispatch, tabDispatch, fetchFileContent } = setup({ selected: 'v1' })
    expect(dispatch).not.toHaveBeenCalled()
    expect(tabDispatch).not.toHaveBeenCalled()
    expect(fetchFileContent).not.toHaveBeenCalled()
  })

  it('shows one generic message for an unknown vault', () => {
    storePendingDeepLink({ vault: 'nope', path: 'n.md', anchor: null })
    const { dispatch, tabDispatch } = setup()
    expect(toast).toHaveBeenCalledWith('error', NOT_FOUND)
    expect(dispatch).not.toHaveBeenCalled()
    expect(tabDispatch).not.toHaveBeenCalled()
  })

  it('shows the same message when the file is missing or not readable, and opens no tab', async () => {
    storePendingDeepLink({ vault: 'v1', path: 'gone.md', anchor: null })
    const { tabDispatch } = setup({ fetchFileContent: vi.fn().mockRejectedValue({ code: 'FILE_NOT_FOUND' }) })
    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', NOT_FOUND))
    expect(tabDispatch).not.toHaveBeenCalled()
  })

  it('reports a link that could not even be parsed', () => {
    // capture marks it; simulate by importing the module flag through a failed capture
    return import('./captureDeepLink').then(({ captureDeepLinkFromLocation }) => {
      captureDeepLinkFromLocation({ pathname: '/open', search: '?file=a.md' }, { replaceState: vi.fn() })
      setup()
      expect(toast).toHaveBeenCalledWith('error', 'Der Link ist ungültig')
    })
  })

  it('drops the link when the vault list never arrives, so a later vault cannot trigger it', () => {
    vi.useFakeTimers()
    try {
      storePendingDeepLink({ vault: 'v1', path: 'n.md', anchor: null })
      const dispatch = vi.fn()
      const tabDispatch = vi.fn()
      const apiClient = { fetchFileContent: vi.fn() } as unknown as IApiClient
      const { rerender } = renderHook(
        (props: { list: Array<{ id: string; name: string }> }) =>
          useDeepLink({ vaults: props.list, selectedVaultId: null, dispatch, tabDispatch, apiClient }),
        { initialProps: { list: [] as Array<{ id: string; name: string }> } },
      )
      expect(toast).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(DEEP_LINK_VAULTS_WAIT_MS) })
      expect(toast).toHaveBeenCalledWith('error', NOT_FOUND)

      rerender({ list: vaults })
      expect(dispatch).not.toHaveBeenCalled()
      expect(tabDispatch).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps waiting when the vault list arrives in time', async () => {
    vi.useFakeTimers()
    try {
      storePendingDeepLink({ vault: 'v1', path: null, anchor: null })
      const dispatch = vi.fn()
      const apiClient = { fetchFileContent: vi.fn() } as unknown as IApiClient
      const { rerender } = renderHook(
        (props: { list: Array<{ id: string; name: string }> }) =>
          useDeepLink({ vaults: props.list, selectedVaultId: null, dispatch, tabDispatch: vi.fn(), apiClient }),
        { initialProps: { list: [] as Array<{ id: string; name: string }> } },
      )
      act(() => { vi.advanceTimersByTime(DEEP_LINK_VAULTS_WAIT_MS - 1000) })
      rerender({ list: vaults })
      expect(dispatch).toHaveBeenCalledWith({ type: 'VAULT_SELECTED', payload: 'v1' })
      act(() => { vi.advanceTimersByTime(5000) })
      expect(toast).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('handles a link exactly once', async () => {
    storePendingDeepLink({ vault: 'v1', path: 'n.md', anchor: null })
    const { tabDispatch, rerender } = setup()
    await waitFor(() => expect(tabDispatch).toHaveBeenCalledTimes(2))
    rerender({ selected: 'v1' })
    rerender({ selected: 'v1' })
    expect(tabDispatch).toHaveBeenCalledTimes(2)
  })
})
