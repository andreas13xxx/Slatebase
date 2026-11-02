import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { FileExplorer } from './FileExplorer'
import { AppContext, initialState } from '../state'
import { TabProvider } from '../state/tabContext'
import { LONG_PRESS_MS } from '../hooks/useLongPress'
import { _reset as resetAppConfig, initialize as initializeAppConfig, setActiveVault } from '../state/vaultAppConfigStore'
import type { AppState, DirectoryTree, VaultInfo } from '../types'
import type { IApiClient } from '../api'

const vault: VaultInfo = { id: 'v1', name: 'Test Vault', permission: 'owner', ownerName: 'admin' }
const tree: DirectoryTree = {
  name: 'root', type: 'directory', path: '', itemCount: 1,
  children: [{ name: 'readme.md', type: 'file', path: 'readme.md', size: 1 }],
}

function renderExplorer() {
  const state: AppState = { ...initialState, vaults: [vault], selectedVaultId: 'v1', vaultTrees: { v1: tree } }
  return render(
    React.createElement(
      AppContext.Provider,
      { value: { state, dispatch: vi.fn(), apiClient: {} as unknown as IApiClient } },
      React.createElement(TabProvider, null, React.createElement(FileExplorer)),
    ),
  )
}

function hold(el: Element) {
  fireEvent.pointerDown(el, { pointerType: 'touch', isPrimary: true, clientX: 3, clientY: 3 })
  act(() => { vi.advanceTimersByTime(LONG_PRESS_MS) })
}

describe('FileExplorer touch long-press', () => {
  beforeEach(() => {
    resetAppConfig()
    initializeAppConfig('v1', {})
    setActiveVault('v1')
    vi.useFakeTimers()
  })
  afterEach(() => { vi.useRealTimers() })

  it('fires one contextmenu for the empty area, targeted at the container', () => {
    const { container } = renderExplorer()
    const root = container.querySelector('.file-explorer-container') as HTMLElement
    const seen = vi.fn()
    root.addEventListener('contextmenu', (e) => seen(e.target))
    hold(root)
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledWith(root)
  })

  it('does not arm a second timer when the press starts on a row', () => {
    const { container } = renderExplorer()
    const root = container.querySelector('.file-explorer-container') as HTMLElement
    const row = container.querySelector('.tree-node-row') as HTMLElement
    const seen = vi.fn()
    root.addEventListener('contextmenu', (e) => seen(e.target))
    hold(row)
    // Only the row's own event; a container timer would add a second one targeted at the container.
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledWith(row)
  })
})
