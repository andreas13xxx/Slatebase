/**
 * Module-level bridge between RealtimeProvider (SSE events) and App/Tab state.
 *
 * Problem: RealtimeProvider sits above AppProvider/TabProvider in the component tree,
 * so it cannot directly dispatch app or tab actions. This module provides a callback
 * registry that AppContent can subscribe to for receiving vault change events.
 *
 * Pattern: Same as realtimeChatBridge — module-level mutable callbacks.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Vault change event data from SSE. */
export interface VaultChangeEvent {
  vaultId: string
  action: 'saved' | 'deleted' | 'renamed'
  path: string
  userId: string
  username: string
}

/** Callback for incoming vault:change events via SSE. */
export type VaultChangeCallback = (event: VaultChangeEvent) => void

// ─── Module-Level State ──────────────────────────────────────────────────────

const vaultChangeCallbacks: Set<VaultChangeCallback> = new Set()

// ─── Registration Functions ──────────────────────────────────────────────────

/**
 * Subscribe to incoming vault:change events.
 * Called by AppContent when it mounts (has access to appDispatch + tabDispatch).
 * Returns an unsubscribe function.
 */
export function onRealtimeVaultChange(cb: VaultChangeCallback): () => void {
  vaultChangeCallbacks.add(cb)
  return () => { vaultChangeCallbacks.delete(cb) }
}

// ─── Dispatch Functions (called by RealtimeBridge) ───────────────────────────

/**
 * Dispatches a vault:change event to all registered callbacks.
 */
export function dispatchRealtimeVaultChange(event: VaultChangeEvent): void {
  for (const cb of vaultChangeCallbacks) {
    cb(event)
  }
}
