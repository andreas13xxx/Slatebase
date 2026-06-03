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
  constructor(public readonly maxSize: number, public readonly actualSize: number) {
    super(`Plugin file exceeds maximum size of ${maxSize} bytes (actual: ${actualSize})`)
    this.name = 'PluginFileTooLargeError'
  }
}

/**
 * Thrown when plugin settings exceed the maximum allowed size of 1 MB.
 */
export class PluginSettingsTooLargeError extends Error {
  constructor(public readonly pluginId: string) {
    super(`Settings for plugin "${pluginId}" exceed maximum size of 1 MB`)
    this.name = 'PluginSettingsTooLargeError'
  }
}
