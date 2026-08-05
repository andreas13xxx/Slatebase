// ─── Plugin Store Types ───────────────────────────────────────────────────────

/**
 * Entry from the community-plugins.json maintained by Obsidian.
 * Lists all available community plugins with basic metadata.
 */
export interface CommunityPluginEntry {
  /** Unique plugin identifier */
  id: string;
  /** Display name of the plugin */
  name: string;
  /** Plugin author name */
  author: string;
  /** Short description of the plugin */
  description: string;
  /** GitHub repository in "owner/repo" format */
  repo: string;
}

/**
 * Remote plugin manifest fetched from a GitHub repository.
 * Corresponds to the manifest.json in the plugin's repo.
 * Preserves unknown fields for forward compatibility.
 */
export interface RemotePluginManifest {
  /** Unique plugin identifier */
  id: string;
  /** Display name of the plugin */
  name: string;
  /** Semantic version string */
  version: string;
  /** Minimum app version required */
  minAppVersion?: string;
  /** Plugin author name */
  author?: string;
  /** Short description of the plugin */
  description?: string;
  /** Whether the plugin only works on desktop (Electron) */
  isDesktopOnly?: boolean;
  /** Additional unknown fields for forward compatibility */
  [key: string]: unknown;
}

/**
 * Update check result for a single installed plugin.
 * Compares the installed version against the latest remote version.
 */
export interface PluginUpdateInfo {
  /** Plugin identifier */
  pluginId: string;
  /** Currently installed version */
  installedVersion: string;
  /** Latest available version from GitHub */
  latestVersion: string;
  /** Whether an update is available */
  hasUpdate: boolean;
  /** GitHub Release URL for release notes */
  releaseUrl: string;
  /** GitHub repository in "owner/repo" format */
  repo: string;
}

/**
 * Update check result for all plugins in a vault.
 * Contains per-plugin update info and any errors encountered.
 */
export interface UpdateCheckResult {
  /** Update info for each successfully checked plugin */
  plugins: PluginUpdateInfo[];
  /** ISO 8601 timestamp of when the check was performed */
  checkedAt: string;
  /** Plugins that could not be checked (e.g. repo unreachable) */
  errors: Array<{ pluginId: string; reason: string }>;
}

/**
 * Request payload for installing a plugin from the community store.
 */
export interface StoreInstallRequest {
  /** Plugin identifier to install */
  pluginId: string;
  /** GitHub repository in "owner/repo" format */
  repo: string;
  /** Target vault ID for installation */
  vaultId: string;
}

/**
 * Configuration for the Plugin Store service.
 * Values are sourced from environment variables and config file.
 */
export interface IPluginStoreConfig {
  /** GitHub Personal Access Token for higher rate limits (optional) */
  githubToken?: string;
  /** Cache TTL for the community plugin list in milliseconds (default: 3600000 = 1h) */
  cacheTtlPluginList: number;
  /** Cache TTL for remote manifests in milliseconds (default: 900000 = 15min) */
  cacheTtlManifest: number;
  /** Maximum allowed size per individual asset in bytes (default: 10 * 1024 * 1024 = 10 MB) */
  maxAssetSize: number;
  /** Maximum total download size per plugin in bytes (default: 15 * 1024 * 1024 = 15 MB) */
  maxTotalDownloadSize: number;
  /** Interval for automatic update checks in milliseconds (default: 86400000 = 24h) */
  autoCheckInterval: number;
}

/**
 * Downloaded release assets for a plugin from GitHub.
 * Contains the raw file contents needed for installation.
 */
export interface PluginReleaseAssets {
  /** Plugin manifest (manifest.json) as raw buffer */
  manifest: Buffer;
  /** Plugin bundle (main.js) as raw buffer */
  bundle: Buffer;
  /** Plugin styles (styles.css) as raw buffer, null if not present */
  styles: Buffer | null;
}

/**
 * Result of installing or updating a single plugin.
 * Contains the installed manifest and any warnings encountered.
 */
export interface PluginInstallResult {
  /** Plugin identifier */
  pluginId: string;
  /** The installed manifest data */
  manifest: RemotePluginManifest;
  /** Whether this was an upgrade of an existing plugin */
  isUpgrade: boolean;
  /** Non-fatal warnings encountered during installation */
  warnings: string[];
}

/**
 * Result of a bulk update operation across multiple plugins.
 * Contains successful updates and any failures with reasons.
 */
export interface BulkUpdateResult {
  /** Successfully updated plugins */
  updated: PluginInstallResult[];
  /** Plugins that failed to update */
  failed: Array<{ pluginId: string; reason: string }>;
}

// ─── Plugin Release Stats ─────────────────────────────────────────────────────

/**
 * Release statistics for a single plugin.
 * Fetched from GitHub API (latest release download count + published date).
 */
export interface PluginReleaseStats {
  /** Plugin identifier */
  pluginId: string;
  /** Total download count across all assets of the latest release */
  downloads: number;
  /** ISO 8601 timestamp of the latest release publication */
  updatedAt: string;
}

/**
 * Aggregated release stats response for all plugins.
 * The backend caches this data to avoid excessive GitHub API calls.
 */
export interface PluginStatsResponse {
  /** Map of plugin ID → release stats */
  stats: Record<string, PluginReleaseStats>;
  /** ISO 8601 timestamp when the stats cache was last refreshed */
  cachedAt: string;
}
