import { describe, it, expect } from 'vitest'
import { buildLayoutJson, mirrorPaneTree, paneLayoutSignature, viewTypeForTab } from './pane-layout'
import { ViewRegistry, WorkspaceRoot, WorkspaceSplit, WorkspaceTabs, type WorkspaceLeaf } from './view-registry'
import type { PaneTree } from '../../state/paneTreeState'
import type { TabEntry, TabState } from '../../state/tabState'

function tab(id: string, filePath: string, extra: Partial<TabEntry> = {}): TabEntry {
  return {
    id, vaultId: 'v', filePath, fileName: filePath, mode: 'edit', isBinary: false,
    content: '', editBuffer: null, loading: false, error: null, pinned: false, ...extra,
  }
}

function tabs(entries: TabEntry[], activeTabId: string | null): TabState {
  return { tabs: entries, activeTabId, closedTabsHistory: [] }
}

/** Two panes side by side: left has a note + a plugin view, right has a canvas. */
function sideBySide(): PaneTree {
  return {
    activePaneId: 'left',
    root: {
      kind: 'split', id: 's1', direction: 'horizontal', sizes: [0.5, 0.5],
      children: [
        { kind: 'pane', id: 'left', tabState: tabs([tab('t1', 'Note.md'), tab('t2', '__view::kanban')], 't2') },
        { kind: 'pane', id: 'right', tabState: tabs([tab('t3', 'Board.canvas', { pinned: true })], 't3') },
      ],
    },
  }
}

describe('mirrorPaneTree', () => {
  it('builds split/tabs nodes with Obsidian directions and parent links', () => {
    const root = new WorkspaceRoot()
    mirrorPaneTree(root, sideBySide(), () => null, new Set())

    expect(root.direction).toBe('vertical') // side by side = vertical divider
    expect(root.children).toHaveLength(2)
    const [left, right] = root.children
    expect(left).toBeInstanceOf(WorkspaceTabs)
    expect(right).toBeInstanceOf(WorkspaceTabs)
    expect(left?.parent).toBe(root)
    expect(left?.getRoot()).toBe(root)
    expect(left?.getContainer()).toBe(root)
  })

  it('nests splits and maps stacked panes to a horizontal divider', () => {
    const tree: PaneTree = {
      activePaneId: 'a',
      root: {
        kind: 'split', id: 's1', direction: 'horizontal', sizes: [0.5, 0.5],
        children: [
          { kind: 'pane', id: 'a', tabState: tabs([], null) },
          {
            kind: 'split', id: 's2', direction: 'vertical', sizes: [0.5, 0.5],
            children: [
              { kind: 'pane', id: 'b', tabState: tabs([], null) },
              { kind: 'pane', id: 'c', tabState: tabs([], null) },
            ],
          },
        ],
      },
    }
    const root = new WorkspaceRoot()
    mirrorPaneTree(root, tree, () => null, new Set())

    const nested = root.children[1] as WorkspaceSplit
    expect(nested).toBeInstanceOf(WorkspaceSplit)
    expect(nested.direction).toBe('horizontal')
    expect(nested.children).toHaveLength(2)
    expect(nested.children[0]?.getRoot()).toBe(root)
  })

  it('puts resolved leaves into their tab group and tracks the current tab', () => {
    const registry = new ViewRegistry()
    const viewLeaf = registry.createLeaf({}, 'main')
    const root = new WorkspaceRoot()
    const placed = mirrorPaneTree(root, sideBySide(), (t) => (t.filePath === '__view::kanban' ? viewLeaf : null), new Set())

    const left = root.children[0] as WorkspaceTabs
    expect(left.children).toEqual([viewLeaf])
    expect(left.currentTab).toBe(0)
    expect(viewLeaf.parent).toBe(left)
    expect(placed.has(viewLeaf)).toBe(true)
  })

  it('clears the parent of a leaf whose tab was closed', () => {
    const registry = new ViewRegistry()
    const viewLeaf: WorkspaceLeaf = registry.createLeaf({}, 'main')
    const root = new WorkspaceRoot()
    const placed = mirrorPaneTree(root, sideBySide(), (t) => (t.filePath === '__view::kanban' ? viewLeaf : null), new Set())

    const closed: PaneTree = { activePaneId: 'p', root: { kind: 'pane', id: 'p', tabState: tabs([tab('t1', 'Note.md')], 't1') } }
    mirrorPaneTree(root, closed, () => null, placed)

    expect(viewLeaf.parent).toBeNull()
    expect(root.children).toHaveLength(1)
    expect(root.children[0]).toBeInstanceOf(WorkspaceTabs)
  })
})

describe('buildLayoutJson', () => {
  it('lists every tab as a leaf with its view type and file', () => {
    const layout = buildLayoutJson(sideBySide()) as { main: Record<string, unknown>; active: string }
    expect(layout.active).toBe('t2')
    expect(layout.main).toMatchObject({
      type: 'split',
      direction: 'vertical',
      children: [
        {
          type: 'tabs',
          currentTab: 1,
          children: [
            { id: 't1', type: 'leaf', state: { type: 'markdown', state: { file: 'Note.md', mode: 'source' } } },
            { id: 't2', type: 'leaf', state: { type: 'kanban', state: {} } },
          ],
        },
        { type: 'tabs', currentTab: 0, children: [{ id: 't3', type: 'leaf', pinned: true, state: { type: 'canvas' } }] },
      ],
    })
  })

  it('emits currentTab even when the active tab is index 0 (Obsidian always carries it)', () => {
    // Regression: dropping currentTab at index 0 made "active = first tab"
    // indistinguishable from "no selection" for a layout-reading plugin.
    const tree: PaneTree = {
      activePaneId: 'p',
      root: { kind: 'pane', id: 'p', tabState: tabs([tab('t1', 'A.md'), tab('t2', 'B.md')], 't1') },
    }
    const layout = buildLayoutJson(tree) as { main: { children: Array<{ currentTab?: number }> } }
    expect(layout.main.children[0]?.currentTab).toBe(0)
  })

  it('omits currentTab only for a pane with no tabs at all', () => {
    const tree: PaneTree = { activePaneId: 'p', root: { kind: 'pane', id: 'p', tabState: tabs([], null) } }
    const layout = buildLayoutJson(tree) as { main: { children: Array<Record<string, unknown>> } }
    expect(layout.main.children[0]).not.toHaveProperty('currentTab')
  })

  it('wraps a single pane in a split, as Obsidian does', () => {
    const single: PaneTree = { activePaneId: 'p', root: { kind: 'pane', id: 'p', tabState: tabs([], null) } }
    const layout = buildLayoutJson(single) as { main: { type: string; children: Array<{ type: string }> } }
    expect(layout.main.type).toBe('split')
    expect(layout.main.children[0]?.type).toBe('tabs')
  })
})

describe('paneLayoutSignature', () => {
  it('ignores tab content and the active tab, but not structure', () => {
    const a = sideBySide()
    const edited = sideBySide()
    const leftPane = (edited.root as { children: Array<{ tabState: TabState }> }).children[0]!
    leftPane.tabState = { ...leftPane.tabState, activeTabId: 't1', tabs: leftPane.tabState.tabs.map((t) => ({ ...t, editBuffer: 'x' })) }
    expect(paneLayoutSignature(edited)).toBe(paneLayoutSignature(a))

    const single: PaneTree = { activePaneId: 'left', root: { kind: 'pane', id: 'left', tabState: tabs([], null) } }
    expect(paneLayoutSignature(single)).not.toBe(paneLayoutSignature(a))
  })
})

describe('viewTypeForTab', () => {
  it('maps file extensions and plugin views to Obsidian view types', () => {
    expect(viewTypeForTab({ filePath: 'a.md' })).toBe('markdown')
    expect(viewTypeForTab({ filePath: 'b.base' })).toBe('bases')
    expect(viewTypeForTab({ filePath: 'c.PNG' })).toBe('image')
    expect(viewTypeForTab({ filePath: 'd.pdf' })).toBe('pdf')
    expect(viewTypeForTab({ filePath: '__graph__' })).toBe('graph')
    expect(viewTypeForTab({ filePath: '__view::calendar' })).toBe('calendar')
  })
})
