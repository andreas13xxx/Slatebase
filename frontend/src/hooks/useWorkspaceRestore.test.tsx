import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { IApiClient } from '../api'
import type { VaultInfo } from '../types'
import { useWorkspaceRestore, type UseWorkspaceRestoreParams } from './useWorkspaceRestore'
import { rehydratePaneTree, migrateFlatTabsToPaneTree } from '../state/paneTreeState'

const vault = { id: 'v1', name: 'Test' } as VaultInfo

/** One restored pane holding a single tab in its loading state. */
function restoredTree() {
  return rehydratePaneTree(
    migrateFlatTabsToPaneTree([{ vaultId: 'v1', filePath: 'a.md', fileName: 'a.md', mode: 'view', pinned: false }], null, 'p1'),
  )
}

function makeParams(overrides: Partial<UseWorkspaceRestoreParams> = {}): UseWorkspaceRestoreParams {
  const apiClient = {
    fetchFileContent: vi.fn().mockResolvedValue({ content: '# A', isBinary: false }),
  } as unknown as IApiClient
  return {
    vaults: [vault],
    selectedVaultId: null,
    dispatch: vi.fn(),
    tabs: [],
    activeTabId: null,
    paneTree: restoredTree(),
    paneTreeDispatch: vi.fn(),
    activeSettingsPage: null,
    showSidebar: true,
    showRightPanel: true,
    apiClient,
    ...overrides,
  }
}

const contentLoaded = expect.objectContaining({
  type: 'PANE_TAB_ACTION',
  payload: expect.objectContaining({
    paneId: 'p1',
    action: expect.objectContaining({ type: 'TAB_CONTENT_LOADED' }),
  }),
})

describe('useWorkspaceRestore content restore', () => {
  // The restore effect runs once; a cleanup between its run and the fetch
  // resolving (dep change here, StrictMode's dev re-run in the app) must not
  // drop the content, or every restored tab stays on "Laden…".
  it('delivers restored tab content when the vault list changes before the fetch resolves', async () => {
    // Hold the fetch open so the vault-list change lands while it is in flight.
    let resolveFetch: (value: { content: string; isBinary: boolean }) => void = () => {}
    const apiClient = {
      fetchFileContent: vi.fn(() => new Promise((resolve) => { resolveFetch = resolve })),
    } as unknown as IApiClient
    const params = makeParams({ apiClient })
    const { rerender } = renderHook((p: UseWorkspaceRestoreParams) => useWorkspaceRestore(p), { initialProps: params })
    rerender({ ...params, vaults: [{ ...vault }] })
    await act(async () => { resolveFetch({ content: '# A', isBinary: false }) })
    expect(params.paneTreeDispatch).toHaveBeenCalledWith(contentLoaded)
  })
})
