// ─── Re-exports from API layer ────────────────────────────────────────────────

export type {
  CommunityPluginEntry,
  RemotePluginManifest,
  PluginUpdateInfo,
  UpdateCheckResult,
  PluginInstallResult,
  BulkUpdateResult,
} from '../../api/index'

// ─── Local Display Types ──────────────────────────────────────────────────────

/** Status of a plugin in the store browser context */
export type PluginStoreStatus =
  | 'available'
  | 'installed'
  | 'update-available'
  | 'installing'
  | 'updating'
  | 'desktop-only'

/** Plugin entry enriched with local state for display purposes */
export interface PluginStoreDisplayEntry {
  /** Base plugin data from community list */
  id: string
  name: string
  author: string
  description: string
  repo: string
  /** Whether this plugin is installed in the current vault */
  isInstalled: boolean
  /** Installed version if available */
  installedVersion?: string
  /** Latest available version (from update check) */
  latestVersion?: string
  /** Whether an update is available */
  hasUpdate: boolean
  /** Current UI status */
  status: PluginStoreStatus
  /** Error message from last failed action */
  error?: string
  /** Release notes URL */
  /** Release notes URL */
  releaseUrl?: string
  /** Total download count of the latest release */
  downloads?: number
  /** ISO 8601 timestamp of last release publication */
  updatedAt?: string
}

/** Props for the search/filter component */
export interface PluginStoreFilters {
  searchQuery: string
  showCompatibleOnly: boolean
  showNotInstalled: boolean
}
