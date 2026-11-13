/**
 * Module-level bridge for "open this note at a heading/block" (deep links).
 *
 * The requester (the deep-link handler) cannot scroll anything itself: the tab may still be loading,
 * its editor not mounted, or the reading view not rendered. So the request is parked per tab and the
 * tab host (`TabContent`, via `useAnchorJump`) applies it once the note is on screen. Same shape as
 * `revealFileBridge`: a parked request for a consumer that is not ready yet, plus listeners for one
 * that already is (the note was open and active before the link was followed).
 *
 * @module state/anchorJumpBridge
 */
import type { DeepLinkAnchor } from '../deep-link/deepLink'

const pending = new Map<string, DeepLinkAnchor>()
const listeners = new Set<(tabId: string) => void>()

/** Parks an anchor for a tab (replacing an older one) and wakes listeners. */
export function requestAnchorJump(tabId: string, anchor: DeepLinkAnchor): void {
  pending.set(tabId, anchor)
  for (const listener of [...listeners]) listener(tabId)
}

/** The parked anchor for a tab, left in place until {@link takeAnchorJump}. */
export function peekAnchorJump(tabId: string): DeepLinkAnchor | null {
  return pending.get(tabId) ?? null
}

/** Removes and returns the parked anchor for a tab. */
export function takeAnchorJump(tabId: string): DeepLinkAnchor | null {
  const anchor = pending.get(tabId) ?? null
  pending.delete(tabId)
  return anchor
}

/** Subscribes to new requests; returns the unsubscribe function. */
export function onAnchorJumpRequest(listener: (tabId: string) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Drops every parked request (tests, logout). */
export function clearAnchorJumps(): void {
  pending.clear()
}
