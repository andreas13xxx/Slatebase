import type { ChangeSet } from '@codemirror/state'
import { Annotation } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { warnOnce } from '../plugins/compat/log'

/**
 * Cross-pane document mirroring for the CodeMirror editor.
 *
 * The same file can be open in more than one pane (Split Panes). Each pane
 * mounts its OWN `CodeMirrorEditor` with its own `EditorView` and its own
 * `EditorState` — CM6 cannot share a single state across two views. Without
 * mirroring, typing in one pane leaves the others showing stale text, and the
 * per-`tabId` entry in `state-store.ts` (shared by panes with the same file)
 * is overwritten by whichever pane saves last — a latent data-loss path.
 *
 * This registry tracks every mounted view by its `tabId` and replays one
 * view's document changes onto its siblings as `remoteSync`-annotated
 * transactions. Each view keeps its own cursor/scroll; only the document is
 * mirrored. CM6 maps change positions correctly because sibling views start
 * from the same document (both seeded from the shared `state-store`/`content`
 * at mount) and thereafter only diverge through this broadcast.
 *
 * @module editor/doc-sync-registry
 */

/**
 * Marks a transaction that mirrors a sibling view's change rather than a local
 * edit. The editor's `updateListener` reads it to (a) avoid re-broadcasting it
 * — which would loop endlessly between two views — and (b) avoid reporting it
 * through `onContentChange`, so only the originating pane marks its tab's
 * editBuffer dirty and arms the one auto-save debounce. Without (b), every pane
 * would fire its own save for a single keystroke.
 */
export const remoteSync = Annotation.define<boolean>()

/** All currently-mounted views, grouped by the file (tabId) they display. */
const viewsByTab = new Map<string, Set<EditorView>>()

/** Register a mounted view so it participates in cross-pane mirroring. */
export function registerSyncView(tabId: string, view: EditorView): void {
  let set = viewsByTab.get(tabId)
  if (!set) {
    set = new Set()
    viewsByTab.set(tabId, set)
  }
  set.add(view)
}

/** Deregister a view on unmount/tab-switch. Cleans up an emptied tab bucket. */
export function unregisterSyncView(tabId: string, view: EditorView): void {
  const set = viewsByTab.get(tabId)
  if (!set) return
  set.delete(view)
  if (set.size === 0) viewsByTab.delete(tabId)
}

/**
 * Apply `changes` from `source` to every OTHER mounted view showing the same
 * file, as a `remoteSync`-annotated transaction. A no-op when `source` is the
 * only view for that tab. Each sibling dispatch is isolated in a try/catch so a
 * view destroyed mid-iteration can't abort the rest.
 */
export function broadcastChanges(tabId: string, source: EditorView, changes: ChangeSet): void {
  const set = viewsByTab.get(tabId)
  if (!set || set.size < 2) return
  for (const view of set) {
    if (view === source) continue
    try {
      view.dispatch({ changes, annotations: remoteSync.of(true) })
    } catch (err) {
      // Expected case: the view was destroyed between registration and this
      // dispatch — harmless, a failed mirror must not break the others or the
      // source edit. But a position-mapping RangeError here would mean two
      // views silently diverged (different start docs), which has no other
      // symptom — surface it once rather than swallowing it blind.
      warnOnce(
        'docSync.broadcastFailed',
        `[doc-sync] mirroring a change to a sibling pane failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}

/** Test-only: drop all registrations. */
export function resetDocSyncRegistry(): void {
  viewsByTab.clear()
}
