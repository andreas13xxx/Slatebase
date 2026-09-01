/**
 * Shared bookkeeping for the per-user preference stores that mirror
 * `data/users/<userId>-preferences.json` — keybindings, favorites and recent
 * files. Each keeps a localStorage cache for synchronous reads and pushes the
 * full list to the backend on a debounce.
 *
 * ── Why the first-sync marker ──
 * The preferences API cannot distinguish "the server has never stored anything
 * for this user" from "the user deliberately emptied the list": both come back
 * as `{ entries: [] }`. The stores used to treat every empty response as "no
 * data" and keep their local cache, which made the *older* state win — clearing
 * all keybindings on one device was silently restored by the next device that
 * synced. Treating every empty response as authoritative has the opposite
 * failure: a local cache written before the store synced at all would be
 * discarded on first login.
 *
 * A one-time marker per store closes both gaps. Before the first successful
 * upload the local cache seeds the server; from then on the server is
 * authoritative, empty responses included. Last write wins, and the winner is
 * always the more recent one.
 *
 * Clearing site data resets the marker, but it also clears the cache it guards,
 * so the empty server response still wins — the sequence stays correct.
 *
 * @module state/preferenceSync
 */

import { showToast } from '../components/ToastNotification'

/** localStorage key prefix for the per-store first-sync markers. */
const SYNCED_PREFIX = 'slatebase:synced:'

/**
 * Stores currently in a failed-sync state. Used to toast only on the
 * transition from working to failing, so a store that cannot reach the server
 * does not raise one toast per debounced attempt.
 */
const failing = new Set<string>()

/**
 * Whether this store has completed at least one successful upload on this
 * device. `false` also when localStorage is unreadable — the caller then
 * treats the local cache as a seed, which is the safe direction.
 */
export function hasSyncedBefore(storeKey: string): boolean {
  try {
    return localStorage.getItem(SYNCED_PREFIX + storeKey) === '1'
  } catch {
    return false
  }
}

/** Records that this store has completed a successful upload. */
export function markSyncedBefore(storeKey: string): void {
  try {
    localStorage.setItem(SYNCED_PREFIX + storeKey, '1')
  } catch {
    // localStorage unavailable — the store keeps seeding from its cache, which
    // is harmless: the upload is idempotent.
  }
}

/** Clears the marker. Called on logout so the next account starts clean. */
export function clearSyncedBefore(storeKey: string): void {
  try {
    localStorage.removeItem(SYNCED_PREFIX + storeKey)
  } catch {
    // Nothing to do — a stale marker only means the next login skips the seed.
  }
}

/**
 * Reports a failed upload. Logs always; shows a toast only when `label` is
 * given and this store was not already failing.
 *
 * @param storeKey - Store identifier, matching the one used for the marker.
 * @param error - The thrown value, for the console.
 * @param label - German store name for the toast. Omit for stores whose loss
 *   is not worth interrupting the user over (e.g. recent files).
 */
export function reportSyncFailure(storeKey: string, error: unknown, label?: string): void {
  console.warn(`[preferences] Sync für "${storeKey}" fehlgeschlagen`, error)

  if (label === undefined || failing.has(storeKey)) return
  failing.add(storeKey)
  showToast(
    'error',
    `${label} konnten nicht gespeichert werden — Änderungen gelten vorerst nur auf diesem Gerät.`,
  )
}

/**
 * Reports a successful upload, re-arming the failure toast for this store.
 */
export function reportSyncSuccess(storeKey: string): void {
  failing.delete(storeKey)
}

/**
 * Resets the in-memory failure state. Test helper.
 * @internal
 */
export function _resetFailureState(): void {
  failing.clear()
}
