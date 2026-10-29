/**
 * obsidian-config module barrel export.
 * Typed access to the JSON config files Obsidian keeps in `<vault>/.obsidian/`.
 */

export type { IAppConfigService, AppConfigRequest } from './app-config.js'
export { AppConfigService, appConfigRequestSchema } from './app-config.js'
export { migrateVaultConfigToObsidianFiles } from './legacy-migration.js'
export type { VaultConfigMigrationResult } from './legacy-migration.js'
