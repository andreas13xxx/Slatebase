/**
 * Module-level bridge between RealtimeProvider (SSE presence events) and ChatPage.
 *
 * Problem: RealtimeProvider sits above ChatProvider in the component tree,
 * so it cannot directly pass online user IDs to ConversationList.
 * This module provides a callback registry that ChatPage can subscribe to
 * for receiving presence updates and passing them as the `onlineUserIds` prop.
 *
 * Pattern: Same as realtimeChatBridge.ts — module-level Set of callbacks,
 * named exports, no class.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Callback for presence changes (receives the current set of online user IDs). */
export type PresenceChangeCallback = (onlineUserIds: Set<string>) => void

// ─── Module-Level State ──────────────────────────────────────────────────────

const presenceChangeCallbacks: Set<PresenceChangeCallback> = new Set()

/** Last dispatched online user IDs for synchronous access. */
let currentOnlineUserIds: Set<string> = new Set()

// ─── Registration Functions ──────────────────────────────────────────────────

/**
 * Subscribe to presence changes.
 * Called by ChatPage when it mounts to receive online user ID updates.
 * Returns an unsubscribe function.
 */
export function onPresenceChange(cb: PresenceChangeCallback): () => void {
  presenceChangeCallbacks.add(cb)
  return () => { presenceChangeCallbacks.delete(cb) }
}

// ─── Dispatch Functions (called by RealtimeInner) ────────────────────────────

/**
 * Dispatches a presence change to all registered callbacks.
 * Called by RealtimeInner after processing `presence:init` or `presence:update` events.
 * Also stores the set for synchronous access via `getOnlineUserIds()`.
 */
export function dispatchPresenceChange(onlineUserIds: Set<string>): void {
  currentOnlineUserIds = onlineUserIds
  for (const cb of presenceChangeCallbacks) {
    cb(onlineUserIds)
  }
}

// ─── Query Functions ─────────────────────────────────────────────────────────

/**
 * Returns the current snapshot of online user IDs.
 * Useful for initializing state synchronously (e.g. in a useState initializer).
 */
export function getOnlineUserIds(): Set<string> {
  return currentOnlineUserIds
}
