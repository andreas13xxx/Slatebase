/**
 * Bridge for "open this base on its named view" (`leaf.setViewState({ type: 'bases', state: { file, viewName } })`).
 *
 * The request usually arrives before the base's tab has mounted `BasesView`, and a base that is
 * already open must switch at once. So the request is parked per file path (taken once when the
 * view mounts) and also announced to live views, like `revealFileBridge.ts` does for the explorer.
 */

type BasesViewListener = (viewName: string) => void

const pending = new Map<string, string>()
const listeners = new Map<string, Set<BasesViewListener>>()

/** Ask for the named view of a base; reaches an open view now, or the next one that mounts. */
export function requestBasesView(filePath: string, viewName: string): void {
  const live = listeners.get(filePath)
  if (live && live.size > 0) {
    live.forEach((listener) => listener(viewName))
    return
  }
  pending.set(filePath, viewName)
}

/** Take the parked request for a base (once). */
export function consumePendingBasesView(filePath: string): string | null {
  const viewName = pending.get(filePath) ?? null
  pending.delete(filePath)
  return viewName
}

/** Follow requests for an already mounted base; returns the unsubscribe function. */
export function onBasesViewRequest(filePath: string, listener: BasesViewListener): () => void {
  const set = listeners.get(filePath) ?? new Set<BasesViewListener>()
  set.add(listener)
  listeners.set(filePath, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(filePath)
  }
}
