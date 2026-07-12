/**
 * UI state preservation across session expiry.
 * Saves/restores vault selection and open tabs so users don't lose their context
 * when their session expires and they re-login.
 */

/** LocalStorage key for preserving UI state across session expiry. */
export const RESTORE_STATE_KEY = 'slatebase_restore_state'

/** Stale guard: discard restore state older than 5 minutes. */
const RESTORE_STATE_MAX_AGE_MS = 5 * 60 * 1000

/** Shape of the restore state data. */
export interface RestoreState {
  selectedVaultId: string | null
  tabs: Array<{ vaultId: string; filePath: string }>
  activeTabId: string | null
}

/**
 * Module-level snapshot of the current UI state (vault + tabs).
 * Updated by AppContent via useEffect. Read by the onSessionExpired callback.
 */
let _currentUiSnapshot: RestoreState = { selectedVaultId: null, tabs: [], activeTabId: null }

/**
 * Updates the module-level UI snapshot. Called from AppContent's useEffect.
 */
export function updateUiSnapshot(snapshot: RestoreState): void {
  _currentUiSnapshot = snapshot
}

/**
 * Saves the current UI state snapshot to localStorage for restoration after re-login.
 */
export function saveRestoreState(): void {
  try {
    const restoreState = {
      selectedVaultId: _currentUiSnapshot.selectedVaultId,
      tabs: _currentUiSnapshot.tabs,
      activeTabId: _currentUiSnapshot.activeTabId,
      savedAt: Date.now(),
    }
    localStorage.setItem(RESTORE_STATE_KEY, JSON.stringify(restoreState))
  } catch {
    // Storage full or unavailable — silently skip
  }
}

/**
 * Reads and validates the stored restore state. Returns null if missing, stale, or invalid.
 */
export function readRestoreState(): RestoreState | null {
  try {
    const raw = localStorage.getItem(RESTORE_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      selectedVaultId?: string | null
      tabs?: Array<{ vaultId: string; filePath: string }>
      activeTabId?: string | null
      savedAt?: number
    }
    // Stale guard: discard if older than 5 minutes
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > RESTORE_STATE_MAX_AGE_MS) {
      localStorage.removeItem(RESTORE_STATE_KEY)
      return null
    }
    if (!Array.isArray(parsed.tabs)) return null
    return {
      selectedVaultId: parsed.selectedVaultId ?? null,
      tabs: parsed.tabs,
      activeTabId: parsed.activeTabId ?? null,
    }
  } catch {
    localStorage.removeItem(RESTORE_STATE_KEY)
    return null
  }
}

/**
 * Clears stored restore state (called after successful restoration or on stale guard).
 */
export function clearRestoreState(): void {
  localStorage.removeItem(RESTORE_STATE_KEY)
}
