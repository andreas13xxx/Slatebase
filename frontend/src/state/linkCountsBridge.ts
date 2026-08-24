/**
 * Bridges the active document's forward/backlink counts (already computed by
 * `useDocumentPanelData` in App.tsx for the Links panel) to the status bar,
 * without threading new props through `<StatusBar>` — every other built-in
 * status bar item is a self-contained component reading its own hook/context
 * (see VaultNameItem/WordStatsItem in StatusBar.tsx), not prop-driven, so
 * this keeps the same shape rather than being the one exception.
 *
 * @module linkCountsBridge
 */
export interface LinkCounts {
  forward: number
  backlinks: number
  /** True while the backend backlinks fetch is still in flight for the current document. */
  backlinksLoading: boolean
}

type Listener = (counts: LinkCounts | null) => void

let current: LinkCounts | null = null
const listeners = new Set<Listener>()

/** Called by App.tsx whenever the active document's link counts change (or `null` when no document is open). */
export function publishLinkCounts(counts: LinkCounts | null): void {
  current = counts
  for (const listener of listeners) listener(counts)
}

export function getLinkCounts(): LinkCounts | null {
  return current
}

export function subscribeLinkCounts(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
