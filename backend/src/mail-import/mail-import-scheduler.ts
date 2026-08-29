// MailImportScheduler — periodic tick that polls due IMAP mail-import configs.
// Shaped like GitSyncScheduler / CleanupJob: start()/stop(), isRunning guard
// against overlapping ticks, per-config error isolation.

import type { ILogger } from '../logger/index.js'
import type { IMailImportConfigStore } from './config-store.js'
import type { IMailImportStatusStore } from './status-store.js'
import type { IMailImportEngine } from './import-engine.js'

const DEFAULT_TICK_INTERVAL_MS = 60 * 1000

export class MailImportScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isRunning = false

  constructor(
    private readonly configStore: IMailImportConfigStore,
    private readonly statusStore: IMailImportStatusStore,
    private readonly importEngine: IMailImportEngine,
    private readonly logger: ILogger,
    private readonly tickIntervalMs: number = DEFAULT_TICK_INTERVAL_MS,
  ) {}

  start(): void {
    this.intervalId = setInterval(() => {
      this.tick().catch((err) => {
        this.logger.error('Mail-import scheduler tick failed', { error: String(err) })
      })
    }, this.tickIntervalMs)

    this.logger.info('Mail-import scheduler started', { tickIntervalMs: this.tickIntervalMs })
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      this.logger.info('Mail-import scheduler stopped')
    }
  }

  async tick(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Mail-import tick skipped: previous tick still in progress')
      return
    }

    this.isRunning = true
    try {
      const vaultIds = await this.configStore.listVaultIdsWithConfigs()

      for (const vaultId of vaultIds) {
        const configs = await this.configStore.listByVault(vaultId)

        for (const config of configs) {
          if (!config.enabled) continue

          try {
            const isDue = await this.isDue(vaultId, config.id, config.intervalMinutes)
            if (!isDue) continue

            await this.importEngine.runOne(vaultId, config.id)
          } catch (err) {
            this.logger.error('Mail-import run failed for config', {
              vaultId, configId: config.id, error: String(err),
            })
          }
        }
      }
    } finally {
      this.isRunning = false
    }
  }

  private async isDue(vaultId: string, configId: string, intervalMinutes: number): Promise<boolean> {
    const status = await this.statusStore.getStatus(vaultId, configId)
    if (!status || !status.lastRunAt) return true

    const elapsedMs = Date.now() - new Date(status.lastRunAt).getTime()
    return elapsedMs >= intervalMinutes * 60 * 1000
  }
}
