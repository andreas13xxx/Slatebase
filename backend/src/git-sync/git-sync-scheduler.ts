// GitSyncScheduler — periodic tick that runs due git-sync remotes.
//
// Shaped like CleanupJob (see ../cleanup/cleanup-job.ts): start()/stop(),
// isRunning guard against overlapping ticks, per-remote error isolation.
// Each remote has its own `intervalMinutes`; the scheduler ticks at a
// short, fixed cadence and checks each enabled remote's last-run time
// against its own interval to decide whether it's due.

import type { ILogger } from '../logger/index.js'
import type { IGitSyncConfigStore } from './config-store.js'
import type { IGitSyncStatusStore } from './status-store.js'
import type { IGitSyncEngine } from './sync-engine.js'

const DEFAULT_TICK_INTERVAL_MS = 60 * 1000

export class GitSyncScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isRunning = false

  constructor(
    private readonly configStore: IGitSyncConfigStore,
    private readonly statusStore: IGitSyncStatusStore,
    private readonly syncEngine: IGitSyncEngine,
    private readonly logger: ILogger,
    private readonly tickIntervalMs: number = DEFAULT_TICK_INTERVAL_MS,
  ) {}

  start(): void {
    this.intervalId = setInterval(() => {
      this.tick().catch((err) => {
        this.logger.error('Git-sync scheduler tick failed', { error: String(err) })
      })
    }, this.tickIntervalMs)

    this.logger.info('Git-sync scheduler started', { tickIntervalMs: this.tickIntervalMs })
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      this.logger.info('Git-sync scheduler stopped')
    }
  }

  /** Runs every due, enabled remote across all vaults. Errors are isolated per remote. */
  async tick(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Git-sync tick skipped: previous tick still in progress')
      return
    }

    this.isRunning = true
    try {
      const vaultIds = await this.configStore.listVaultIdsWithRemotes()

      for (const vaultId of vaultIds) {
        const remotes = await this.configStore.listRemotes(vaultId)

        for (const remote of remotes) {
          if (!remote.enabled) continue

          try {
            const isDue = await this.isDue(vaultId, remote.id, remote.intervalMinutes)
            if (!isDue) continue

            await this.syncEngine.runOne(vaultId, remote.id)
          } catch (err) {
            this.logger.error('Git-sync run failed for remote', {
              vaultId, remoteId: remote.id, error: String(err),
            })
          }
        }
      }
    } finally {
      this.isRunning = false
    }
  }

  private async isDue(vaultId: string, remoteId: string, intervalMinutes: number): Promise<boolean> {
    const status = await this.statusStore.getStatus(vaultId, remoteId)
    if (!status || !status.lastRunAt) return true

    // A conflicted remote is left alone by the scheduler — auto-retrying would
    // just re-attempt the same merge against an unresolved working tree. Only
    // a manual "sync now" (which bypasses this check) tries again, once the
    // user has actually resolved the conflict in the editor.
    if (status.lastResult === 'conflict') return false

    const elapsedMs = Date.now() - new Date(status.lastRunAt).getTime()
    return elapsedMs >= intervalMinutes * 60 * 1000
  }
}
