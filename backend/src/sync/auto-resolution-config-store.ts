// AutoResolutionConfigStore — Persistent auto-resolution configuration per vault

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { z } from 'zod'
import type { ILogger } from '../logger/index.js'
import type { AutoResolutionConfig } from './types.js'

// ─── Zod Schema ──────────────────────────────────────────────────────────────

/**
 * Zod schema for validating auto-resolution configuration.
 * Ensures the config conforms to the expected structure before returning it.
 */
export const autoResolutionConfigSchema = z.object({
  enabled: z.boolean(),
  strategies: z.record(
    z.enum(['content_conflict', 'local_deleted', 'remote_deleted', 'rename_conflict']),
    z.enum(['newer_wins', 'remote_wins', 'local_wins', 'skip']),
  ).default({}),
})

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Persistence layer for auto-resolution configuration.
 * Stores configuration as JSON files per vault on the filesystem.
 */
export interface IAutoResolutionConfigStore {
  /** Loads the auto-resolution config for a vault. Returns default if not found or invalid. */
  load(vaultId: string): Promise<AutoResolutionConfig>

  /** Saves the auto-resolution config for a vault atomically. */
  save(vaultId: string, config: AutoResolutionConfig): Promise<void>
}

// ─── Default Config ──────────────────────────────────────────────────────────

/** Default auto-resolution configuration (disabled, no strategies). */
const DEFAULT_CONFIG: AutoResolutionConfig = {
  enabled: false,
  strategies: {},
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-based persistence for auto-resolution configuration.
 * Stores each vault's config as `data/sync/<vaultId>/auto-resolution.json`.
 * All writes are atomic (temp file → rename).
 * Returns default config on load failures (never throws on load).
 */
export class AutoResolutionConfigStore implements IAutoResolutionConfigStore {
  private readonly syncDir: string

  constructor(
    dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.syncDir = path.join(dataDir, 'sync')
  }

  /**
   * Loads the auto-resolution config for a vault.
   * Returns the default config if the file does not exist or validation fails.
   * Never throws — logs errors and falls back to default.
   * @param vaultId - The vault identifier.
   * @returns The auto-resolution configuration.
   */
  async load(vaultId: string): Promise<AutoResolutionConfig> {
    const filePath = this.getConfigPath(vaultId)

    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      const result = autoResolutionConfigSchema.safeParse(parsed)

      if (!result.success) {
        this.logger.error('Invalid auto-resolution config, using default', {
          vaultId,
          errors: result.error.issues.map(i => i.message),
        })
        return { ...DEFAULT_CONFIG }
      }

      return result.data as AutoResolutionConfig
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return { ...DEFAULT_CONFIG }
      }
      this.logger.error('Failed to load auto-resolution config, using default', {
        vaultId,
        error: String(error),
      })
      return { ...DEFAULT_CONFIG }
    }
  }

  /**
   * Saves the auto-resolution config for a vault atomically.
   * Creates the vault sync directory if it does not exist.
   * Uses temp file + rename for atomic writes.
   * @param vaultId - The vault identifier.
   * @param config - The auto-resolution configuration to persist.
   */
  async save(vaultId: string, config: AutoResolutionConfig): Promise<void> {
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
   * Returns the directory path for a vault's sync data.
   */
  private getVaultDir(vaultId: string): string {
    return path.join(this.syncDir, vaultId)
  }

  /**
   * Returns the file path for a vault's auto-resolution configuration.
   */
  private getConfigPath(vaultId: string): string {
    return path.join(this.syncDir, vaultId, 'auto-resolution.json')
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
