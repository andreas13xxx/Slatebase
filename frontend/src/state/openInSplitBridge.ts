/**
 * Bridge for "open in split" (Split Panes, task 3.4), mirroring the module-level
 * event-bridge pattern of `revealFileBridge.ts` / `fileOpBridge.ts`.
 *
 * A file-open surface (File Explorer, Search, Quick Switcher, an editor
 * wikilink) that detects the "open in split" modifier calls `requestOpenInSplit`
 * instead of its normal open path. `CommandPaletteContainer` — which holds the
 * pane tree and the `openTab` wiring — subscribes once, splits the active pane,
 * and opens the file in the fresh pane. Keeping the pane-tree knowledge in one
 * subscriber means no surface has to learn about panes.
 *
 * The modifier is Ctrl/Cmd+Alt+click (Obsidian's convention; `Ctrl/Cmd+click`
 * is already "open in new tab"), decided in the design's Phase-0 findings.
 *
 * @module state/openInSplitBridge
 */

/** A request to open a file in a freshly-split pane. */
export interface OpenInSplitRequest {
  vaultId: string
  filePath: string
  fileName: string
}

type Listener = (request: OpenInSplitRequest) => void

const listeners = new Set<Listener>()

/** Subscribe to open-in-split requests. Returns an unsubscribe function. */
export function onOpenInSplit(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Request that a file be opened in a new split of the active pane. */
export function requestOpenInSplit(vaultId: string, filePath: string, fileName: string): void {
  const request: OpenInSplitRequest = { vaultId, filePath, fileName }
  for (const listener of listeners) listener(request)
}

/**
 * True when a mouse/keyboard event carries the "open in split" modifier
 * (Ctrl/Cmd+Alt). Accepts the minimal shape so it works for React synthetic
 * events, native events and keyboard events alike.
 */
export function isOpenInSplitModifier(e: {
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}): boolean {
  return Boolean((e.ctrlKey || e.metaKey) && e.altKey)
}
