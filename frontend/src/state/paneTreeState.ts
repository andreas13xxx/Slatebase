/**
 * Pane-tree layout state — the data structure behind Split Panes.
 *
 * Replaces the flat single-tab-row assumption with a nestable tree: leaves are
 * panes (each wrapping the EXISTING `TabState` + `tabReducer`, unchanged), inner
 * nodes are splits with a direction and ratio-weighted children. Exactly one
 * pane is active; the global "active tab" is derived from the active pane.
 *
 * This module is pure (no React, no DOM) and delegates every tab-level change to
 * the existing `tabReducer`, so the large body of tab logic (pinning, close-
 * others, undo-close, path updates) is reused rather than rewritten.
 *
 * @module state/paneTreeState
 */

import {
  tabReducer,
  initialTabState,
  type TabState,
  type TabAction,
} from './tabState'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Split orientation: `horizontal` = panes side by side, `vertical` = stacked. */
export type SplitDirection = 'horizontal' | 'vertical'

/** A leaf node: one independent tab row (the existing TabState). */
export interface PaneNode {
  kind: 'pane'
  /** Stable pane id. */
  id: string
  /** The pane's own tab state (reuses the existing tab reducer). */
  tabState: TabState
}

/** An inner node: a split with a direction and ratio-weighted children. */
export interface SplitNode {
  kind: 'split'
  id: string
  direction: SplitDirection
  /** Two or more children (panes or nested splits). */
  children: PaneTreeNode[]
  /** Child size ratios, one per child, summing to 1. */
  sizes: number[]
}

/** A node in the pane tree. */
export type PaneTreeNode = PaneNode | SplitNode

/** The full pane-tree layout. */
export interface PaneTree {
  root: PaneTreeNode
  /** The id of the single active pane. */
  activePaneId: string
}

/** Smallest ratio a pane may occupy within its split (resize + normalization floor). */
export const MIN_PANE_RATIO = 0.1

// ─── Actions ───────────────────────────────────────────────────────────────────

/** Discriminated union of pane-tree layout actions. */
export type PaneTreeAction =
  /** Split the given pane in a direction; the new empty pane becomes active. */
  | { type: 'SPLIT_PANE'; payload: { paneId: string; direction: SplitDirection; newPaneId: string } }
  /** Close a pane (and collapse its split); the last remaining pane stays, empty. */
  | { type: 'CLOSE_PANE'; payload: { paneId: string } }
  /** Make a pane the active pane. */
  | { type: 'FOCUS_PANE'; payload: { paneId: string } }
  /** Resize two adjacent children of a split by setting the first child's ratio. */
  | { type: 'RESIZE_SPLIT'; payload: { splitId: string; childIndex: number; ratio: number } }
  /**
   * Dispatch a tab action to a specific pane's tab state. The pane-tree reducer
   * delegates to the existing `tabReducer`; if the action empties the pane, the
   * pane is collapsed (unless it is the last one).
   */
  | { type: 'PANE_TAB_ACTION'; payload: { paneId: string; action: TabAction } }

// ─── Helpers (pure) ──────────────────────────────────────────────────────────

/** Create a fresh empty pane. */
export function createPane(id: string, tabState: TabState = initialTabState): PaneNode {
  return { kind: 'pane', id, tabState }
}

/** Initial single-pane tree. */
export function createInitialPaneTree(paneId: string): PaneTree {
  return { root: createPane(paneId), activePaneId: paneId }
}

/** Find a pane node by id anywhere in the tree. */
export function findPane(tree: PaneTree, paneId: string): PaneNode | null {
  return findPaneIn(tree.root, paneId)
}

function findPaneIn(node: PaneTreeNode, paneId: string): PaneNode | null {
  if (node.kind === 'pane') return node.id === paneId ? node : null
  for (const child of node.children) {
    const found = findPaneIn(child, paneId)
    if (found) return found
  }
  return null
}

/** The active pane's tab state, or null if the active id does not resolve. */
export function getActivePaneTabState(tree: PaneTree): TabState | null {
  return findPane(tree, tree.activePaneId)?.tabState ?? null
}

/** The derived global active tab id (active pane's active tab). */
export function getActiveTabId(tree: PaneTree): string | null {
  return getActivePaneTabState(tree)?.activeTabId ?? null
}

/** List every pane in document order (left-to-right, depth-first). */
export function listPanes(tree: PaneTree): PaneNode[] {
  const out: PaneNode[] = []
  const walk = (node: PaneTreeNode): void => {
    if (node.kind === 'pane') out.push(node)
    else node.children.forEach(walk)
  }
  walk(tree.root)
  return out
}

/**
 * Normalize a split's `sizes` so they sum to 1 and none drops below the floor.
 * Keeps the relative proportions of the non-floored children.
 */
function normalizeSizes(sizes: number[]): number[] {
  const n = sizes.length
  if (n === 0) return []
  // Replace non-finite / non-positive with an equal share, then rescale.
  const cleaned = sizes.map((s) => (Number.isFinite(s) && s > 0 ? s : 1 / n))
  const sum = cleaned.reduce((a, b) => a + b, 0)
  const scaled = cleaned.map((s) => s / sum)
  // Enforce the minimum ratio; redistribute the deficit across the others.
  const floored = scaled.map((s) => Math.max(s, MIN_PANE_RATIO))
  const flooredSum = floored.reduce((a, b) => a + b, 0)
  return floored.map((s) => s / flooredSum)
}

/**
 * Map every node in the tree, replacing nodes the mapper returns a new value
 * for. The mapper returns `null` to signal "remove this node" (used by collapse).
 */
function mapTree(node: PaneTreeNode, fn: (pane: PaneNode) => PaneTreeNode): PaneTreeNode {
  if (node.kind === 'pane') return fn(node)
  return { ...node, children: node.children.map((c) => mapTree(c, fn)) }
}

/**
 * Remove a pane by id, collapsing a split that drops to a single child (the
 * surviving child takes the split's place). Returns the new root, or the
 * unchanged root if the pane was the only node (last pane stays, empty).
 */
function removePane(root: PaneTreeNode, paneId: string): PaneTreeNode {
  if (root.kind === 'pane') return root // last pane: never removed here

  const remove = (node: SplitNode): PaneTreeNode => {
    const kept: PaneTreeNode[] = []
    const keptSizes: number[] = []
    node.children.forEach((child, i) => {
      if (child.kind === 'pane' && child.id === paneId) return // drop it
      const mapped = child.kind === 'split' ? remove(child) : child
      kept.push(mapped)
      keptSizes.push(node.sizes[i] ?? 1 / node.children.length)
    })
    if (kept.length === 1) return kept[0]! // collapse: child replaces split
    return { ...node, children: kept, sizes: normalizeSizes(keptSizes) }
  }

  return remove(root)
}

/** Pick a sensible new active pane after the active one was removed. */
function firstPaneId(node: PaneTreeNode): string {
  let n: PaneTreeNode = node
  while (n.kind === 'split') n = n.children[0]!
  return n.id
}

// ─── Reducer (pure) ──────────────────────────────────────────────────────────

/** Pure reducer for all pane-tree layout transitions. */
export function paneTreeReducer(state: PaneTree, action: PaneTreeAction): PaneTree {
  switch (action.type) {
    case 'FOCUS_PANE': {
      if (!findPane(state, action.payload.paneId)) return state
      if (state.activePaneId === action.payload.paneId) return state
      return { ...state, activePaneId: action.payload.paneId }
    }

    case 'SPLIT_PANE': {
      const { paneId, direction, newPaneId } = action.payload
      const target = findPane(state, paneId)
      if (!target) return state
      const newPane = createPane(newPaneId)

      // Replace the target pane with a split of [target, newPane].
      const root = mapTree(state.root, (pane) => {
        if (pane.id !== paneId) return pane
        const split: SplitNode = {
          kind: 'split',
          id: `split-${newPaneId}`,
          direction,
          children: [pane, newPane],
          sizes: [0.5, 0.5],
        }
        return split
      })
      return { root, activePaneId: newPaneId }
    }

    case 'CLOSE_PANE': {
      const { paneId } = action.payload
      // Last pane: keep it, just clear its tabs (handled by tab actions elsewhere).
      if (state.root.kind === 'pane') return state
      if (!findPane(state, paneId)) return state

      const root = removePane(state.root, paneId)
      const activePaneId =
        state.activePaneId === paneId ? firstPaneId(root) : state.activePaneId
      return { root, activePaneId }
    }

    case 'RESIZE_SPLIT': {
      const { splitId, childIndex, ratio } = action.payload
      const root = resizeSplit(state.root, splitId, childIndex, ratio)
      return root === state.root ? state : { ...state, root }
    }

    case 'PANE_TAB_ACTION': {
      const { paneId, action: tabAction } = action.payload
      const target = findPane(state, paneId)
      if (!target) return state

      const nextTabState = tabReducer(target.tabState, tabAction)
      let root = mapTree(state.root, (pane) =>
        pane.id === paneId ? { ...pane, tabState: nextTabState } : pane,
      )

      // Collapse an emptied pane (unless it is the last one).
      let activePaneId = state.activePaneId
      if (nextTabState.tabs.length === 0 && root.kind === 'split') {
        root = removePane(root, paneId)
        if (activePaneId === paneId) activePaneId = firstPaneId(root)
      }
      return { root, activePaneId }
    }

    default:
      return state
  }
}

/** Set child `childIndex`'s ratio within the split `splitId`, rebalancing. */
function resizeSplit(
  node: PaneTreeNode,
  splitId: string,
  childIndex: number,
  ratio: number,
): PaneTreeNode {
  if (node.kind === 'pane') return node
  if (node.id === splitId) {
    if (childIndex < 0 || childIndex >= node.sizes.length) return node
    const clamped = Math.min(Math.max(ratio, MIN_PANE_RATIO), 1 - MIN_PANE_RATIO)
    // Distribute the remaining space across the other children proportionally.
    const others = node.sizes.filter((_, i) => i !== childIndex)
    const othersSum = others.reduce((a, b) => a + b, 0) || 1
    const remaining = 1 - clamped
    const sizes = node.sizes.map((s, i) =>
      i === childIndex ? clamped : (s / othersSum) * remaining,
    )
    return { ...node, sizes: normalizeSizes(sizes) }
  }
  return { ...node, children: node.children.map((c) => resizeSplit(c, splitId, childIndex, ratio)) }
}
