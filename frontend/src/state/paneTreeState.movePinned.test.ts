import { describe, it, expect } from 'vitest'
import { paneTreeReducer, type PaneTree, type PaneNode } from './paneTreeState'
import type { TabEntry } from './tabState'

function tab(name: string, pinned: boolean): TabEntry {
  return { id: name, vaultId: 'v', filePath: name, fileName: name, mode: 'live-preview', lastEditMode: 'live-preview', isBinary: false, content: '', editBuffer: null, loading: false, error: null, pinned } as unknown as TabEntry
}
function pane(id: string, tabs: TabEntry[]): PaneNode {
  return { kind: 'pane', id, tabState: { tabs, activeTabId: tabs[0]?.id ?? null, closedTabsHistory: [] } } as unknown as PaneNode
}

describe('MOVE_TAB_TO_PANE and the pinned boundary', () => {
  const tree = { activePaneId: 'a', root: { kind: 'split', id: 's', direction: 'row', ratios: [0.5, 0.5], children: [pane('a', [tab('x', true), tab('y', false)]), pane('b', [tab('p', true), tab('q', false)])] } } as unknown as PaneTree
  const idsOf = (t: PaneTree, id: string) => {
    const root = t.root as unknown as { children: PaneNode[] }
    return (root.children.find((c) => c.id === id) as unknown as { tabState: { tabs: TabEntry[] } }).tabState.tabs.map((x) => x.id).join(',')
  }

  it('puts a pinned tab dropped behind unpinned ones into the pinned group', () => {
    const next = paneTreeReducer(tree, { type: 'MOVE_TAB_TO_PANE', payload: { fromPaneId: 'a', toPaneId: 'b', tabId: 'x', toIndex: 2 } })
    expect(idsOf(next, 'b')).toBe('p,x,q')
  })
  it('puts an unpinned tab dropped in front of pinned ones behind them', () => {
    const next = paneTreeReducer(tree, { type: 'MOVE_TAB_TO_PANE', payload: { fromPaneId: 'a', toPaneId: 'b', tabId: 'y', toIndex: 0 } })
    expect(idsOf(next, 'b')).toBe('p,y,q')
  })
})
