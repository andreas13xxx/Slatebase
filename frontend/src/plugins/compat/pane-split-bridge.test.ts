import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  onRequestPaneSplit,
  offRequestPaneSplit,
  requestPaneSplit,
  type RequestPaneSplitFn,
} from './pane-split-bridge'
import { WorkspaceShim } from './shims/workspace-shim'
import { ViewRegistry } from './view-registry'
import { resetLogDedup } from './log'
import { clearApiGaps } from './api-gap-registry'
import type { SplitDirection } from '../../state/paneTreeState'

describe('pane-split-bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requestPaneSplit returns false and does nothing with no listener', () => {
    expect(requestPaneSplit('horizontal')).toBe(false)
  })

  it('delivers the direction to a subscribed listener and returns true', () => {
    const received: SplitDirection[] = []
    const fn: RequestPaneSplitFn = (d) => { received.push(d) }
    onRequestPaneSplit(fn)
    try {
      expect(requestPaneSplit('vertical')).toBe(true)
      expect(received).toEqual(['vertical'])
    } finally {
      offRequestPaneSplit(fn)
    }
  })

  it('stops delivering after unsubscribe', () => {
    const fn = vi.fn()
    onRequestPaneSplit(fn)
    offRequestPaneSplit(fn)
    expect(requestPaneSplit('horizontal')).toBe(false)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('WorkspaceShim — real pane splits (Phase 5)', () => {
  let workspace: WorkspaceShim
  let listener: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clearApiGaps()
    resetLogDedup()
    workspace = new WorkspaceShim()
    workspace.setViewRegistry(new ViewRegistry(), {})
    listener = vi.fn()
    onRequestPaneSplit(listener)
  })

  afterEach(() => {
    offRequestPaneSplit(listener)
  })

  it('createLeafBySplit requests a split and returns a usable leaf', () => {
    const base = workspace.getLeaf(true)
    const leaf = workspace.createLeafBySplit(base)
    expect(leaf).toBeTruthy()
    expect(leaf.view).toBeTruthy() // stubbed empty view
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("maps Obsidian 'vertical' (side-by-side divider) to our 'horizontal' layout", () => {
    workspace.createLeafBySplit(workspace.getLeaf(true), 'vertical')
    expect(listener).toHaveBeenCalledWith('horizontal')
  })

  it("maps Obsidian 'horizontal' (stacked divider) to our 'vertical' layout", () => {
    workspace.createLeafBySplit(workspace.getLeaf(true), 'horizontal')
    expect(listener).toHaveBeenCalledWith('vertical')
  })

  it('splitActiveLeaf defaults to a side-by-side split (our horizontal)', () => {
    workspace.splitActiveLeaf()
    expect(listener).toHaveBeenCalledWith('horizontal')
  })

  it("getLeaf('split') requests a side-by-side split and returns a leaf", () => {
    const leaf = workspace.getLeaf('split')
    expect(leaf).toBeTruthy()
    expect(listener).toHaveBeenCalledWith('horizontal')
  })

  it("getLeaf('tab') and getLeaf(true) do NOT request a split", () => {
    workspace.getLeaf('tab')
    workspace.getLeaf(true)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('WorkspaceShim — split fallback with no pane host', () => {
  beforeEach(() => {
    clearApiGaps()
    resetLogDedup()
  })

  it('createLeafBySplit falls back to a plain new tab (no listener mounted)', () => {
    const workspace = new WorkspaceShim()
    workspace.setViewRegistry(new ViewRegistry(), {})
    // No onRequestPaneSplit subscriber → requestPaneSplit returns false.
    const leaf = workspace.createLeafBySplit(workspace.getLeaf(true))
    expect(leaf).toBeTruthy()
    expect(leaf.view).toBeTruthy()
  })
})
