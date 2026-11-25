import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WorkspaceFloating,
  WorkspaceMobileDrawer,
  WorkspaceParent,
  WorkspaceRibbon,
  WorkspaceSidedock,
  WorkspaceWindow,
  WorkspaceContainer,
} from './view-registry'
import { setSidedockController, type SidedockSide } from './sidedock-bridge'
import { resetLogDedup } from './log'

function mountHost(initial: Record<SidedockSide, boolean>) {
  const collapsed = { ...initial }
  const toggle = vi.fn((side: SidedockSide) => { collapsed[side] = !collapsed[side] })
  setSidedockController({ isCollapsed: (side) => collapsed[side], toggle })
  return { collapsed, toggle }
}

afterEach(() => {
  setSidedockController(null)
  resetLogDedup()
  vi.restoreAllMocks()
})

describe('WorkspaceSidedock', () => {
  it('reflects the real panel state per side', () => {
    mountHost({ left: false, right: true })
    expect(new WorkspaceSidedock('left').collapsed).toBe(false)
    expect(new WorkspaceSidedock('right').collapsed).toBe(true)
  })

  it('collapse/expand toggle only when the state differs', () => {
    const host = mountHost({ left: false, right: false })
    const dock = new WorkspaceSidedock('left')
    dock.expand()
    expect(host.toggle).not.toHaveBeenCalled()
    dock.collapse()
    expect(host.toggle).toHaveBeenCalledWith('left')
    expect(dock.collapsed).toBe(true)
    dock.collapse()
    expect(host.toggle).toHaveBeenCalledTimes(1)
    dock.toggle()
    expect(dock.collapsed).toBe(false)
  })

  it('reports "expanded" and logs once when no host is mounted', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const dock = new WorkspaceSidedock('right')
    expect(dock.collapsed).toBe(false)
    dock.collapse()
    dock.toggle()
    expect(debug).toHaveBeenCalledTimes(1)
  })
})

describe('layout classes', () => {
  it('WorkspaceMobileDrawer controls the same panel as the sidedock', () => {
    const host = mountHost({ left: false, right: false })
    const drawer = new WorkspaceMobileDrawer('right')
    drawer.collapse()
    expect(host.toggle).toHaveBeenCalledWith('right')
    expect(drawer.collapsed).toBe(true)
    expect(drawer).toBeInstanceOf(WorkspaceParent)
  })

  it('WorkspaceFloating and WorkspaceWindow keep the d.ts ancestry', () => {
    expect(new WorkspaceFloating()).toBeInstanceOf(WorkspaceParent)
    expect(new WorkspaceWindow()).toBeInstanceOf(WorkspaceContainer)
  })

  it('WorkspaceRibbon has an iterable item list and an onChange hook', () => {
    const ribbon = new WorkspaceRibbon()
    expect([...ribbon.items]).toEqual([])
    expect(() => ribbon.onChange(true)).not.toThrow()
  })
})
