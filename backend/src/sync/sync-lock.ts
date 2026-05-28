import type { ISyncLock } from './types.js'

/**
 * In-memory mutex for preventing concurrent sync operations on the same vault.
 * Uses a simple Map<string, boolean> internally.
 * Safe in single-threaded Node.js — no TOCTOU (time-of-check-to-time-of-use) race conditions.
 */
export class SyncLock implements ISyncLock {
  private readonly locks = new Map<string, boolean>()

  /**
   * Attempts to acquire the lock for a vault.
   * Returns false if the vault is already locked.
   */
  acquire(vaultId: string): boolean {
    if (this.locks.get(vaultId) === true) {
      return false
    }
    this.locks.set(vaultId, true)
    return true
  }

  /**
   * Releases the lock for a vault.
   * Safe to call even if the vault is not currently locked.
   */
  release(vaultId: string): void {
    this.locks.delete(vaultId)
  }

  /**
   * Checks whether a vault is currently locked.
   */
  isLocked(vaultId: string): boolean {
    return this.locks.get(vaultId) === true
  }
}
