/**
 * PaneSplitBridge — module-level bridge letting the plugin workspace shim
 * request a REAL pane split from the pane tree.
 *
 * Problem: `WorkspaceShim.createLeafBySplit()` / `splitActiveLeaf()` /
 * `getLeaf('split')` must produce an actual split pane, but the shim has no
 * access to React context (`paneTreeDispatch` lives in `PaneTreeProvider`).
 * This bridge is the same module-level `Set<Callback>` pattern as
 * `tab-view-bridge.ts` / `realtimeVaultBridge.ts`.
 *
 * Flow: the shim calls `requestPaneSplit(direction)`; the listener (wired in
 * `AppContent`, which holds `paneTreeDispatch`) splits the ACTIVE pane, making
 * the freshly-created empty pane the active one. The plugin's subsequent
 * `leaf.setViewState(...)` opens its view as a tab, which the `useTabContext`
 * bridge routes into whichever pane is active — now the new one. The split and
 * the view therefore land together, with no direct coupling between the shim
 * and the pane reducer.
 *
 * @module pane-split-bridge
 */

import type { PaneTree, SplitDirection } from '../../state/paneTreeState'

/** Callback invoked when the plugin shim requests a pane split. */
export type RequestPaneSplitFn = (direction: SplitDirection) => void

const splitSubscribers: Set<RequestPaneSplitFn> = new Set()

/**
 * Subscribe to pane-split requests. Called by the component that owns
 * `paneTreeDispatch` (AppContent) on mount.
 */
export function onRequestPaneSplit(fn: RequestPaneSplitFn): void {
  splitSubscribers.add(fn)
}

/** Unsubscribe from pane-split requests. Called on unmount. */
export function offRequestPaneSplit(fn: RequestPaneSplitFn): void {
  splitSubscribers.delete(fn)
}

/**
 * Request a split of the active pane in the given direction. Called by the
 * workspace shim's `createLeafBySplit`/`splitActiveLeaf`. A no-op when no
 * listener is mounted (e.g. unit tests exercising the shim in isolation), so
 * the shim falls back to opening a plain tab — exactly its pre-Phase-5
 * behaviour.
 *
 * @returns true if at least one listener handled it (a real split happened).
 */
export function requestPaneSplit(direction: SplitDirection): boolean {
  if (splitSubscribers.size === 0) return false
  for (const fn of splitSubscribers) {
    fn(direction)
  }
  return true
}

// ─── Layout snapshot (pane tree → plugin layout tree) ────────────────────────
//
// The reverse direction: the owner of the pane tree publishes every new tree,
// so the workspace shim can mirror it into `rootSplit.children` /
// `leaf.parent` / `getLayout()`. The latest tree is kept, so a shim created
// after the last change (vault switch) can still read it.

/** Callback invoked whenever a new pane tree is published. */
export type PaneLayoutListener = (tree: PaneTree) => void

let latestPaneTree: PaneTree | null = null
const layoutSubscribers: Set<PaneLayoutListener> = new Set()

/** Publish the current pane tree. Called by the component that owns it (AppContent). */
export function publishPaneLayout(tree: PaneTree): void {
  latestPaneTree = tree
  for (const fn of layoutSubscribers) fn(tree)
}

/** The most recently published pane tree, or null before the first publish. */
export function getPaneLayout(): PaneTree | null {
  return latestPaneTree
}

/** Subscribe to pane-tree changes. @returns an unsubscribe function. */
export function onPaneLayoutChange(fn: PaneLayoutListener): () => void {
  layoutSubscribers.add(fn)
  return () => { layoutSubscribers.delete(fn) }
}

/** Reset the published tree (tests only). */
export function resetPaneLayoutForTests(): void {
  latestPaneTree = null
  layoutSubscribers.clear()
}
