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
   * Directory for new attachments (relative to vault root). Empty string = same
   * folder as the note being edited (Slatebase's long-standing default, so an
   * unconfigured vault sees no change in behavior). A non-empty value pins every
   * upload — drag-drop, paste, and "Insert attachment" — to that one directory
   * regardless of which note is open, mirroring Obsidian's "specified folder" mode.
   */
  attachmentsDirectory: string
}

/** Default vault configuration values. */
export const DEFAULT_VAULT_CONFIG: VaultConfig = {
  templatesDirectory: 'Templates',
  dailyNotesDirectory: '',
  dailyNoteTemplateName: 'daily.md',
  attachmentsDirectory: '',
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
