import { describe, it, expect, vi } from 'vitest'
import { buildTabContextMenuItems } from './tab-context-menu'
import type { TabEntry } from '../state/tabState'

const tab = { id: 't1', filePath: 'a.md', fileName: 'a.md', pinned: false } as unknown as TabEntry
const pinned = { ...tab, id: 'p', pinned: true } as TabEntry
const labels = { left: 'Nach links', right: 'Nach rechts', otherPane: 'In anderes Pane', pane: (n: number) => `In Pane ${n}` }

describe('tab context menu: move entries (drag alternative)', () => {
  it('omits the move entries without move options', () => {
    const ids = buildTabContextMenuItems(tab, false, vi.fn()).map((i) => i.id)
    expect(ids).not.toContain('move-left')
  })

  it('reorders by one position and disables the edges', () => {
    const dispatch = vi.fn()
    const first = buildTabContextMenuItems(tab, false, dispatch, { index: 0, labels, otherPanes: [], moveToPane: vi.fn() })
    expect(first.find((i) => i.id === 'move-left')?.disabled).toBe(true)
    first.find((i) => i.id === 'move-right')?.run?.()
    expect(dispatch).toHaveBeenCalledWith({ type: 'REORDER_TABS', payload: { fromIndex: 0, toIndex: 1 } })

    const last = buildTabContextMenuItems(tab, true, dispatch, { index: 3, labels, otherPanes: [], moveToPane: vi.fn() })
    expect(last.find((i) => i.id === 'move-right')?.disabled).toBe(true)
    last.find((i) => i.id === 'move-left')?.run?.()
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'REORDER_TABS', payload: { fromIndex: 3, toIndex: 2 } })
  })

  it('offers one entry per other pane', () => {
    const moveToPane = vi.fn()
    const items = buildTabContextMenuItems(tab, false, vi.fn(), { index: 0, labels, otherPanes: [{ id: 'p2', number: 2 }], moveToPane })
    const entry = items.find((i) => i.id === 'move-to-pane-p2')
    expect(entry?.label).toBe('In anderes Pane')
    entry?.run?.()
    expect(moveToPane).toHaveBeenCalledWith('p2')
  })

  it('does not move an unpinned tab in front of a pinned one, nor a pinned tab behind an unpinned one', () => {
    const left = buildTabContextMenuItems(tab, false, vi.fn(), { index: 1, prev: pinned, next: tab, labels, otherPanes: [], moveToPane: vi.fn() })
    expect(left.find((i) => i.id === 'move-left')?.disabled).toBe(true)
    const right = buildTabContextMenuItems(pinned, false, vi.fn(), { index: 0, prev: undefined, next: tab, labels, otherPanes: [], moveToPane: vi.fn() })
    expect(right.find((i) => i.id === 'move-right')?.disabled).toBe(true)
  })

  it('names the target pane when there are several', () => {
    const items = buildTabContextMenuItems(tab, false, vi.fn(), { index: 0, labels, otherPanes: [{ id: 'p2', number: 2 }, { id: 'p3', number: 3 }], moveToPane: vi.fn() })
    expect(items.find((i) => i.id === 'move-to-pane-p3')?.label).toBe('In Pane 3')
  })
})
