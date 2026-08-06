/**
 * VaultConfigStore — filesystem persistence for per-vault configuration.
 * Each vault's config is stored as `.slatebase/config.json` inside the vault's data directory.
 * Uses atomic writes (temp → rename) for crash safety.
 */

import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { IVaultConfigService, VaultConfig } from './types.js'
import { DEFAULT_VAULT_CONFIG } from './types.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Config file path relative to vault root. */
const CONFIG_PATH = path.join('.slatebase', 'config.json')

const EMPTY_CONFIG: Partial<VaultConfig> = {}

function sanitizeConfig(raw: unknown): Partial<VaultConfig> {
  const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const result: Partial<VaultConfig> = {}
  if (typeof parsed.templatesDirectory === 'string') {
    result.templatesDirectory = parsed.templatesDirectory
  }
  if (typeof parsed.dailyNotesDirectory === 'string') {
    result.dailyNotesDirectory = parsed.dailyNotesDirectory
  }
  if (typeof parsed.dailyNoteTemplateName === 'string') {
    result.dailyNoteTemplateName = parsed.dailyNoteTemplateName
  }
  return result
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** Resolves a vault ID to its storage path, or null if not found. */
export type VaultPathResolver = (vaultId: string) => string | null

// ─── Implementation ──────────────────────────────────────────────────────────

export class VaultConfigStore implements IVaultConfigService {
  private readonly store: KeyedJsonFileStore<Partial<VaultConfig>>

  constructor(
    private readonly resolveVaultPath: VaultPathResolver,
    private readonly globalTemplatesDirectory: string,
    private readonly logger: ILogger,
  ) {
    this.store = new KeyedJsonFileStore<Partial<VaultConfig>>(
      (vaultId) => this.getFilePath(vaultId),
      EMPTY_CONFIG,
      sanitizeConfig,
      (error) => this.logger.error('Failed to load vault config', { error: String(error) }),
    )
  }

  async getConfig(vaultId: string): Promise<VaultConfig> {
    const stored = await this.store.read(vaultId)
    return {
      templatesDirectory: stored.templatesDirectory ?? this.globalTemplatesDirectory,
      dailyNotesDirectory: stored.dailyNotesDirectory ?? DEFAULT_VAULT_CONFIG.dailyNotesDirectory,
      dailyNoteTemplateName: stored.dailyNoteTemplateName ?? DEFAULT_VAULT_CONFIG.dailyNoteTemplateName,
    }
  }

  async saveConfig(vaultId: string, config: Partial<VaultConfig>): Promise<VaultConfig> {
    const merged = await this.store.mutate(vaultId, (current) => ({
      templatesDirectory: config.templatesDirectory ?? current.templatesDirectory ?? this.globalTemplatesDirectory,
      dailyNotesDirectory: config.dailyNotesDirectory ?? current.dailyNotesDirectory ?? DEFAULT_VAULT_CONFIG.dailyNotesDirectory,
      dailyNoteTemplateName: config.dailyNoteTemplateName ?? current.dailyNoteTemplateName ?? DEFAULT_VAULT_CONFIG.dailyNoteTemplateName,
    }))
    return merged as VaultConfig
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

  private getFilePath(vaultId: string): string {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (!vaultPath) {
      throw new Error(`Vault not found: ${vaultId}`)
    }
    return path.join(vaultPath, CONFIG_PATH)
  }
}
