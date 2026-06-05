/**
 * PluginRegistry — Frontend state management for installed plugins.
 *
 * Manages plugin list, status, permissions, and compatibility level.
 * Persists activation status via the backend API.
 *
 * @module plugin-registry
 */

import type {
  PluginManifestData,
  PluginPermissions,
  PluginRegistryEntry,
  PluginStatus,
} from './types';

/**
 * IPluginRegistry — Interface for plugin registry operations.
 */
export interface IPluginRegistry {
  /** Get all registered plugins */
  listPlugins(): PluginRegistryEntry[];
  /** Register a new plugin with default permissions and 'unknown' compatibility */
  register(manifest: PluginManifestData, status: PluginStatus): void;
  /** Update plugin status (and optional error message), persists to backend */
  updateStatus(pluginId: string, status: PluginStatus, error?: string): void;
  /** Remove a plugin from registry, persists to backend */
  remove(pluginId: string): void;
  /** Get plugin permissions */
  getPermissions(pluginId: string): PluginPermissions;
  /** Set plugin permissions, persists to backend */
  setPermissions(pluginId: string, permissions: PluginPermissions): void;
  /** Set compatibility level for a plugin */
  setCompatibilityLevel(pluginId: string, level: PluginRegistryEntry['compatibilityLevel']): void;
  /** Load registry state from backend (called on startup) */
  loadFromBackend(): Promise<void>;
  /** Save registry state to backend (called after changes) */
  persistToBackend(): Promise<void>;
}

/**
 * IRegistryApiClient — Minimal API client interface required by PluginRegistry.
 * The backend methods may not exist yet; the registry handles errors gracefully.
 */
export interface IRegistryApiClient {
  loadRegistry?(vaultId: string): Promise<PluginRegistryData | null>;
  saveRegistry?(vaultId: string, data: PluginRegistryData): Promise<void>;
}

/**
 * PluginRegistryData — Serializable registry state for backend persistence.
 */
export interface PluginRegistryData {
  version: 1;
  plugins: Record<string, {
    status: PluginStatus;
    permissions: PluginPermissions;
    compatibilityLevel: PluginRegistryEntry['compatibilityLevel'];
    manifest: PluginManifestData;
    error?: string;
  }>;
}

/** Default deny-by-default permissions for new plugins (R8.7) */
const DEFAULT_PERMISSIONS: PluginPermissions = {
  network: false,
  networkAllowlist: [],
  filesystemWrite: false,
  domManipulation: false,
};

/**
 * PluginRegistry — Manages plugin list, status, permissions, and compatibility level.
 *
 * Uses a Map for O(1) lookup by pluginId. Persists state to the backend API
 * when status, permissions, or entries change.
 */
export class PluginRegistry implements IPluginRegistry {
  private readonly entries: Map<string, PluginRegistryEntry> = new Map();
  private readonly apiClient: IRegistryApiClient;
  private readonly vaultId: string;

  constructor(apiClient: IRegistryApiClient, vaultId: string) {
    this.apiClient = apiClient;
    this.vaultId = vaultId;
  }

  /** Returns all registry entries as an array. */
  listPlugins(): PluginRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Register a new plugin with default permissions and 'unknown' compatibility.
   * R8.7: New plugins default to deny-by-default permissions.
   */
  register(manifest: PluginManifestData, status: PluginStatus): void {
    const entry: PluginRegistryEntry = {
      pluginId: manifest.id,
      manifest,
      status,
      permissions: { ...DEFAULT_PERMISSIONS, networkAllowlist: [] },
      compatibilityLevel: 'unknown',
    };
    this.entries.set(manifest.id, entry);
  }

  /**
   * Update plugin status and optional error message.
   * R3.5: Persists activation status via backend API.
   */
  updateStatus(pluginId: string, status: PluginStatus, error?: string): void {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      return;
    }
    entry.status = status;
    if (error !== undefined) {
      entry.error = error;
    } else {
      delete entry.error;
    }
    void this.persistToBackend();
  }

  /**
   * Remove a plugin from the registry.
   * Persists the updated state to backend.
   */
  remove(pluginId: string): void {
    this.entries.delete(pluginId);
    void this.persistToBackend();
  }

  /**
   * Get plugin permissions. Returns default permissions if plugin not found.
   */
  getPermissions(pluginId: string): PluginPermissions {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      return { ...DEFAULT_PERMISSIONS, networkAllowlist: [] };
    }
    return entry.permissions;
  }

  /**
   * Set plugin permissions and persist to backend.
   */
  setPermissions(pluginId: string, permissions: PluginPermissions): void {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      return;
    }
    entry.permissions = permissions;
    void this.persistToBackend();
  }

  /**
   * Set the compatibility level for a plugin.
   */
  setCompatibilityLevel(pluginId: string, level: PluginRegistryEntry['compatibilityLevel']): void {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      return;
    }
    entry.compatibilityLevel = level;
  }

  /**
   * Load registry state from the backend.
   * Called on startup. Handles gracefully if the API method doesn't exist yet.
   */
  async loadFromBackend(): Promise<void> {
    try {
      if (!this.apiClient.loadRegistry) {
        return;
      }
      const data = await this.apiClient.loadRegistry(this.vaultId);
      if (!data || !data.plugins) {
        return;
      }
      this.entries.clear();
      for (const [pluginId, pluginData] of Object.entries(data.plugins)) {
        const entry: PluginRegistryEntry = {
          pluginId,
          manifest: pluginData.manifest ?? { id: pluginId, name: pluginId, version: '0.0.0' },
          status: pluginData.status,
          permissions: pluginData.permissions,
          compatibilityLevel: pluginData.compatibilityLevel,
          error: pluginData.error,
        };
        this.entries.set(pluginId, entry);
      }
    } catch {
      // Gracefully handle errors — backend API may not be available yet
      console.warn(`[PluginRegistry] Failed to load registry from backend for vault "${this.vaultId}"`);
    }
  }

  /**
   * Save registry state to the backend.
   * Called after status, permissions, or entry changes.
   * Handles gracefully if the API method doesn't exist yet.
   */
  async persistToBackend(): Promise<void> {
    try {
      if (!this.apiClient.saveRegistry) {
        return;
      }
      const data: PluginRegistryData = {
        version: 1,
        plugins: {},
      };
      for (const [pluginId, entry] of this.entries) {
        const pluginData: Record<string, unknown> = {
          status: entry.status,
          permissions: entry.permissions,
          compatibilityLevel: entry.compatibilityLevel,
          installedAt: (entry as unknown as Record<string, unknown>).installedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (entry.error) {
          pluginData.error = entry.error;
        }
        data.plugins[pluginId] = pluginData as PluginRegistryData['plugins'][string];
      }
      await this.apiClient.saveRegistry(this.vaultId, data);
    } catch {
      // Gracefully handle errors — backend API may not be available yet
      console.warn(`[PluginRegistry] Failed to persist registry to backend for vault "${this.vaultId}"`);
    }
  }
}
