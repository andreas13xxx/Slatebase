/**
 * Per-vault configuration data models.
 * Persisted as `.vault-config.json` inside each vault's data directory.
 */

// ─── Data Model ──────────────────────────────────────────────────────────────

/** Per-vault configuration settings. */
export interface VaultConfig {
  /** Directory for note templates (relative to vault root). Default: "_templates". */
  templatesDirectory: string
  /** Directory for daily notes (relative to vault root). Empty string = vault root. */
  dailyNotesDirectory: string
}

/** Default vault configuration values. */
export const DEFAULT_VAULT_CONFIG: VaultConfig = {
  templatesDirectory: '_templates',
  dailyNotesDirectory: '',
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
