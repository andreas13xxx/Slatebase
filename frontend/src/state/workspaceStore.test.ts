import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  initialize,
  getState,
  updatePaneTree,
  flush,
  clear,
} from './workspaceStore'
import { serializePaneTree, createPane, type PaneTree, type SplitNode } from './paneTreeState'

const STORAGE_KEY = 'slatebase_workspace'

/** A tab state carrying one open+active tab. */
function tabStateWith(vaultId: string, filePath: string) {
  const id = `${vaultId}::${filePath}`
  return {
    tabs: [
      {
        id,
        vaultId,
        filePath,
        fileName: filePath,
        mode: 'edit' as const,
        isBinary: false,
        content: '',
        editBuffer: null,
        loading: false,
        error: null,
        pinned: false,
      },
    ],
    activeTabId: id,
    closedTabsHistory: [],
  }
}

function twoPaneTree(): PaneTree {
  const split: SplitNode = {
    kind: 'split',
    id: 'split-1',
    direction: 'horizontal',
    children: [createPane('p1', tabStateWith('v', 'a.md')), createPane('p2', tabStateWith('v', 'b.md'))],
    sizes: [0.6, 0.4],
  }
  return { root: split, activePaneId: 'p2' }
}

describe('workspaceStore — paneTree persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('persists and re-reads a serialized pane tree through localStorage', () => {
    updatePaneTree(serializePaneTree(twoPaneTree()))
    flush() // write synchronously

    // Fresh read from storage.
    initialize()
    const restored = getState().paneTree
    expect(restored).toBeDefined()
    expect(restored!.activePaneId).toBe('p2')
    expect(restored!.root.kind).toBe('split')
  })

  it('drops an unusable paneTree but keeps the rest of the workspace state valid', () => {
    const blob = {
      version: 1,
      tabs: [],
      activeTabId: null,
      expandedPaths: [],
      expandedVaults: [],
      sidebarWidth: 300,
      rightPanelWidth: 240,
      sidebarVisible: true,
      rightPanelVisible: true,
      activeSettingsPage: null,
      selectedVaultId: 'vault-x',
      explorerFollowActiveFile: false,
      paneTree: { root: { kind: 'nonsense' }, activePaneId: 1 }, // unusable
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
    initialize()
    const state = getState()
    // The bad paneTree is simply absent — the rest of the state survived.
    expect(state.paneTree).toBeUndefined()
    expect(state.selectedVaultId).toBe('vault-x')
    expect(state.sidebarWidth).toBe(300)
  })

  it('leaves paneTree absent for a legacy blob without the field', () => {
    const legacy = {
      version: 1,
      tabs: [{ vaultId: 'v', filePath: 'a.md', fileName: 'a.md', mode: 'edit' }],
      activeTabId: 'v::a.md',
      expandedPaths: [],
      expandedVaults: [],
      sidebarWidth: 260,
      rightPanelWidth: 240,
      sidebarVisible: true,
      rightPanelVisible: true,
      activeSettingsPage: null,
      selectedVaultId: null,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy))
    initialize()
    const state = getState()
    expect(state.paneTree).toBeUndefined()
    // The legacy flat tabs are still there for the migration path to pick up.
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabId).toBe('v::a.md')
  })
})
