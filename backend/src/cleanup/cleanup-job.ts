// CleanupJob — Periodic cleanup of expired trash entries and excess file versions

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ICleanupJob } from './types.js'
import type { ITrashService } from '../trash/types.js'
import type { IVersionService } from '../version/types.js'
import { VERSIONS_DIR_SEGMENTS } from '../version/types.js'
import type { IVaultManager } from '../vault/index.js'
import type { IConfigService } from '../config/index.js'
import type { ILogger } from '../logger/index.js'

/**
 * Periodic job that removes expired trash entries and prunes excess file versions.
 * Reads fresh configuration values on each run to support config changes without restart.
 * Provides per-file error isolation so one failure does not stop the entire run.
 */
export class CleanupJob implements ICleanupJob {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isRunning = false

  constructor(
    private readonly trashService: ITrashService,
    private readonly versionService: IVersionService,
    private readonly vaultManager: IVaultManager,
    private readonly configService: IConfigService,
    private readonly logger: ILogger,
  ) {}

  /**
   * Starts the periodic cleanup.
   * Runs immediately on start, then repeats at the configured interval.
   */
  start(): void {
    // Run immediately
    this.runOnce().catch((err) => {
      this.logger.error('Cleanup initial run failed', { error: String(err) })
    })

    // Read interval from config
    const { intervalHours } = this.configService.getCleanupConfig()
    const intervalMs = intervalHours * 60 * 60 * 1000

    this.intervalId = setInterval(() => {
      this.runOnce().catch((err) => {
        this.logger.error('Cleanup periodic run failed', { error: String(err) })
      })
    }, intervalMs)

    this.logger.info('Cleanup job started', { intervalHours })
  }

  /**
   * Stops the periodic cleanup and clears the interval.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      this.logger.info('Cleanup job stopped')
    }
  }

  /**
   * Executes a single cleanup pass across all vaults.
   * Reads fresh config values on each invocation.
   * Iterates all vaults, purges expired trash, and prunes excess versions per file.
   * Errors are isolated per vault and per file — one failure does not stop the run.
   *
   * If a previous run is still in progress (e.g. a large vault made it take
   * longer than the configured interval), this invocation is skipped rather
   * than running concurrently with it — overlapping runs would duplicate
   * filesystem work and could race on the same files.
   */
  async runOnce(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Cleanup run skipped: previous run still in progress')
      return
    }

    this.isRunning = true
    try {
      // Read fresh config on each run
      const { retentionDays } = this.configService.getTrashConfig()
      const { maxPerFile } = this.configService.getVersionsConfig()

      const vaults = this.vaultManager.getAllVaults()

      this.logger.info('Cleanup run starting', {
        vaultCount: vaults.length,
        retentionDays,
        maxPerFile,
      })

      for (const vault of vaults) {
        const vaultId = vault.info.id
        const vaultPath = vault.info.path

        // --- Trash cleanup ---
        try {
          if (retentionDays > 0) {
            const purged = await this.trashService.purgeExpired(vaultId, retentionDays)
            if (purged > 0) {
              this.logger.info('Trash entries purged', { vaultId, purged })
            }
          }
        } catch (err) {
          this.logger.error('Trash cleanup failed for vault', {
            vaultId,
            error: String(err),
          })
        }

        // --- Version pruning ---
        try {
          if (maxPerFile > 0) {
            await this.pruneAllVersions(vaultId, vaultPath, maxPerFile)
          }
        } catch (err) {
          this.logger.error('Version pruning failed for vault', {
            vaultId,
            error: String(err),
          })
        }
      }

      this.logger.info('Cleanup run completed')
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Scans the `.slatebase/versions/` directory of a vault and prunes excess versions for each file.
   * Each file's versions are pruned independently — errors are isolated per file.
   */
  private async pruneAllVersions(
    vaultId: string,
    vaultPath: string,
    maxPerFile: number,
  ): Promise<void> {
    const versionsDir = path.join(vaultPath, ...VERSIONS_DIR_SEGMENTS)

    // Check if the versions directory exists
    try {
      await fs.access(versionsDir)
    } catch {
      // No versions directory — nothing to prune
      return
    }

    // Recursively find all version directories (leaf directories containing version files)
    const filePaths = await this.collectVersionedFiles(versionsDir, versionsDir)

    let totalPruned = 0

    for (const relativePath of filePaths) {
      try {
        const pruned = await this.versionService.pruneVersions(vaultId, relativePath, maxPerFile)
        totalPruned += pruned
      } catch (err) {
        this.logger.error('Version pruning failed for file', {
          vaultId,
          relativePath,
          error: String(err),
        })
      }
    }

    if (totalPruned > 0) {
      this.logger.info('Versions pruned', { vaultId, totalPruned })
    }
  }

  /**
   * Recursively collects relative file paths that have version directories.
   * The `.slatebase/versions/` directory structure mirrors the vault structure:
   * `.slatebase/versions/<relativePath>/` contains version files for that file.
   * A leaf directory (containing files, not subdirectories that also contain files)
   * represents one versioned file.
   */
  private async collectVersionedFiles(
    baseDir: string,
    currentDir: string,
  ): Promise<string[]> {
    const results: string[] = []

    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      return results
    }

    const subdirs = entries.filter((e) => e.isDirectory())
    const files = entries.filter((e) => e.isFile())

    if (files.length > 0 && subdirs.length === 0) {
      // This is a leaf directory — it contains version files for a single file
      const relativePath = path.relative(baseDir, currentDir)
      results.push(relativePath)
    } else {
      // Recurse into subdirectories
      for (const subdir of subdirs) {
        const subdirPath = path.join(currentDir, subdir.name)
        const subResults = await this.collectVersionedFiles(baseDir, subdirPath)
        results.push(...subResults)
      }

      // If this directory has both files and subdirectories, it's also a versioned file
      if (files.length > 0 && subdirs.length > 0) {
        const relativePath = path.relative(baseDir, currentDir)
        results.push(relativePath)
      }
    }

    return results
  }
}
