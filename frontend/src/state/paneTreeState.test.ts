import { describe, it, expect } from 'vitest'
import {
  paneTreeReducer,
  createInitialPaneTree,
  createPane,
  findPane,
  getActiveTabId,
  listPanes,
  MIN_PANE_RATIO,
  serializePaneTree,
  rehydratePaneTree,
  migrateFlatTabsToPaneTree,
  parsePersistedPaneTree,
  type PaneTree,
  type SplitNode,
  type PersistedPaneTab,
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

  describe('MOVE_TAB_TO_PANE', () => {
    /** Two side-by-side panes: p1 has a.md+c.md (c active), p2 has b.md. */
    function twoPaneTree(): PaneTree {
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      tree = paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p2', action: { type: 'OPEN_TAB', payload: { vaultId: 'v', filePath: 'b.md', fileName: 'b.md' } } },
      })
      // Give p1 a second tab so moving one does not collapse it.
      tree = paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p1', action: { type: 'OPEN_TAB', payload: { vaultId: 'v', filePath: 'c.md', fileName: 'c.md' } } },
      })
      return paneTreeReducer(tree, { type: 'FOCUS_PANE', payload: { paneId: 'p1' } })
    }

    it('moves a tab to another pane, activating it there and focusing that pane', () => {
      const tree = twoPaneTree()
      const next = paneTreeReducer(tree, {
        type: 'MOVE_TAB_TO_PANE',
        payload: { fromPaneId: 'p1', toPaneId: 'p2', tabId: 'v::c.md' },
      })
      // c.md left p1, joined p2 (appended + active); p2 is now the active pane.
      expect(findPane(next, 'p1')?.tabState.tabs.map((t) => t.id)).toEqual(['v::a.md'])
      expect(findPane(next, 'p2')?.tabState.tabs.map((t) => t.id)).toEqual(['v::b.md', 'v::c.md'])
      expect(findPane(next, 'p2')?.tabState.activeTabId).toBe('v::c.md')
      expect(next.activePaneId).toBe('p2')
    })

    it('inserts at the requested index', () => {
      const tree = twoPaneTree()
      const next = paneTreeReducer(tree, {
        type: 'MOVE_TAB_TO_PANE',
        payload: { fromPaneId: 'p1', toPaneId: 'p2', tabId: 'v::c.md', toIndex: 0 },
      })
      expect(findPane(next, 'p2')?.tabState.tabs.map((t) => t.id)).toEqual(['v::c.md', 'v::b.md'])
    })

    it('does not record the moved tab in the source closed-tabs history', () => {
      const tree = twoPaneTree()
      const next = paneTreeReducer(tree, {
        type: 'MOVE_TAB_TO_PANE',
        payload: { fromPaneId: 'p1', toPaneId: 'p2', tabId: 'v::c.md' },
      })
      expect(findPane(next, 'p1')?.tabState.closedTabsHistory).toHaveLength(0)
    })

    it('collapses the source pane when it moves its last tab away', () => {
      // p1 has only a.md; move it to p2 → p1 collapses, p2 survives.
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      tree = paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p2', action: { type: 'OPEN_TAB', payload: { vaultId: 'v', filePath: 'b.md', fileName: 'b.md' } } },
      })
      const next = paneTreeReducer(tree, {
        type: 'MOVE_TAB_TO_PANE',
        payload: { fromPaneId: 'p1', toPaneId: 'p2', tabId: 'v::a.md' },
      })
      expect(next.root.kind).toBe('pane')
      expect(findPane(next, 'p1')).toBeNull()
      expect(findPane(next, 'p2')?.tabState.tabs.map((t) => t.id)).toEqual(['v::b.md', 'v::a.md'])
      expect(next.activePaneId).toBe('p2')
    })

    it('is a no-op when source === target', () => {
      const tree = twoPaneTree()
      const next = paneTreeReducer(tree, {
        type: 'MOVE_TAB_TO_PANE',
        payload: { fromPaneId: 'p1', toPaneId: 'p1', tabId: 'v::a.md' },
      })
      expect(next).toBe(tree)
    })

    it('activates in place instead of duplicating when the tab already exists in the target', () => {
      // Both panes hold a.md (same deterministic id); move from p1 to p2.
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'SPLIT_PANE',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
      })
      tree = paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p2', action: { type: 'OPEN_TAB', payload: { vaultId: 'v', filePath: 'a.md', fileName: 'a.md' } } },
      })
      // p1 also still has a second tab so it does not collapse.
      tree = paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p1', action: { type: 'OPEN_TAB', payload: { vaultId: 'v', filePath: 'z.md', fileName: 'z.md' } } },
      })
      const next = paneTreeReducer(tree, {
        type: 'MOVE_TAB_TO_PANE',
        payload: { fromPaneId: 'p1', toPaneId: 'p2', tabId: 'v::a.md' },
      })
      // p2 keeps a single a.md (no duplicate) and makes it active.
      expect(findPane(next, 'p2')?.tabState.tabs.filter((t) => t.id === 'v::a.md')).toHaveLength(1)
      expect(findPane(next, 'p2')?.tabState.activeTabId).toBe('v::a.md')
    })
  })

  describe('SPLIT_PANE_WITH_TAB', () => {
    /** A pane with two tabs (a.md active, b.md). */
    function twoTabPane(): PaneTree {
      let tree = seededTree('p1', 'v', 'a.md')
      tree = paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p1', action: { type: 'OPEN_TAB', payload: { vaultId: 'v', filePath: 'b.md', fileName: 'b.md' } } },
      })
      return paneTreeReducer(tree, {
        type: 'PANE_TAB_ACTION',
        payload: { paneId: 'p1', action: { type: 'ACTIVATE_TAB', payload: { tabId: 'v::a.md' } } },
      })
    }

    it('MOVE mode: splits and relocates the tab into the new pane', () => {
      const tree = twoTabPane()
      const next = paneTreeReducer(tree, {
        type: 'SPLIT_PANE_WITH_TAB',
        payload: { paneId: 'p1', direction: 'vertical', newPaneId: 'p2', tabId: 'v::b.md' },
      })
      expect(next.root.kind).toBe('split')
      expect((next.root as SplitNode).direction).toBe('vertical')
      // b.md left p1, lives alone in p2 (active); p2 is active.
      expect(findPane(next, 'p1')?.tabState.tabs.map((t) => t.id)).toEqual(['v::a.md'])
      expect(findPane(next, 'p2')?.tabState.tabs.map((t) => t.id)).toEqual(['v::b.md'])
      expect(next.activePaneId).toBe('p2')
    })

    it('MOVE mode: no-op when the pane has a single tab (nothing gained)', () => {
      const tree = seededTree('p1', 'v', 'a.md')
      const next = paneTreeReducer(tree, {
        type: 'SPLIT_PANE_WITH_TAB',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2', tabId: 'v::a.md' },
      })
      expect(next).toBe(tree)
    })

    it('COPY mode: duplicates the tab into the new pane, keeping it in the source', () => {
      const tree = seededTree('p1', 'v', 'a.md')
      const next = paneTreeReducer(tree, {
        type: 'SPLIT_PANE_WITH_TAB',
        payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2', tabId: 'v::a.md', copy: true },
      })
      expect(next.root.kind).toBe('split')
      // a.md still in p1 AND copied into p2.
      expect(findPane(next, 'p1')?.tabState.tabs.map((t) => t.id)).toEqual(['v::a.md'])
      expect(findPane(next, 'p2')?.tabState.tabs.map((t) => t.id)).toEqual(['v::a.md'])
      expect(next.activePaneId).toBe('p2')
    })

    it('is a no-op when the tab is not in the pane', () => {
      const tree = twoTabPane()
      const next = paneTreeReducer(tree, {
        type: 'SPLIT_PANE_WITH_TAB',
        payload: { paneId: 'p1', direction: 'vertical', newPaneId: 'p2', tabId: 'v::nope.md' },
      })
      expect(next).toBe(tree)
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

describe('pane-tree persistence', () => {
  /** Build a two-pane split tree with one tab in each pane. */
  function twoPaneTree(): PaneTree {
    const left = createPane('p1', tabStateWith('v', 'a.md'))
    const right = createPane('p2', tabStateWith('v', 'b.md'))
    const split: SplitNode = {
      kind: 'split',
      id: 'split-1',
      direction: 'horizontal',
      children: [left, right],
      sizes: [0.6, 0.4],
    }
    return { root: split, activePaneId: 'p2' }
  }

  describe('serialize', () => {
    it('serializes structure, sizes, per-pane tabs and active pane', () => {
      const persisted = serializePaneTree(twoPaneTree())
      expect(persisted.activePaneId).toBe('p2')
      expect(persisted.root.kind).toBe('split')
      const root = persisted.root as Extract<typeof persisted.root, { kind: 'split' }>
      expect(root.direction).toBe('horizontal')
      expect(root.sizes).toEqual([0.6, 0.4])
      expect(root.children).toHaveLength(2)
      const left = root.children[0]!
      expect(left.kind).toBe('pane')
      if (left.kind === 'pane') {
        expect(left.tabs).toEqual([
          { vaultId: 'v', filePath: 'a.md', fileName: 'a.md', mode: 'edit', pinned: false },
        ])
        expect(left.activeTabId).toBe('v::a.md')
      }
    })

    it('omits content and buffers (content-free persisted shape)', () => {
      const persisted = serializePaneTree(seededTree('p1', 'v', 'a.md'))
      const json = JSON.stringify(persisted)
      expect(json).not.toContain('editBuffer')
      expect(json).not.toContain('closedTabsHistory')
      // A persisted tab carries only metadata keys.
      const root = persisted.root as Extract<typeof persisted.root, { kind: 'pane' }>
      expect(Object.keys(root.tabs[0]!).sort()).toEqual(['fileName', 'filePath', 'mode', 'pinned', 'vaultId'])
    })
  })

  describe('round-trip', () => {
    it('serialize → rehydrate preserves structure, sizes, tabs and active ids', () => {
      const persisted = serializePaneTree(twoPaneTree())
      const live = rehydratePaneTree(persisted)
      expect(live.activePaneId).toBe('p2')
      expect(live.root.kind).toBe('split')
      const split = live.root as SplitNode
      expect(split.sizes).toEqual([0.6, 0.4])
      expect(findPane(live, 'p1')?.tabState.activeTabId).toBe('v::a.md')
      expect(findPane(live, 'p2')?.tabState.activeTabId).toBe('v::b.md')
      // Re-serializing yields the same persisted shape.
      expect(serializePaneTree(live)).toEqual(persisted)
    })

    it('rehydrated tabs start in the loading state with empty content', () => {
      const live = rehydratePaneTree(serializePaneTree(seededTree('p1', 'v', 'a.md')))
      const tab = findPane(live, 'p1')!.tabState.tabs[0]!
      expect(tab.loading).toBe(true)
      expect(tab.content).toBe('')
      expect(tab.editBuffer).toBeNull()
    })

    it('normalizes sizes on rehydrate (raises a sub-minimum ratio, keeps sum 1)', () => {
      const persisted = serializePaneTree(twoPaneTree())
      const root = persisted.root as Extract<typeof persisted.root, { kind: 'split' }>
      root.sizes = [0.98, 0.02] // second child below MIN_PANE_RATIO
      const live = rehydratePaneTree(persisted)
      const split = live.root as SplitNode
      // The floor nudges the tiny child well above its raw 0.02 (soft floor
      // applied before the final rescale), and sizes always sum to 1.
      expect(split.sizes[1]!).toBeGreaterThan(0.02)
      expect(split.sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    })
  })

  describe('migration (legacy flat tabs)', () => {
    it('migrates a flat tab list into a single active pane', () => {
      const tabs: PersistedPaneTab[] = [
        { vaultId: 'v', filePath: 'a.md', fileName: 'a.md', mode: 'edit', pinned: false },
        { vaultId: 'v', filePath: 'b.md', fileName: 'b.md', mode: 'view', pinned: true },
      ]
      const persisted = migrateFlatTabsToPaneTree(tabs, 'v::b.md', 'pane-root')
      expect(persisted.activePaneId).toBe('pane-root')
      expect(persisted.root.kind).toBe('pane')
      const live = rehydratePaneTree(persisted)
      const pane = findPane(live, 'pane-root')!
      expect(pane.tabState.tabs).toHaveLength(2)
      expect(pane.tabState.activeTabId).toBe('v::b.md')
      expect(pane.tabState.tabs[1]!.pinned).toBe(true)
    })

    it('migrates an empty flat list into an empty single pane', () => {
      const persisted = migrateFlatTabsToPaneTree([], null, 'pane-root')
      const live = rehydratePaneTree(persisted)
      expect(listPanes(live)).toHaveLength(1)
      expect(getActiveTabId(live)).toBeNull()
    })
  })

  describe('lenient parse', () => {
    it('parses a well-formed persisted tree', () => {
      const persisted = serializePaneTree(twoPaneTree())
      const parsed = parsePersistedPaneTree(persisted)
      expect(parsed).not.toBeNull()
      expect(parsed!.activePaneId).toBe('p2')
    })

    it('returns null for a missing or non-object tree', () => {
      expect(parsePersistedPaneTree(undefined)).toBeNull()
      expect(parsePersistedPaneTree(null)).toBeNull()
      expect(parsePersistedPaneTree('nope')).toBeNull()
      expect(parsePersistedPaneTree({})).toBeNull()
    })

    it('drops unusable tabs but keeps the usable ones', () => {
      const parsed = parsePersistedPaneTree({
        root: {
          kind: 'pane',
          id: 'p1',
          tabs: [
            { vaultId: 'v', filePath: 'a.md', fileName: 'a.md', mode: 'edit' },
            { vaultId: 'v', filePath: 'bad', mode: 'edit' }, // missing fileName
            { foo: 'bar' }, // garbage
          ],
          activeTabId: null,
        },
        activePaneId: 'p1',
      })
      expect(parsed).not.toBeNull()
      const root = parsed!.root as Extract<typeof parsed.root, { kind: 'pane' }>
      expect(root.tabs).toHaveLength(1)
      expect(root.tabs[0]!.filePath).toBe('a.md')
    })

    it('collapses a split that loses all but one child', () => {
      const parsed = parsePersistedPaneTree({
        root: {
          kind: 'split',
          id: 'split-1',
          direction: 'horizontal',
          children: [
            { kind: 'pane', id: 'p1', tabs: [], activeTabId: null },
            { kind: 'garbage' }, // dropped
          ],
          sizes: [0.5, 0.5],
        },
        activePaneId: 'p1',
      })
      expect(parsed).not.toBeNull()
      // Split with a single surviving child collapses to that pane.
      expect(parsed!.root.kind).toBe('pane')
      expect(parsed!.root.id).toBe('p1')
    })

    it('rebuilds equal sizes when the sizes array is wrong length', () => {
      const parsed = parsePersistedPaneTree({
        root: {
          kind: 'split',
          id: 'split-1',
          direction: 'vertical',
          children: [
            { kind: 'pane', id: 'p1', tabs: [], activeTabId: null },
            { kind: 'pane', id: 'p2', tabs: [], activeTabId: null },
          ],
          sizes: [0.9], // wrong length
        },
        activePaneId: 'p1',
      })
      const root = parsed!.root as Extract<typeof parsed.root, { kind: 'split' }>
      expect(root.sizes).toEqual([0.5, 0.5])
    })

    it('falls back the active pane id to the first pane when it does not resolve', () => {
      const live = rehydratePaneTree({
        root: { kind: 'pane', id: 'p1', tabs: [], activeTabId: null },
        activePaneId: 'does-not-exist',
      })
      expect(live.activePaneId).toBe('p1')
    })
  })
})
