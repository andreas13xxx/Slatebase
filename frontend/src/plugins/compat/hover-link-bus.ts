/**
 * Routes hover-preview requests from their producers to the popover UI.
 *
 * Two things ask for a preview and neither should know about the component that
 * draws it:
 *
 * - Slatebase's own internal links, via pointer delegation in the rendered view
 * - Plugins, via `workspace.trigger('hover-link', …)` — the same call they make
 *   in Obsidian, where the core "Page preview" plugin picks it up
 *
 * Obsidian's `registerHoverLinkSource` is a *registration*: it declares that a
 * plugin's views can produce previews, which is what puts the source in the
 * user-facing toggle list. It never draws anything itself. Recording the sources
 * here keeps that meaning instead of discarding the call.
 *
 * @module hover-link-bus
 */

/** A request to show a preview for a link. */
export interface HoverPreviewRequest {
  /** Vault-relative path of the note to preview. */
  linkPath: string
  /** The element hovered, used to position the popover. */
  targetEl: HTMLElement
  /** Which source asked: 'internal-link' for Slatebase's own, else a plugin id. */
  source: string
  /** Path of the note the link appears in, when known. */
  sourcePath?: string
}

/** A hover source declared via `registerHoverLinkSource`. */
export interface HoverLinkSource {
  id: string
  /** Human-readable label Obsidian shows in its preview settings. */
  display: string
}

type RequestListener = (request: HoverPreviewRequest) => void
type DismissListener = () => void

const sources = new Map<string, HoverLinkSource>()
const requestListeners = new Set<RequestListener>()
const dismissListeners = new Set<DismissListener>()

/** Declare a hover source. Mirrors `workspace.registerHoverLinkSource`. */
export function registerHoverLinkSource(id: string, info?: { display?: string }): void {
  sources.set(id, { id, display: info?.display ?? id })
}

/** Withdraw a previously declared source. */
export function unregisterHoverLinkSource(id: string): void {
  sources.delete(id)
}

/** Every currently declared hover source. */
export function getHoverLinkSources(): HoverLinkSource[] {
  return [...sources.values()]
}

/** Ask for a preview. Ignored when nothing is listening. */
export function requestHoverPreview(request: HoverPreviewRequest): void {
  for (const listener of requestListeners) listener(request)
}

/** Withdraw the current preview request. */
export function dismissHoverPreview(): void {
  for (const listener of dismissListeners) listener()
}

/** Subscribe the popover UI. Returns an unsubscribe function. */
export function onHoverPreview(
  onRequest: RequestListener,
  onDismiss: DismissListener,
): () => void {
  requestListeners.add(onRequest)
  dismissListeners.add(onDismiss)
  return () => {
    requestListeners.delete(onRequest)
    dismissListeners.delete(onDismiss)
  }
}

/**
 * Translate an Obsidian `hover-link` event payload into a request.
 *
 * Plugins pass `linktext` (a wikilink target) plus the element they want the
 * preview anchored to. Returns null when the payload lacks what we need, which
 * is preferable to guessing a target.
 */
export function hoverLinkEventToRequest(payload: unknown): HoverPreviewRequest | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>

  const linktext = typeof p['linktext'] === 'string' ? p['linktext'] : null
  const targetEl = p['targetEl']
  if (!linktext || !(targetEl instanceof HTMLElement)) return null

  return {
    linkPath: linktext,
    targetEl,
    source: typeof p['source'] === 'string' ? p['source'] : 'plugin',
    sourcePath: typeof p['sourcePath'] === 'string' ? p['sourcePath'] : undefined,
  }
}

/** Drop all state. Test-only. */
export function resetHoverLinkBus(): void {
  sources.clear()
  requestListeners.clear()
  dismissListeners.clear()
}
