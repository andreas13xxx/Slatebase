/**
 * SettingsManager — Plugin settings persistence via backend API.
 *
 * Implements loadData/saveData for Obsidian plugin compatibility.
 * Settings are isolated per plugin-ID and vault-ID.
 * Handles circular references, network errors, and size limits gracefully.
 *
 * @module settings-manager
 */

/** Maximum allowed serialized settings size in bytes (1 MB). */
const MAX_SETTINGS_SIZE = 1_048_576;

/**
 * ISettingsApiClient — Minimal API client interface required by SettingsManager.
 * Methods are optional to handle gracefully when the backend doesn't exist yet.
 */
export interface ISettingsApiClient {
  loadSettings?(vaultId: string, pluginId: string): Promise<string | null>;
  saveSettings?(vaultId: string, pluginId: string, data: string): Promise<void>;
}

/**
 * ISettingsManager — Interface for plugin settings persistence.
 */
export interface ISettingsManager {
  /** Load settings for a plugin. Returns null on error or first call. */
  loadData(pluginId: string): Promise<unknown>;
  /** Save settings for a plugin. Validates JSON-serializable and ≤1 MB. */
  saveData(pluginId: string, data: unknown): Promise<void>;
}

/**
 * SettingsManager — Manages plugin settings persistence.
 *
 * Settings are keyed by (vaultId, pluginId) to ensure isolation.
 * R9.1: loadData() loads from backend as JSON
 * R9.2: saveData() validates ≤1MB, then persists
 * R9.3: Isolation per plugin-ID AND vault-ID
 * R9.4: On load error, return null and log
 * R9.5: On save >1MB, reject with error
 * R9.6: First call (no settings) returns null
 * R9.7: Non-serializable data (circular refs, functions) rejects with exception
 */
export class SettingsManager implements ISettingsManager {
  private readonly apiClient: ISettingsApiClient;
  private readonly vaultId: string;

  constructor(apiClient: ISettingsApiClient, vaultId: string) {
    this.apiClient = apiClient;
    this.vaultId = vaultId;
  }

  /**
   * Load settings for a plugin from the backend.
   *
   * R9.1: Loads as JSON and returns the parsed object.
   * R9.4: On network or parse error, returns null and logs to console.
   * R9.6: Returns null when no settings exist (first call).
   */
  async loadData(pluginId: string): Promise<unknown> {
    try {
      if (!this.apiClient.loadSettings) {
        console.warn(
          `[SettingsManager] loadSettings method not available on apiClient for plugin "${pluginId}"`
        );
        return null;
      }

      const raw = await this.apiClient.loadSettings(this.vaultId, pluginId);

      // R9.6: No settings exist yet
      if (raw === null || raw === undefined) {
        return null;
      }

      // Parse JSON — R9.4: on invalid JSON, return null
      const parsed: unknown = JSON.parse(raw);
      return parsed;
    } catch (error) {
      // R9.4: On load error (network, invalid JSON), return null and log
      console.error(
        `[SettingsManager] Failed to load settings for plugin "${pluginId}" in vault "${this.vaultId}":`,
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  /**
   * Save settings for a plugin to the backend.
   *
   * R9.2: Validates ≤1MB serialized, then persists.
   * R9.5: Rejects with error if serialized >1MB.
   * R9.7: Rejects with exception on non-serializable data (circular refs, functions).
   */
  async saveData(pluginId: string, data: unknown): Promise<void> {
    // R9.7: Validate JSON-serializable — throws on circular references or functions
    let serialized: string;
    try {
      serialized = JSON.stringify(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const serializationError = new Error(
        `Settings for plugin "${pluginId}" contain non-serializable data: ${message}`
      );
      console.error(
        `[SettingsManager] Save failed for plugin "${pluginId}" in vault "${this.vaultId}":`,
        serializationError.message
      );
      throw serializationError;
    }

    // R9.5: Enforce 1 MB size limit
    const byteLength = new TextEncoder().encode(serialized).length;
    if (byteLength > MAX_SETTINGS_SIZE) {
      const sizeError = new Error(
        `Settings for plugin "${pluginId}" exceed maximum size of 1 MB (actual: ${byteLength} bytes)`
      );
      console.error(
        `[SettingsManager] Save failed for plugin "${pluginId}" in vault "${this.vaultId}":`,
        sizeError.message
      );
      throw sizeError;
    }

    // R9.2: Persist to backend
    if (!this.apiClient.saveSettings) {
      console.warn(
        `[SettingsManager] saveSettings method not available on apiClient for plugin "${pluginId}"`
      );
      return;
    }

    await this.apiClient.saveSettings(this.vaultId, pluginId, serialized);
  }
}
