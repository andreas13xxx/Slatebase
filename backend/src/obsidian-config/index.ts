/**
 * obsidian-config module barrel export.
 * Typed access to the JSON config files Obsidian keeps in `<vault>/.obsidian/`.
 */

export type { IAppConfigService, AppConfigRequest, AppConfigValue } from './app-config.js'
export { DeviationReporter, noopDeviationReporter } from './deviation-reporter.js'
export type { ConfigDeviation, IDeviationReporter } from './deviation-reporter.js'
export { AppConfigService, appConfigRequestSchema } from './app-config.js'
export { migrateVaultConfigToObsidianFiles } from './legacy-migration.js'
export type { VaultConfigMigrationResult } from './legacy-migration.js'
export { migrateUserVaultSettingsToAppConfig } from './user-settings-migration.js'
export type { UserSettingsMigrationResult } from './user-settings-migration.js'
export type { INoteConfigService, NoteConfig, NoteConfigPatch } from './note-config.js'
export { NoteConfigService, SUPPORTED_DAILY_NOTE_FORMAT } from './note-config.js'
