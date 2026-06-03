// ─── Plugin Types ─────────────────────────────────────────────────────────────

/**
 * Plugin manifest (from manifest.json).
 * Preserves unknown fields for round-trip compatibility.
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  author?: string;
  description?: string;
  authorUrl?: string;
  isDesktopOnly?: boolean;
  [key: string]: unknown;
}

/** Plugin activation status */
export type PluginStatus = 'active' | 'inactive' | 'error' | 'loading';

/** Plugin permission configuration */
export interface PluginPermissions {
  network: boolean;
  networkAllowlist: string[];
  filesystemWrite: boolean;
  domManipulation: boolean;
}

/**
 * Registry data model for _registry.json.
 * Stores activation status, permissions, and compatibility info per plugin.
 */
export interface PluginRegistryData {
  version: 1;
  plugins: Record<string, {
    status: PluginStatus;
    permissions: PluginPermissions;
    compatibilityLevel: 'full' | 'partial' | 'unsupported' | 'unknown';
    installedAt: string;
    updatedAt: string;
    error?: string;
  }>;
}

/** Files provided when saving a plugin */
export interface PluginFiles {
  manifest: string;
  bundle: string;
  styles?: string;
}

/**
 * Interface for the plugin filesystem store.
 * Manages plugin files, settings, and registry data.
 */
export interface IPluginStore {
  /** Save plugin files (manifest, bundle, styles) */
  savePlugin(vaultId: string, pluginId: string, files: PluginFiles): Promise<void>;
  /** Load plugin manifest */
  loadManifest(vaultId: string, pluginId: string): Promise<PluginManifest | null>;
  /** Load plugin bundle */
  loadBundle(vaultId: string, pluginId: string): Promise<string | null>;
  /** Load plugin styles */
  loadStyles(vaultId: string, pluginId: string): Promise<string | null>;
  /** Save plugin settings */
  saveSettings(vaultId: string, pluginId: string, data: string): Promise<void>;
  /** Load plugin settings */
  loadSettings(vaultId: string, pluginId: string): Promise<string | null>;
  /** List all plugins for a vault */
  listPlugins(vaultId: string): Promise<PluginManifest[]>;
  /** Delete a plugin and all its data */
  deletePlugin(vaultId: string, pluginId: string): Promise<void>;
  /** Delete all plugins for a vault */
  deleteAllForVault(vaultId: string): Promise<void>;
  /** Save plugin registry (activation status, permissions) */
  saveRegistry(vaultId: string, registry: PluginRegistryData): Promise<void>;
  /** Load plugin registry */
  loadRegistry(vaultId: string): Promise<PluginRegistryData | null>;
}
