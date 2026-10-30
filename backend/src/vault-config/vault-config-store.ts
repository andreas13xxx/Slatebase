/**
 * VaultConfigStore — per-vault configuration.
 *
 * The template folder and the daily-note settings are read from and written to the vault's Obsidian
 * files (`.obsidian/templates.json`, `.obsidian/daily-notes.json`, see obsidian-config/note-config.ts),
 * the single source of truth. Everything Slatebase-only (`uniqueNoteDirectory`, `activityRetentionDays`)
 * is stored as `.slatebase/config.json` inside the vault's data directory, with atomic writes.
 */

import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { IVaultConfigService, VaultConfig } from './types.js'
import { DEFAULT_VAULT_CONFIG } from './types.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'
import type { INoteConfigService } from '../obsidian-config/index.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Config file path relative to vault root. */
const CONFIG_PATH = path.join('.slatebase', 'config.json')

/** The part of the configuration that is Slatebase's own. */
type OwnConfig = Pick<VaultConfig, 'uniqueNoteDirectory' | 'activityRetentionDays'>

const EMPTY_CONFIG: Partial<OwnConfig> = {}

/** The template file a vault gets when `daily-notes.json` names none (the earlier Slatebase default). */
const DEFAULT_DAILY_TEMPLATE_NAME = 'daily.md'

function sanitizeConfig(raw: unknown): Partial<OwnConfig> {
  const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const result: Partial<OwnConfig> = {}
  if (typeof parsed.uniqueNoteDirectory === 'string') {
    result.uniqueNoteDirectory = parsed.uniqueNoteDirectory
  }
  if (typeof parsed.activityRetentionDays === 'number' && Number.isInteger(parsed.activityRetentionDays)) {
    result.activityRetentionDays = parsed.activityRetentionDays
  }
  return result
}

/** Folders in the Obsidian files may carry surrounding slashes; Slatebase works with plain relative paths. */
function trimSlashes(folder: string): string {
  return folder.trim().replace(/^[\\/]+|[\\/]+$/g, '')
}

function withMarkdownExtension(template: string): string {
  return /\.md$/i.test(template) ? template : `${template}.md`
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** Resolves a vault ID to its storage path, or null if not found. */
export type VaultPathResolver = (vaultId: string) => string | null

// ─── Implementation ──────────────────────────────────────────────────────────

export class VaultConfigStore implements IVaultConfigService {
  private readonly store: KeyedJsonFileStore<Partial<OwnConfig>>

  constructor(
    private readonly resolveVaultPath: VaultPathResolver,
    private readonly globalTemplatesDirectory: string,
    private readonly logger: ILogger,
    private readonly noteConfig: INoteConfigService,
  ) {
    this.store = new KeyedJsonFileStore<Partial<OwnConfig>>(
      (vaultId) => this.getFilePath(vaultId),
      EMPTY_CONFIG,
      sanitizeConfig,
      (error) => this.logger.error('Failed to load vault config', { error: String(error) }),
    )
  }

  async getConfig(vaultId: string): Promise<VaultConfig> {
    const own = await this.store.read(vaultId)
    const note = await this.noteConfig.get(this.getVaultPath(vaultId))

    const templatesDirectory = note.templatesFolder !== null && trimSlashes(note.templatesFolder) !== ''
      ? trimSlashes(note.templatesFolder)
      : this.globalTemplatesDirectory
    // An explicit empty template means "no template"; a missing key keeps the earlier default.
    const dailyNoteTemplate = note.dailyTemplate === null
      ? `${templatesDirectory}/${DEFAULT_DAILY_TEMPLATE_NAME}`
      : note.dailyTemplate.trim() === '' ? '' : withMarkdownExtension(trimSlashes(note.dailyTemplate))

    return {
      templatesDirectory,
      dailyNotesDirectory: note.dailyFolder !== null ? trimSlashes(note.dailyFolder) : DEFAULT_VAULT_CONFIG.dailyNotesDirectory,
      dailyNoteTemplate,
      dailyNoteFormat: note.dailyFormat,
      uniqueNoteDirectory: own.uniqueNoteDirectory ?? DEFAULT_VAULT_CONFIG.uniqueNoteDirectory,
      activityRetentionDays: own.activityRetentionDays ?? DEFAULT_VAULT_CONFIG.activityRetentionDays,
    }
  }

  async saveConfig(vaultId: string, config: Partial<VaultConfig>): Promise<VaultConfig> {
    // Obsidian's files first: if one of them is invalid JSON the save is refused before anything else is written.
    await this.noteConfig.patch(this.getVaultPath(vaultId), {
      ...(config.templatesDirectory !== undefined ? { templatesFolder: config.templatesDirectory } : {}),
      ...(config.dailyNotesDirectory !== undefined ? { dailyFolder: config.dailyNotesDirectory } : {}),
      ...(config.dailyNoteTemplate !== undefined ? { dailyTemplate: config.dailyNoteTemplate } : {}),
    })

    if (config.uniqueNoteDirectory !== undefined || config.activityRetentionDays !== undefined) {
      await this.store.mutate(vaultId, (current) => ({
        ...current,
        ...(config.uniqueNoteDirectory !== undefined ? { uniqueNoteDirectory: config.uniqueNoteDirectory } : {}),
        ...(config.activityRetentionDays !== undefined ? { activityRetentionDays: config.activityRetentionDays } : {}),
      }))
    }
    return this.getConfig(vaultId)
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

  private getVaultPath(vaultId: string): string {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (!vaultPath) {
      throw new Error(`Vault not found: ${vaultId}`)
    }
    return vaultPath
  }

  private getFilePath(vaultId: string): string {
    return path.join(this.getVaultPath(vaultId), CONFIG_PATH)
  }
}
