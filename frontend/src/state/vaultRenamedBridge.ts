/**
 * Module-level bridge for SSE `vault:renamed` events.
 *
 * RealtimeProvider sits above AppProvider, so it cannot dispatch into the app
 * reducer directly; AppContent subscribes here instead.
 *
 * Pattern: same as pluginSettingsChangeBridge.
 */

/** vault:renamed event data from SSE. */
export interface VaultRenamedEvent {
  vaultId: string
  name: string
}

/** Callback for incoming vault:renamed events. */
export type VaultRenamedCallback = (event: VaultRenamedEvent) => void

const callbacks: Set<VaultRenamedCallback> = new Set()

/** Subscribe to vault:renamed events. Returns an unsubscribe function. */
export function onVaultRenamed(cb: VaultRenamedCallback): () => void {
  callbacks.add(cb)
  return () => { callbacks.delete(cb) }
}

/** Dispatches a vault:renamed event to all registered callbacks. */
export function dispatchVaultRenamed(event: VaultRenamedEvent): void {
  for (const cb of callbacks) {
    cb(event)
  }
}
