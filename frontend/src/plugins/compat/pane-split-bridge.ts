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

import type { SplitDirection } from '../../state/paneTreeState'

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
