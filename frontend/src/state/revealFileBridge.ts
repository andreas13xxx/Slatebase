/**
 * Bridge for the `slatebase:reveal-file` event. FileExplorer only mounts (and
 * attaches its listener) while its own tab is the active view of its panel
 * section. A caller that just switched the panel to 'explorer' (see
 * `setPanelView` in core-commands-app.ts and the auto-reveal effect in App.tsx)
 * dispatches this event before React has finished re-rendering and mounting
 * FileExplorer's listener — a plain `window.dispatchEvent` right after the
 * panel-switch state update is a race FileExplorer always loses.
 *
 * `requestReveal` stores the request module-scope (not React state, so it
 * survives outside any component's lifecycle) in addition to dispatching the
 * live event, so FileExplorer can also pick it up once on mount via
 * `consumePendingReveal`, regardless of whether it was already mounted when
 * the request was made.
 */
export interface RevealRequest {
  path: string
  kind: 'file' | 'folder'
}

let pendingReveal: RevealRequest | null = null

export function requestReveal(path: string, kind: 'file' | 'folder' = 'file'): void {
  pendingReveal = { path, kind }
  window.dispatchEvent(new CustomEvent('slatebase:reveal-file', { detail: { path, kind } }))
}

export function consumePendingReveal(): RevealRequest | null {
  const request = pendingReveal
  pendingReveal = null
  return request
}
