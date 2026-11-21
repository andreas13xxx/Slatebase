import { describe, it, expect } from 'vitest'
import { tabReducer, initialTabState, type TabEntry } from './tabState'

function tab(name: string, pinned: boolean): TabEntry {
  return { id: name, vaultId: 'v', filePath: name, fileName: name, mode: 'live-preview', lastEditMode: 'live-preview', isBinary: false, content: '', editBuffer: null, loading: false, error: null, pinned } as unknown as TabEntry
}

const state = { ...initialTabState, tabs: [tab('p1', true), tab('p2', true), tab('a', false), tab('b', false)], activeTabId: 'a' }
const ids = (s: typeof state) => s.tabs.map((t) => t.id).join(',')

describe('REORDER_TABS and the pinned boundary', () => {
  it('keeps a pinned tab in front of unpinned ones', () => {
    const next = tabReducer(state, { type: 'REORDER_TABS', payload: { fromIndex: 0, toIndex: 3 } })
    expect(ids(next)).toBe('p2,p1,a,b')
  })
  it('keeps an unpinned tab behind pinned ones', () => {
    const next = tabReducer(state, { type: 'REORDER_TABS', payload: { fromIndex: 3, toIndex: 0 } })
    expect(ids(next)).toBe('p1,p2,b,a')
  })
  it('still reorders within a group', () => {
    expect(ids(tabReducer(state, { type: 'REORDER_TABS', payload: { fromIndex: 2, toIndex: 3 } }))).toBe('p1,p2,b,a')
    expect(ids(tabReducer(state, { type: 'REORDER_TABS', payload: { fromIndex: 1, toIndex: 0 } }))).toBe('p2,p1,a,b')
  })
})
