import type { ISyncScheduler } from './types.js'

/**
 * Entry stored per vault in the timers map.
 */
interface SchedulerEntry {
  timer: NodeJS.Timeout
  intervalMinutes: number
  callback: () => Promise<void>
}

/**
 * Scheduler for interval-based sync triggering.
 * Manages setInterval timers per vault.
 * The callback provided by SyncService is responsible for checking the sync lock
 * before executing — if locked, the callback skips silently.
 */
export class SyncScheduler implements ISyncScheduler {
  private readonly timers = new Map<string, SchedulerEntry>()

  /**
   * Starts an interval timer for a vault.
   * If a timer already exists for this vault, it is stopped first.
   */
  start(vaultId: string, intervalMinutes: number, callback: () => Promise<void>): void {
    // Stop existing timer if present
    if (this.timers.has(vaultId)) {
      this.stop(vaultId)
    }

    const intervalMs = intervalMinutes * 60 * 1000
    const timer = setInterval(() => {
      void callback()
    }, intervalMs)

    this.timers.set(vaultId, { timer, intervalMinutes, callback })
  }

  /**
   * Stops the interval timer for a vault.
   * Safe to call even if no timer exists for the vault.
   */
  stop(vaultId: string): void {
    const entry = this.timers.get(vaultId)
    if (entry) {
      clearInterval(entry.timer)
      this.timers.delete(vaultId)
    }
  }

  /**
   * Resets the timer for a vault (after manual sync).
   * Clears the existing timer and starts a new one with the same interval and callback.
   * If no timer exists for the vault, this is a no-op.
   */
  reset(vaultId: string): void {
    const entry = this.timers.get(vaultId)
    if (!entry) {
      return
    }

    const { intervalMinutes, callback } = entry
    this.stop(vaultId)
    this.start(vaultId, intervalMinutes, callback)
  }

  /**
   * Checks whether a timer is active for a vault.
   */
  isActive(vaultId: string): boolean {
    return this.timers.has(vaultId)
  }

  /**
   * Stops all timers (for shutdown).
   */
  stopAll(): void {
    for (const [vaultId] of this.timers) {
      this.stop(vaultId)
    }
  }
}
