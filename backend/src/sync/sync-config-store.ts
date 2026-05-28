// SyncConfigStore — Persistent sync configuration stored as JSON files per vault

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { ICryptoService, ISyncConfigStore, SyncConfig } from './types.js'

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-based persistence for sync configurations.
 * Stores each vault's config as `data/sync/<vaultId>/config.json`.
 * Credentials are stored encrypted via CryptoService.
 * All writes are atomic (temp file → rename).
 */
export class SyncConfigStore implements ISyncConfigStore {
  private readonly syncDir: string

  constructor(
    dataDir: string,
    private readonly cryptoService: ICryptoService,
    private readonly logger: ILogger,
  ) {
    this.syncDir = path.join(dataDir, 'sync')
  }

  /**
   * Saves a sync configuration atomically.
   * Creates the vault sync directory if it does not exist.
   * @param vaultId - The vault identifier.
   * @param config - The sync configuration to persist.
   */
  async save(vaultId: string, config: SyncConfig): Promise<void> {
    const dir = this.getVaultDir(vaultId)
    await fs.mkdir(dir, { recursive: true })

    const filePath = this.getConfigPath(vaultId)
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    const content = JSON.stringify(config, null, 2)

    await fs.writeFile(tempPath, content, 'utf-8')

    try {
      await fs.rename(tempPath, filePath)
    } catch (renameError) {
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw renameError
    }
  }

  /**
   * Loads a sync configuration for a vault.
   * Returns null if the config file does not exist.
   * Logs and returns null on corrupt/unreadable files.
   * @param vaultId - The vault identifier.
   * @returns The sync configuration or null.
   */
  async load(vaultId: string): Promise<SyncConfig | null> {
    const filePath = this.getConfigPath(vaultId)

    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const config: SyncConfig = JSON.parse(raw)
      return config
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null
      }
      this.logger.error('Failed to load sync config', { vaultId, error: String(error) })
      return null
    }
  }

  /**
   * Removes a sync configuration file for a vault.
   * Does nothing if the file does not exist.
   * @param vaultId - The vault identifier.
   */
  async remove(vaultId: string): Promise<void> {
    const filePath = this.getConfigPath(vaultId)

    try {
      await fs.unlink(filePath)
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      throw error
    }
  }

  /**
   * Loads all sync configurations across all vaults.
   * Scans the sync directory for vault subdirectories containing config.json.
   * Skips corrupt or unreadable files with error logging.
   * @returns Array of vault ID + config pairs.
   */
  async loadAll(): Promise<Array<{ vaultId: string; config: SyncConfig }>> {
    const results: Array<{ vaultId: string; config: SyncConfig }> = []

    let entries: string[]
    try {
      entries = await fs.readdir(this.syncDir)
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return results
      }
      throw error
    }

    for (const entry of entries) {
      const configPath = path.join(this.syncDir, entry, 'config.json')
      try {
        const raw = await fs.readFile(configPath, 'utf-8')
        const config: SyncConfig = JSON.parse(raw)
        results.push({ vaultId: entry, config })
      } catch (error: unknown) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          continue
        }
        this.logger.error('Failed to load sync config during loadAll', { vaultId: entry, error: String(error) })
      }
    }

    return results
  }

  /**
   * Returns the directory path for a vault's sync data.
   */
  private getVaultDir(vaultId: string): string {
    return path.join(this.syncDir, vaultId)
  }

  /**
   * Returns the file path for a vault's sync configuration.
   */
  private getConfigPath(vaultId: string): string {
    return path.join(this.syncDir, vaultId, 'config.json')
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
