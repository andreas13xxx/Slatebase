// VaultStatisticsService — Recursive vault statistics with caching and timeout

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { IVaultStatisticsService, VaultStatistics } from './types.js'
import { StatisticsTimeoutError } from './errors.js'

/** Directories excluded from statistics computation. */
const EXCLUDED_DIRS = new Set(['.trash', '.versions'])

/** Cached entry with timestamp. */
interface CacheEntry {
  stats: VaultStatistics
  computedAt: number
}

/**
 * Computes and caches vault statistics (file count, folder count, total size).
 * Uses recursive directory scanning with a 5-second AbortController timeout.
 */
export class VaultStatisticsService implements IVaultStatisticsService {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly TIMEOUT_MS = 5000

  constructor(
    private readonly getVaultPath: (vaultId: string) => string | undefined,
    private readonly logger: ILogger,
  ) {}

  /**
   * Returns statistics for a vault. Uses cached value if available,
   * otherwise performs a recursive scan with a 5-second timeout.
   * @throws StatisticsTimeoutError if computation exceeds 5 seconds
   */
  async getStatistics(vaultId: string): Promise<VaultStatistics> {
    const cached = this.cache.get(vaultId)
    if (cached) {
      return cached.stats
    }

    const vaultPath = this.getVaultPath(vaultId)
    if (vaultPath === undefined) {
      // Vault not found — return empty stats
      return { fileCount: 0, folderCount: 0, totalSizeBytes: 0 }
    }

    const stats = await this.computeWithTimeout(vaultId, vaultPath)
    this.cache.set(vaultId, { stats, computedAt: Date.now() })
    this.logger.debug('Vault statistics computed', { vaultId, ...stats })
    return stats
  }

  /**
   * Invalidates the cached statistics for a vault.
   * Called on vault:change SSE events to force re-computation on next access.
   */
  invalidateCache(vaultId: string): void {
    this.cache.delete(vaultId)
  }

  /**
   * Wraps the recursive scan with an AbortController timeout.
   */
  private async computeWithTimeout(vaultId: string, rootPath: string): Promise<VaultStatistics> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS)

    try {
      return await this.scanRecursive(rootPath, controller.signal)
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new StatisticsTimeoutError(vaultId)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Recursively scans a directory to compute statistics.
   * Filters out `.trash/`, `.versions/`, and `_`-prefix entries.
   */
  private async scanRecursive(dirPath: string, signal: AbortSignal): Promise<VaultStatistics> {
    if (signal.aborted) {
      throw new DOMException('Statistics computation aborted', 'AbortError')
    }

    let fileCount = 0
    let folderCount = 0
    let totalSizeBytes = 0

    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      // Directory unreadable — skip gracefully
      return { fileCount: 0, folderCount: 0, totalSizeBytes: 0 }
    }

    for (const entry of entries) {
      if (signal.aborted) {
        throw new DOMException('Statistics computation aborted', 'AbortError')
      }

      // Skip _-prefix entries (files and directories)
      if (entry.name.startsWith('_')) {
        continue
      }

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (EXCLUDED_DIRS.has(entry.name)) {
          continue
        }

        folderCount += 1
        const childPath = path.join(dirPath, entry.name)
        const childStats = await this.scanRecursive(childPath, signal)
        fileCount += childStats.fileCount
        folderCount += childStats.folderCount
        totalSizeBytes += childStats.totalSizeBytes
      } else if (entry.isFile()) {
        fileCount += 1
        try {
          const fileStat = await fs.stat(path.join(dirPath, entry.name))
          totalSizeBytes += fileStat.size
        } catch {
          // Cannot stat file — skip size contribution
        }
      }
    }

    return { fileCount, folderCount, totalSizeBytes }
  }
}
