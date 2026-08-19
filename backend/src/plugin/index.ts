// ─── Plugin Module Barrel Export ──────────────────────────────────────────────

export { InstalledPluginStore } from './installed-plugin-store.js'
export { PluginInstaller, PluginInstallError, compareSemver } from './plugin-installer.js'
export { PluginService } from './plugin-service.js'
export { PluginSecretStore, SecretLimitExceededError, SecretTooLargeError } from './secret-store.js'
export { PluginSecretKeyManager } from './secret-key-manager.js'
export { PluginNotFoundError, PluginFileTooLargeError, PluginSettingsTooLargeError } from './errors.js'
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
export type { IPluginService, DetectedPluginInfo } from './plugin-service.js'
export type { IPluginSecretStore } from './secret-store.js'
export type { IPluginSecretKeyManager } from './secret-key-manager.js'
