/**
 * Reads a deep link from the address bar once, before the first render.
 *
 * `/open?…` is not a page of its own: the normal app (with its login gate) runs. This module only
 * moves the target out of the URL — into `sessionStorage` (see `pendingDeepLink`) so it survives the
 * login — and cleans the address bar so a reload does not jump again and the path stays out of the
 * history/referrer.
 *
 * @module deep-link/captureDeepLink
 */
import { DEEP_LINK_PATH, parseDeepLink } from './deepLink'
import { storePendingDeepLink } from './pendingDeepLink'

/** Set when the address bar held an `/open` URL that could not be used; consumed once after login. */
let invalidLinkSeen = false

/**
 * Captures `/open?…` from the location. Safe to call on any URL: anything else is ignored.
 *
 * @param location - Injectable for tests.
 * @param history - Injectable for tests.
 */
export function captureDeepLinkFromLocation(
  location: Pick<Location, 'pathname' | 'search'> = window.location,
  history: Pick<History, 'replaceState'> = window.history,
): void {
  if (location.pathname !== DEEP_LINK_PATH) return
  const target = parseDeepLink(location.search)
  if (target) storePendingDeepLink(target)
  else invalidLinkSeen = true
  history.replaceState(null, '', '/')
}

/** Whether an unusable `/open` link was seen since the last call (true once, then false). */
export function consumeInvalidDeepLink(): boolean {
  const seen = invalidLinkSeen
  invalidLinkSeen = false
  return seen
}
