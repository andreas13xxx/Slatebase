/**
 * Module-level bridge between RealtimeProvider (SSE events) and Sync/ConflictWizard state.
 *
 * Problem: RealtimeProvider sits above the sync components in the component tree,
 * so it cannot directly dispatch wizard actions. This module provides a callback
 * registry that the ConflictWizard can subscribe to for receiving new conflict events.
 *
 * Pattern: Same as realtimeVaultBridge — module-level mutable callbacks.
 */

import type { ConflictCategory } from '../components/conflict-wizard/types'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Enriched sync:conflict event data from SSE. */
export interface SyncConflictEvent {
  vaultId: string
  path: string
  category: ConflictCategory
}

/** Callback for incoming sync:conflict events via SSE. */
export type SyncConflictCallback = (event: SyncConflictEvent) => void

// ─── Module-Level State ──────────────────────────────────────────────────────

const syncConflictCallbacks: Set<SyncConflictCallback> = new Set()

// ─── Registration Functions ──────────────────────────────────────────────────

/**
 * Subscribe to incoming sync:conflict events.
 * Called by ConflictWizard when it mounts (wizard open session).
 * Returns an unsubscribe function.
 */
export function onRealtimeSyncConflict(cb: SyncConflictCallback): () => void {
  syncConflictCallbacks.add(cb)
  return () => { syncConflictCallbacks.delete(cb) }
}

// ─── Dispatch Functions (called by RealtimeProvider) ─────────────────────────

/**
 * Dispatches a sync:conflict event to all registered callbacks.
 */
export function dispatchRealtimeSyncConflict(event: SyncConflictEvent): void {
  for (const cb of syncConflictCallbacks) {
    cb(event)
  }
}
