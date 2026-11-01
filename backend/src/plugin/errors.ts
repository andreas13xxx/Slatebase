import { PLUGIN_LIMITS, formatPluginLimit } from '@slatebase/shared-contracts'

// ─── Plugin Error Classes ─────────────────────────────────────────────────────

/**
 * Thrown when a plugin cannot be found for the given vault and plugin ID.
 */
export class PluginNotFoundError extends Error {
  constructor(public readonly vaultId: string, public readonly pluginId: string) {
    super(`Plugin "${pluginId}" not found in vault "${vaultId}"`)
    this.name = 'PluginNotFoundError'
  }
}

/**
 * Thrown when a plugin file exceeds the maximum allowed size.
 */
export class PluginFileTooLargeError extends Error {
  constructor(public readonly maxSize: number, public readonly actualSize: number, public readonly fileName?: string) {
    super(`Plugin file${fileName ? ` ${fileName}` : ''} exceeds maximum size of ${formatPluginLimit(maxSize)} (actual: ${formatPluginLimit(actualSize)}, ${actualSize} bytes)`)
    this.name = 'PluginFileTooLargeError'
  }
}

/**
 * Thrown when plugin settings exceed the maximum allowed size (PLUGIN_LIMITS.maxSettingsBytes).
 */
export class PluginSettingsTooLargeError extends Error {
  constructor(public readonly pluginId: string, public readonly actualSize?: number) {
    super(`Settings for plugin "${pluginId}" exceed maximum size of ${formatPluginLimit(PLUGIN_LIMITS.maxSettingsBytes)}${actualSize === undefined ? '' : ` (actual: ${actualSize} bytes)`}`)
    this.name = 'PluginSettingsTooLargeError'
  }
}

/**
 * Thrown when `.obsidian/community-plugins.json` exists but is not a JSON array.
 * The file is never overwritten in that case — it may be mid-sync or hand-edited.
 */
export class CommunityPluginsFileInvalidError extends Error {
  constructor() {
    super('.obsidian/community-plugins.json is not a valid JSON array; leaving it untouched')
    this.name = 'CommunityPluginsFileInvalidError'
  }
}

/**
 * Thrown when a vault id has no storage path (unknown vault).
 */
export class PluginVaultUnavailableError extends Error {
  constructor(public readonly vaultId: string) {
    super(`Vault "${vaultId}" is not available`)
    this.name = 'PluginVaultUnavailableError'
  }
}
