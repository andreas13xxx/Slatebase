// ─── Plugin Module Barrel Export ──────────────────────────────────────────────

export { PluginStore } from './plugin-store.js'
export { PluginInstaller, PluginInstallError, compareSemver } from './plugin-installer.js'
export { PluginNotFoundError, PluginFileTooLargeError, PluginSettingsTooLargeError } from './errors.js'
export type {
  IPluginStore,
  PluginFiles,
  PluginManifest,
  PluginRegistryData,
  PluginStatus,
  PluginPermissions,
} from './types.js'
export type { IPluginInstaller, PluginInstallResult } from './plugin-installer.js'
