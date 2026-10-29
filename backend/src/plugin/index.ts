// ─── Plugin Module Barrel Export ──────────────────────────────────────────────

export { InstalledPluginStore } from './installed-plugin-store.js'
export { PluginInstaller, PluginInstallError, compareSemver } from './plugin-installer.js'
export { PluginService } from './plugin-service.js'
export { migrateLegacyPlugins, LEGACY_PLUGINS_MIGRATED_MARKER } from './legacy-migration.js'
export { PluginSecretKeyManager, PluginSecretKeyError } from './secret-key-manager.js'
export {
  PluginNotFoundError,
  PluginFileTooLargeError,
  PluginSettingsTooLargeError,
  CommunityPluginsFileInvalidError,
  PluginVaultUnavailableError,
} from './errors.js'
export { PLUGIN_ID_PATTERN, isValidPluginId } from './validation.js'
export type {
  IInstalledPluginStore,
  PluginFiles,
  PluginManifest,
  PluginRegistryData,
  PluginStatus,
  PluginPermissions,
} from './types.js'
export type { IPluginInstaller, PluginInstallResult } from './plugin-installer.js'
export type { IPluginService } from './plugin-service.js'
export type { VaultPathResolver } from './installed-plugin-store.js'
export type { IPluginSecretKeyManager } from './secret-key-manager.js'
