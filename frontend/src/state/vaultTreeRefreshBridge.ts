/**
 * Bridge for requesting a vault directory-tree refresh from a surface that has
 * no direct access to `appDispatch` (e.g. BasesView, which only receives
 * `apiClient` + `vaultId`).
 *
 * Problem: the backend's `vault:change` SSE event deliberately excludes the
 * user who made the write, so a note a user creates from a base never triggers
 * their own live tree refresh — the File Explorer stays stale. BasesView's own
 * query re-runs, but the explorer's `vaultTrees` cache does not.
 *
 * `requestVaultTreeRefresh(vaultId)` fires the request; AppContent subscribes
 * via `onVaultTreeRefreshRequest`, re-fetches that vault's tree and dispatches
 * `VAULT_TREE_LOADED`. Same module-level `Set<callback>` pattern as
 * `realtimeVaultBridge.ts` / `revealFileBridge.ts`.
 *
 * @module vaultTreeRefreshBridge
 */

export type VaultTreeRefreshCallback = (vaultId: string) => void

const callbacks: Set<VaultTreeRefreshCallback> = new Set()

/** Subscribe to tree-refresh requests. Returns an unsubscribe function. */
export function onVaultTreeRefreshRequest(cb: VaultTreeRefreshCallback): () => void {
  callbacks.add(cb)
  return () => { callbacks.delete(cb) }
}

/** Ask every subscriber to refresh the given vault's directory tree. */
export function requestVaultTreeRefresh(vaultId: string): void {
  for (const cb of callbacks) cb(vaultId)
}
