/**
 * Per-vault configuration data models.
 *
 * The template folder and the daily-note settings live in the vault's Obsidian files
 * (`.obsidian/templates.json`, `.obsidian/daily-notes.json`), the source of truth; the rest is
 * Slatebase-only and persisted as `.slatebase/config.json`.
 */

// ─── Data Model ──────────────────────────────────────────────────────────────

/** Per-vault configuration settings. */
export interface VaultConfig {
  /** Directory for note templates (relative to vault root). `templates.json` `folder`. Default: "Templates". */
  templatesDirectory: string
  /** Directory for daily notes (relative to vault root). `daily-notes.json` `folder`. Empty string = vault root. */
  dailyNotesDirectory: string
  /**
   * Vault path of the daily note template, with `.md`. `daily-notes.json` `template`. Empty string =
   * no template. Default: "<templatesDirectory>/daily.md".
   */
  dailyNoteTemplate: string
  /**
   * The Moment pattern `daily-notes.json` names daily notes by, or null if the file does not say.
   * Read-only: Slatebase always names them `YYYY-MM-DD.md`.
   */
  dailyNoteFormat: string | null
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
  dailyNoteTemplate: 'Templates/daily.md',
  dailyNoteFormat: null,
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
