/**
 * VaultConfigStore — filesystem persistence for per-vault configuration.
 * Each vault's config is stored as `.slatebase/config.json` inside the vault's data directory.
 * Uses atomic writes (temp → rename) for crash safety.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { IVaultConfigService, VaultConfig } from './types.js'
import { DEFAULT_VAULT_CONFIG } from './types.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Config file path relative to vault root. */
const CONFIG_PATH = path.join('.slatebase', 'config.json')

// ─── Types ───────────────────────────────────────────────────────────────────

/** Resolves a vault ID to its storage path, or null if not found. */
export type VaultPathResolver = (vaultId: string) => string | null

// ─── Implementation ──────────────────────────────────────────────────────────

export class VaultConfigStore implements IVaultConfigService {
  constructor(
    private readonly resolveVaultPath: VaultPathResolver,
    private readonly globalTemplatesDirectory: string,
    private readonly logger: ILogger,
  ) {}

  async getConfig(vaultId: string): Promise<VaultConfig> {
    const stored = await this.load(vaultId)
    return {
      templatesDirectory: stored.templatesDirectory ?? this.globalTemplatesDirectory,
      dailyNotesDirectory: stored.dailyNotesDirectory ?? DEFAULT_VAULT_CONFIG.dailyNotesDirectory,
    }
  }

  async saveConfig(vaultId: string, config: Partial<VaultConfig>): Promise<VaultConfig> {
    const current = await this.load(vaultId)
    const merged: VaultConfig = {
      templatesDirectory: config.templatesDirectory ?? current.templatesDirectory ?? this.globalTemplatesDirectory,
      dailyNotesDirectory: config.dailyNotesDirectory ?? current.dailyNotesDirectory ?? DEFAULT_VAULT_CONFIG.dailyNotesDirectory,
    }
    await this.persist(vaultId, merged)
    return merged
  }

  async getTemplatesDirectory(vaultId: string): Promise<string> {
    const config = await this.getConfig(vaultId)
    return config.templatesDirectory
  }

  async getDailyNotesDirectory(vaultId: string): Promise<string> {
    const config = await this.getConfig(vaultId)
    return config.dailyNotesDirectory
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private getFilePath(vaultId: string): string | null {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (!vaultPath) return null
    return path.join(vaultPath, CONFIG_PATH)
  }

  private async load(vaultId: string): Promise<Partial<VaultConfig>> {
    const filePath = this.getFilePath(vaultId)
    if (!filePath) return {}

    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const result: Partial<VaultConfig> = {}
      if (typeof parsed.templatesDirectory === 'string') {
        result.templatesDirectory = parsed.templatesDirectory
      }
      if (typeof parsed.dailyNotesDirectory === 'string') {
        result.dailyNotesDirectory = parsed.dailyNotesDirectory
      }
      return result
    } catch (error: unknown) {
      if (this.isNodeError(error) && error.code === 'ENOENT') {
        return {}
      }
      this.logger.error('Failed to load vault config', { vaultId, error: String(error) })
      return {}
    }
  }

  private async persist(vaultId: string, config: VaultConfig): Promise<void> {
    const filePath = this.getFilePath(vaultId)
    if (!filePath) {
      throw new Error(`Vault not found: ${vaultId}`)
    }

    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })

    const tmpSuffix = crypto.randomBytes(8).toString('hex')
    const tmpPath = `${filePath}.${tmpSuffix}.tmp`

    try {
      await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf-8')
      await fs.rename(tmpPath, filePath)
    } catch (error: unknown) {
      try { await fs.unlink(tmpPath) } catch { /* ignore */ }
      this.logger.error('Failed to persist vault config', { vaultId, error: String(error) })
      throw error
    }
  }

  private isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error
  }
}
