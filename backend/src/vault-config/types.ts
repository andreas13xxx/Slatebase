/**
 * Per-vault configuration data models.
 * Persisted as `.slatebase/config.json` inside each vault's data directory.
 */

// ─── Data Model ──────────────────────────────────────────────────────────────

/** Per-vault configuration settings. */
export interface VaultConfig {
  /** Directory for note templates (relative to vault root). Default: "Templates". */
  templatesDirectory: string
  /** Directory for daily notes (relative to vault root). Empty string = vault root. */
  dailyNotesDirectory: string
  /** Filename of the daily note template (relative to templatesDirectory). Default: "daily.md". */
  dailyNoteTemplateName: string
  /**
   * Directory for new unique notes (relative to vault root). Empty string =
   * vault root. A unique note is created with a timestamp prefix name
   * (`YYYYMMDDHHmmss`), Obsidian's Zettelkasten convention — the folder is the
   * one configurable part; the timestamp format is fixed.
   */
  uniqueNoteDirectory: string
  /**
   * How many days of activity-timeline events to retain for this vault before
   * the periodic cleanup job prunes them. Default 90. 0 disables pruning.
   */
  activityRetentionDays: number
}

/** Default vault configuration values. */
export const DEFAULT_VAULT_CONFIG: VaultConfig = {
  templatesDirectory: 'Templates',
  dailyNotesDirectory: '',
  dailyNoteTemplateName: 'daily.md',
  uniqueNoteDirectory: '',
  activityRetentionDays: 90,
}

// ─── Service Interface ───────────────────────────────────────────────────────

/** Service for reading and writing per-vault configuration. */
export interface IVaultConfigService {
  /** Get the configuration for a vault. Returns defaults for missing fields. */
  getConfig(vaultId: string): Promise<VaultConfig>
  /** Save the configuration for a vault. Merges with defaults. */
  saveConfig(vaultId: string, config: Partial<VaultConfig>): Promise<VaultConfig>
  /** Get the templates directory for a vault (convenience method). */
  getTemplatesDirectory(vaultId: string): Promise<string>
  /** Get the daily notes directory for a vault (convenience method). */
  getDailyNotesDirectory(vaultId: string): Promise<string>
}
