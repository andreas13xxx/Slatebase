/**
 * Bridge for `slatebase:rename-file` / `slatebase:delete-file` events, mirroring
 * `revealFileBridge.ts`. Lets UI surfaces outside the File Explorer (tab bar,
 * backlinks, search results, graph nodes, ...) trigger the explorer's own
 * rename/delete UI for a given path, rather than duplicating that flow (tree
 * refresh, open-tab path updates, favorites updates) at every call site.
 *
 * As with `requestReveal`, the request is stored module-scope in addition to
 * being dispatched live, so the File Explorer can pick it up on mount via
 * `consumePendingRename`/`consumePendingDelete` even if it wasn't mounted yet
 * when the request was made (e.g. the caller just switched the left panel to
 * 'explorer' in the same tick).
 */
export interface FileOpRequest {
  path: string
  kind: 'file' | 'folder'
}

let pendingRename: FileOpRequest | null = null
let pendingDelete: FileOpRequest | null = null

export function requestRename(path: string, kind: 'file' | 'folder' = 'file'): void {
  pendingRename = { path, kind }
  window.dispatchEvent(new CustomEvent('slatebase:rename-file', { detail: { path, kind } }))
}

export function consumePendingRename(): FileOpRequest | null {
  const request = pendingRename
  pendingRename = null
  return request
}

export function requestDelete(path: string, kind: 'file' | 'folder' = 'file'): void {
  pendingDelete = { path, kind }
  window.dispatchEvent(new CustomEvent('slatebase:delete-file', { detail: { path, kind } }))
}

export function consumePendingDelete(): FileOpRequest | null {
  const request = pendingDelete
  pendingDelete = null
  return request
}
