import { describe, it, expect } from 'vitest'
import {
  paneTreeReducer,
  createInitialPaneTree,
  createPane,
  findPane,
  getActiveTabId,
  listPanes,
  MIN_PANE_RATIO,
  type PaneTree,
  type SplitNode,
} from './paneTreeState'
import { initialTabState, type TabState } from './tabState'

/** A tab state carrying one open+active tab for the given vault/path. */
function tabStateWith(vaultId: string, filePath: string): TabState {
  const id = `${vaultId}::${filePath}`
  return {
    tabs: [
      {
        id,
        vaultId,
        filePath,
        fileName: filePath,
        mode: 'edit',
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

/** Build a single-pane tree with a seeded tab state. */
function seededTree(paneId: string, vaultId: string, filePath: string): PaneTree {
  return { root: createPane(paneId, tabStateWith(vaultId, filePath)), activePaneId: paneId }
}

describe('paneTreeReducer', () => {
  describe('initial', () => {
    it('starts as a single pane with an empty tab state', () => {
      const tree = createInitialPaneTree('p1')
      expect(tree.root.kind).toBe('pane')
      expect(tree.activePaneId).toBe('p1')
      expect(getActiveTabId(tree)).toBeNull()
      expect(listPanes(tree)).toHaveLength(1)
    })
  })

  describe('SPLIT_PANE', () => {
    it('replaces a pane with a split of [old, new] and focuses the new pane', () => {
      const tree = seededTree('p1', 'v', 'a.md')
      const next = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      expect(next.root.kind).toBe('split')
      const split = next.root as SplitNode
      expect(split.direction).toBe('horizontal')
      expect(split.children).toHaveLength(2)
      expect(split.sizes).toEqual([0.5, 0.5])
      expect(next.activePaneId).toBe('p2')
      // The old pane kept its tab.
      expect(findPane(next, 'p1')?.tabState.activeTabId).toBe('v::a.md')
      // The new pane is empty.
      expect(findPane(next, 'p2')?.tabState.tabs).toHaveLength(0)
    })

    it('supports two-level nesting (split a child of a split)', () => {
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p2', direction: 'vertical', newPaneId: 'p3' },
      })
      expect(listPanes(tree).map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3'])
      // Root is horizontal with [p1, verticalSplit(p2,p3)].
      const root = tree.root as SplitNode
      expect(root.direction).toBe('horizontal')
      const nested = root.children[1] as SplitNode
      expect(nested.kind).toBe('split')
      expect(nested.direction).toBe('vertical')
    })
  })

  describe('FOCUS_PANE', () => {
    it('changes the active pane and the derived active tab', () => {
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      // p2 is active (empty) → derived active tab is null.
      expect(getActiveTabId(tree)).toBeNull()
      // Focus p1 → derived active tab is p1's tab.
      tree = paneTreeReducer(tree, { type: 'FOCUS_PANE', payload: { paneId: 'p1' } })
      expect(tree.activePaneId).toBe('p1')
      expect(getActiveTabId(tree)).toBe('v::a.md')
    })

    it('ignores a focus on a non-existent pane', () => {
      const tree = seededTree('p1', 'v', 'a.md')
      const next = paneTreeReducer(tree, { type: 'FOCUS_PANE', payload: { paneId: 'nope' } })
      expect(next).toBe(tree)
    })
  })

  describe('CLOSE_PANE', () => {
    it('collapses the split so the sibling takes its place', () => {
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      tree = paneTreeReducer(tree, { type: 'CLOSE_PANE', payload: { paneId: 'p2' } })
      // Back to a single pane (p1), the split collapsed.
      expect(tree.root.kind).toBe('pane')
      expect(findPane(tree, 'p1')).not.toBeNull()
      expect(tree.activePaneId).toBe('p1')
    })

    it('never removes the last remaining pane', () => {
      const tree = seededTree('p1', 'v', 'a.md')
      const next = paneTreeReducer(tree, { type: 'CLOSE_PANE', payload: { paneId: 'p1' } })
      expect(next).toBe(tree)
      expect(listPanes(next)).toHaveLength(1)
    })
  })

  describe('PANE_TAB_ACTION', () => {
    it('delegates a tab action to the targeted pane only', () => {
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      // Open a tab in p2.
      tree = paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p2', action: { type: 'OPEN_TAB', payload: { vaultId: 'v', filePath: 'b.md', fileName: 'b.md' } } },
      })
      expect(findPane(tree, 'p2')?.tabState.tabs).toHaveLength(1)
      expect(findPane(tree, 'p2')?.tabState.activeTabId).toBe('v::b.md')
      // p1 untouched.
      expect(findPane(tree, 'p1')?.tabState.activeTabId).toBe('v::a.md')
    })

    it('collapses a pane when its last tab is closed', () => {
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      tree = paneTreeReducer(tree, { type: 'FOCUS_PANE', payload: { paneId: 'p1' } })
      // Close p1's only tab → p1 collapses, p2 survives as the single pane.
      tree = paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p1', action: { type: 'CLOSE_TAB', payload: { tabId: 'v::a.md' } } },
      })
      expect(tree.root.kind).toBe('pane')
      expect(findPane(tree, 'p2')).not.toBeNull()
      expect(findPane(tree, 'p1')).toBeNull()
      expect(tree.activePaneId).toBe('p2')
    })

    it('keeps the last pane (empty) when its last tab is closed', () => {
      const tree = seededTree('p1', 'v', 'a.md')
      const next = paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p1', action: { type: 'CLOSE_TAB', payload: { tabId: 'v::a.md' } } },
      })
      expect(next.root.kind).toBe('pane')
      expect(findPane(next, 'p1')?.tabState.tabs).toHaveLength(0)
    })
  })

  describe('RESIZE_SPLIT', () => {
    it('sets a child ratio and keeps sizes summing to 1', () => {
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      const splitId = (tree.root as SplitNode).id
      tree = paneTreeReducer(tree, {
        type: 'RESIZE_SPLIT',
        payload: { splitId, childIndex: 0, ratio: 0.7 },
      })
      const sizes = (tree.root as SplitNode).sizes
      expect(sizes[0]).toBeCloseTo(0.7, 5)
      expect(sizes[0]! + sizes[1]!).toBeCloseTo(1, 5)
    })

    it('clamps a ratio to the minimum floor', () => {
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      const splitId = (tree.root as SplitNode).id
      tree = paneTreeReducer(tree, {
        type: 'RESIZE_SPLIT',
        payload: { splitId, childIndex: 0, ratio: 0.001 },
      })
      const sizes = (tree.root as SplitNode).sizes
      expect(sizes[0]!).toBeGreaterThanOrEqual(MIN_PANE_RATIO - 1e-9)
    })
  })

  describe('purity', () => {
    it('does not mutate the previous tree on split', () => {
      const tree = createInitialPaneTree('p1')
      const snapshot = JSON.stringify(tree)
      paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      expect(JSON.stringify(tree)).toBe(snapshot)
    })

    it('leaves initialTabState untouched (shared default not mutated)', () => {
      const before = JSON.stringify(initialTabState)
      const tree = createInitialPaneTree('p1')
      paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p1', action: { type: 'OPEN_TAB', payload: { vaultId: 'v', filePath: 'a.md', fileName: 'a.md' } } },
      })
      expect(JSON.stringify(initialTabState)).toBe(before)
    })
  })
})
