// ─── Update Checker ───────────────────────────────────────────────────────────

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { IPluginStoreCache } from './plugin-store-cache.js'
import type { IPluginStoreService } from './plugin-store-service.js'
import type { IPluginStoreConfig, UpdateCheckResult } from './types.js'

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Periodic update checker that runs on a configurable interval (default 24h).
 * Iterates all vaults, checks for plugin updates, and caches results.
 * Persists the last check timestamp to survive server restarts.
 */
export interface IUpdateChecker {
  /** Schedule periodic update checks */
  start(): void
  /** Stop periodic checks */
  stop(): void
  /** Get last check timestamp (ISO 8601) */
  getLastCheckTime(): string | null
  /** Get cached update results for a vault */
  getCachedResults(vaultId: string): UpdateCheckResult | null
}

// ─── Persistence Format ──────────────────────────────────────────────────────

interface LastCheckData {
  timestamp: string
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Periodic update checker implementation.
 * Runs update checks for all vaults on a configurable interval,
 * persists the last check timestamp to `{dataDir}/plugin-store/last-update-check.json`,
 * and caches results in the plugin store cache.
 */
export class UpdateChecker implements IUpdateChecker {
  private readonly pluginStoreService: IPluginStoreService
  private readonly cache: IPluginStoreCache
  private readonly config: IPluginStoreConfig
  private readonly dataDir: string
  private readonly getVaultIds: () => string[]
  private readonly logger: ILogger

  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private lastCheckTime: string | null = null
  private running = false

  constructor(
    pluginStoreService: IPluginStoreService,
    cache: IPluginStoreCache,
    config: IPluginStoreConfig,
    dataDir: string,
    getVaultIds: () => string[],
    logger: ILogger
  ) {
    this.pluginStoreService = pluginStoreService
    this.cache = cache
    this.config = config
    this.dataDir = dataDir
    this.getVaultIds = getVaultIds
    this.logger = logger
  }

  /** Schedule periodic update checks */
  start(): void {
    if (this.intervalHandle !== null) {
      return
    }

    this.logger.info('Update checker starting')

    // Load persisted timestamp and decide whether to run immediately
    void this.initialize()
  }

  /** Stop periodic checks */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
    this.logger.info('Update checker stopped')
  }

  /** Get last check timestamp (ISO 8601) */
  getLastCheckTime(): string | null {
    return this.lastCheckTime
  }

  /** Get cached update results for a vault */
  getCachedResults(vaultId: string): UpdateCheckResult | null {
    return this.cache.getUpdateCheck(vaultId) ?? this.cache.getUpdateCheckFallback(vaultId)
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async initialize(): Promise<void> {
    try {
      await this.loadLastCheckTime()
    } catch (err) {
      this.logger.warn('Failed to load last update check timestamp', {
        error: err instanceof Error ? err.message : String(err)
      })
    }

    // Determine if an immediate check is needed
    const shouldRunNow = this.shouldRunImmediately()

    if (shouldRunNow) {
      // Run check immediately (non-blocking)
      void this.runCheck()
    }

    // Start the periodic interval
    this.intervalHandle = setInterval(() => {
      void this.runCheck()
    }, this.config.autoCheckInterval)
  }

  private shouldRunImmediately(): boolean {
    if (this.lastCheckTime === null) {
      return true
    }

    const lastCheck = new Date(this.lastCheckTime).getTime()
    const elapsed = Date.now() - lastCheck
    return elapsed >= this.config.autoCheckInterval
  }

  private async runCheck(): Promise<void> {
    if (this.running) {
      this.logger.debug('Update check already running, skipping')
      return
    }

    this.running = true
    this.logger.info('Running periodic update check')

    const vaultIds = this.getVaultIds()

    if (vaultIds.length === 0) {
      this.logger.debug('No vaults to check for updates')
      this.running = false
      await this.persistTimestamp()
      return
    }

    let successCount = 0
    let errorCount = 0

    for (const vaultId of vaultIds) {
      try {
        const result = await this.pluginStoreService.checkUpdates(vaultId)
        this.cache.setUpdateCheck(vaultId, result)
        successCount++

        const updatesAvailable = result.plugins.filter(p => p.hasUpdate).length
        if (updatesAvailable > 0) {
          this.logger.info('Updates available for vault', {
            vaultId,
            updatesAvailable
          })
        }
      } catch (err) {
        errorCount++
        this.logger.warn('Update check failed for vault', {
          vaultId,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }

    this.logger.info('Update check completed', {
      vaultsChecked: vaultIds.length,
      successCount,
      errorCount
    })

    await this.persistTimestamp()
    this.running = false
  }

  private async loadLastCheckTime(): Promise<void> {
    const filePath = this.getTimestampFilePath()

    try {
      const content = await readFile(filePath, 'utf-8')
      const data = JSON.parse(content) as LastCheckData
      if (data.timestamp) {
        this.lastCheckTime = data.timestamp
      }
    } catch (err) {
      // ENOENT is expected on first run
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.debug('No previous update check timestamp found')
        return
      }
      throw err
    }
  }

  private async persistTimestamp(): Promise<void> {
    const now = new Date().toISOString()
    this.lastCheckTime = now

    const filePath = this.getTimestampFilePath()
    const dir = path.dirname(filePath)

    try {
      // Ensure directory exists
      await mkdir(dir, { recursive: true })

      // Atomic write: temp file → rename
      const tempSuffix = randomBytes(8).toString('hex')
      const tempPath = `${filePath}.${tempSuffix}.tmp`
      const data: LastCheckData = { timestamp: now }

      await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8')
      await rename(tempPath, filePath)
    } catch (err) {
      this.logger.warn('Failed to persist update check timestamp', {
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  private getTimestampFilePath(): string {
    return path.join(this.dataDir, 'plugin-store', 'last-update-check.json')
  }
}
