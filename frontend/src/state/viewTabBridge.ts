/**
 * Bridge for opening Slatebase's own non-file tabs by Obsidian view type (`empty`, `file-recovery`).
 *
 * The callers sit outside the React tree that owns the tabs: the plugin compat layer
 * (`leaf.setViewState({ type: 'empty' })`) and the core command `workspace:new-tab`. `AppContent`
 * registers the one handler that knows how to open a tab; with no handler mounted (tests,
 * headless) the request reports `false` so the caller can fall back or log.
 */

/** A request to open a native tab view. `file` is the vault path the view is about, when it has one. */
export interface ViewTabRequest {
  type: 'empty' | 'file-recovery'
  file?: string
}

type ViewTabHandler = (request: ViewTabRequest) => boolean

let handler: ViewTabHandler | null = null

/** Register the handler that opens the tab; returns the unregister function. */
export function setViewTabHandler(next: ViewTabHandler | null): () => void {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

/** Open a native tab view. @returns `false` when no handler is mounted or it declined. */
export function requestViewTab(request: ViewTabRequest): boolean {
  return handler ? handler(request) : false
}
