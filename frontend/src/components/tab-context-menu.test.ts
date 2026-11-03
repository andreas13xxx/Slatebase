import { describe, it, expect, vi } from 'vitest'
import { buildTabContextMenuItems } from './tab-context-menu'
import type { TabEntry } from '../state/tabState'

const tab = { id: 't1', filePath: 'a.md', fileName: 'a.md', pinned: false } as unknown as TabEntry

describe('tab context menu: move entries (drag alternative)', () => {
  it('omits the move entries without move options', () => {
    const ids = buildTabContextMenuItems(tab, false, vi.fn()).map((i) => i.id)
    expect(ids).not.toContain('move-left')
  })

  it('reorders by one position and disables the edges', () => {
    const dispatch = vi.fn()
    const first = buildTabContextMenuItems(tab, false, dispatch, { index: 0, otherPanes: [], moveToPane: vi.fn() })
    expect(first.find((i) => i.id === 'move-left')?.disabled).toBe(true)
    first.find((i) => i.id === 'move-right')?.run?.()
    expect(dispatch).toHaveBeenCalledWith({ type: 'REORDER_TABS', payload: { fromIndex: 0, toIndex: 1 } })

    const last = buildTabContextMenuItems(tab, true, dispatch, { index: 3, otherPanes: [], moveToPane: vi.fn() })
    expect(last.find((i) => i.id === 'move-right')?.disabled).toBe(true)
    last.find((i) => i.id === 'move-left')?.run?.()
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'REORDER_TABS', payload: { fromIndex: 3, toIndex: 2 } })
  })

  it('offers one entry per other pane', () => {
    const moveToPane = vi.fn()
    const items = buildTabContextMenuItems(tab, false, vi.fn(), { index: 0, otherPanes: [{ id: 'p2', label: 'Pane 2' }], moveToPane })
    const entry = items.find((i) => i.id === 'move-to-pane-p2')
    expect(entry?.label).toBe('In anderes Pane verschieben')
    entry?.run?.()
    expect(moveToPane).toHaveBeenCalledWith('p2')
  })
})
