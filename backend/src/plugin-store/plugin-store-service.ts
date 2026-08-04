// ─── Plugin Store Service ─────────────────────────────────────────────────────

import type { ILogger } from '../logger/index.js'
import type { IPluginStore, PluginManifest } from '../plugin/types.js'
import type { IGitHubClient } from './github-client.js'
import type { IPluginStoreCache } from './plugin-store-cache.js'
import type {
  BulkUpdateResult,
  CommunityPluginEntry,
  PluginInstallResult,
  RemotePluginManifest,
  UpdateCheckResult,
  PluginUpdateInfo,
} from './types.js'
import {
  DesktopOnlyPluginError,
  PluginNotInStoreError,
  UpstreamError,
} from './errors.js'

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Plugin Store Service — business logic for browsing, installing,
 * and updating community plugins from the Obsidian plugin registry.
 */
export interface IPluginStoreService {
  /** Get cached community plugin list */
  getPluginList(): Promise<CommunityPluginEntry[]>
  /** Get remote manifest for a single plugin */
  getRemoteManifest(repo: string): Promise<RemotePluginManifest>
  /** Install a plugin from the community store */
  installFromStore(vaultId: string, pluginId: string, repo: string): Promise<PluginInstallResult>
  /** Check for updates for all installed plugins in a vault */
  checkUpdates(vaultId: string): Promise<UpdateCheckResult>
  /** Update a single plugin to latest version */
  updatePlugin(vaultId: string, pluginId: string): Promise<PluginInstallResult>
  /** Update all plugins with available updates */
  updateAll(vaultId: string): Promise<BulkUpdateResult>
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Plugin Store Service implementation.
 * Orchestrates GitHub client, cache, and the local plugin store
 * to provide install, update, and browsing functionality.
 */
export class PluginStoreService implements IPluginStoreService {
  private readonly githubClient: IGitHubClient
  private readonly cache: IPluginStoreCache
  private readonly pluginStore: IPluginStore
  private readonly logger: ILogger

  constructor(
    githubClient: IGitHubClient,
    cache: IPluginStoreCache,
    pluginStore: IPluginStore,
    logger: ILogger
  ) {
    this.githubClient = githubClient
    this.cache = cache
    this.pluginStore = pluginStore
    this.logger = logger
  }

  /**
   * Get the community plugin list.
   * Returns cached data if fresh, otherwise fetches from GitHub.
   * Falls back to stale cache on upstream errors. Throws UpstreamError
   * if no data is available at all.
   */
  async getPluginList(): Promise<CommunityPluginEntry[]> {
    const cached = this.cache.getPluginList()
    if (cached !== null) {
      return cached
    }

    try {
      const plugins = await this.githubClient.fetchCommunityPlugins()
      this.cache.setPluginList(plugins)
      return plugins
    } catch (err: unknown) {
      this.logger.error('Failed to fetch community plugin list from GitHub', {
        error: err instanceof Error ? err.message : String(err),
      })

      const fallback = this.cache.getPluginListFallback()
      if (fallback !== null) {
        this.logger.info('Using stale cache fallback for plugin list')
        return fallback
      }

      throw new UpstreamError('Community plugin list unavailable and no cache fallback exists')
    }
  }

  /**
   * Get the remote manifest for a plugin repository.
   * Returns cached data if fresh, otherwise fetches from GitHub.
   * Falls back to stale cache on upstream errors.
   */
  async getRemoteManifest(repo: string): Promise<RemotePluginManifest> {
    const cached = this.cache.getManifest(repo)
    if (cached !== null) {
      return cached
    }

    try {
      const manifest = await this.githubClient.fetchManifest(repo)
      this.cache.setManifest(repo, manifest)
      return manifest
    } catch (err: unknown) {
      this.logger.error('Failed to fetch remote manifest from GitHub', {
        repo,
        error: err instanceof Error ? err.message : String(err),
      })

      const fallback = this.cache.getManifestFallback(repo)
      if (fallback !== null) {
        this.logger.info('Using stale cache fallback for manifest', { repo })
        return fallback
      }

      throw new UpstreamError(`Remote manifest for "${repo}" unavailable and no cache fallback exists`)
    }
  }

  /**
   * Install a plugin from the community store.
   * Downloads release assets, validates desktop-only status,
   * checks for existing installation (upgrade vs fresh install),
   * and saves the plugin files to the vault.
   */
  async installFromStore(vaultId: string, pluginId: string, repo: string): Promise<PluginInstallResult> {
    this.logger.info('Installing plugin from store', { vaultId, pluginId, repo })

    // Fetch remote manifest to check isDesktopOnly
    const remoteManifest = await this.getRemoteManifest(repo)

    if (remoteManifest.isDesktopOnly === true) {
      throw new DesktopOnlyPluginError(pluginId)
    }

    // Download release assets
    const assets = await this.githubClient.downloadReleaseAssets(repo)

    // Parse manifest from downloaded buffer
    const downloadedManifest: RemotePluginManifest = JSON.parse(
      assets.manifest.toString('utf-8')
    ) as RemotePluginManifest

    const warnings: string[] = []

    // Check if plugin is already installed
    const existingManifest = await this.pluginStore.loadManifest(vaultId, pluginId)

    if (existingManifest !== null) {
      // Compare versions — only upgrade if remote is higher
      if (!isVersionHigher(downloadedManifest.version, existingManifest.version)) {
        this.logger.info('Plugin already up to date, skipping install', {
          vaultId,
          pluginId,
          installedVersion: existingManifest.version,
          remoteVersion: downloadedManifest.version,
        })
        warnings.push(
          `Plugin is already at version ${existingManifest.version}, ` +
          `remote version ${downloadedManifest.version} is not higher`
        )
        return {
          pluginId,
          manifest: downloadedManifest,
          isUpgrade: false,
          warnings,
        }
      }
    }

    // Construct PluginFiles object (string-based, not Buffer)
    const pluginFiles: { manifest: string; bundle: string; styles?: string } = {
      manifest: assets.manifest.toString('utf-8'),
      bundle: assets.bundle.toString('utf-8'),
    }
    if (assets.styles !== null) {
      pluginFiles.styles = assets.styles.toString('utf-8')
    }

    // Save plugin to vault
    await this.pluginStore.savePlugin(vaultId, pluginId, pluginFiles)

    const isUpgrade = existingManifest !== null

    this.logger.info('Plugin installed successfully', {
      vaultId,
      pluginId,
      version: downloadedManifest.version,
      isUpgrade,
    })

    // Invalidate update check cache for this vault
    this.cache.invalidateUpdateCheck(vaultId)

    return {
      pluginId,
      manifest: downloadedManifest,
      isUpgrade,
      warnings,
    }
  }

  /**
   * Check for updates for all installed plugins in a vault.
   * Returns cached results if still fresh. Otherwise iterates
   * all installed plugins, compares against remote versions,
   * and collects results. Individual plugin errors are captured
   * without failing the entire check.
   */
  async checkUpdates(vaultId: string): Promise<UpdateCheckResult> {
    // Check cache first
    const cached = this.cache.getUpdateCheck(vaultId)
    if (cached !== null) {
      return cached
    }

    this.logger.info('Running update check for vault', { vaultId })

    // List installed plugins
    const installedPlugins = await this.pluginStore.listPlugins(vaultId)

    // Get community plugin list for repo lookup
    let communityPlugins: CommunityPluginEntry[]
    try {
      communityPlugins = await this.getPluginList()
    } catch {
      throw new UpstreamError('Cannot check updates: community plugin list unavailable')
    }

    const plugins: PluginUpdateInfo[] = []
    const errors: Array<{ pluginId: string; reason: string }> = []

    for (const installed of installedPlugins) {
      try {
        const updateInfo = await this.checkSinglePluginUpdate(installed, communityPlugins)
        if (updateInfo !== null) {
          plugins.push(updateInfo)
        }
      } catch (err: unknown) {
        errors.push({
          pluginId: installed.id,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const result: UpdateCheckResult = {
      plugins,
      checkedAt: new Date().toISOString(),
      errors,
    }

    // Cache the result
    this.cache.setUpdateCheck(vaultId, result)

    this.logger.info('Update check complete', {
      vaultId,
      totalChecked: installedPlugins.length,
      updatesFound: plugins.filter((p) => p.hasUpdate).length,
      errors: errors.length,
    })

    return result
  }

  /**
   * Update a single plugin to the latest version.
   * Looks up the plugin's repository in the community plugin list,
   * then delegates to installFromStore for the actual upgrade.
   */
  async updatePlugin(vaultId: string, pluginId: string): Promise<PluginInstallResult> {
    this.logger.info('Updating plugin', { vaultId, pluginId })

    // Get community plugin list to find the repo
    const communityPlugins = await this.getPluginList()
    const entry = communityPlugins.find((p) => p.id === pluginId)

    if (!entry) {
      throw new PluginNotInStoreError(pluginId)
    }

    return this.installFromStore(vaultId, pluginId, entry.repo)
  }

  /**
   * Update all plugins that have available updates.
   * Runs checkUpdates first, then updates each plugin with
   * hasUpdate === true sequentially. Collects successes and failures.
   */
  async updateAll(vaultId: string): Promise<BulkUpdateResult> {
    this.logger.info('Starting bulk update for vault', { vaultId })

    const checkResult = await this.checkUpdates(vaultId)
    const pluginsToUpdate = checkResult.plugins.filter((p) => p.hasUpdate)

    const updated: PluginInstallResult[] = []
    const failed: Array<{ pluginId: string; reason: string }> = []

    for (const plugin of pluginsToUpdate) {
      try {
        const result = await this.updatePlugin(vaultId, plugin.pluginId)
        updated.push(result)
      } catch (err: unknown) {
        failed.push({
          pluginId: plugin.pluginId,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }

    this.logger.info('Bulk update complete', {
      vaultId,
      updated: updated.length,
      failed: failed.length,
    })

    return { updated, failed }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Check a single installed plugin for updates against the community list.
   * Returns null if the plugin is not in the community list (e.g., manually installed).
   */
  private async checkSinglePluginUpdate(
    installed: PluginManifest,
    communityPlugins: CommunityPluginEntry[]
  ): Promise<PluginUpdateInfo | null> {
    // Find the plugin in the community list by ID
    const entry = communityPlugins.find((p) => p.id === installed.id)
    if (!entry) {
      // Plugin not in community list (manually installed), skip
      return null
    }

    // Fetch remote manifest to get the latest version
    const remoteManifest = await this.getRemoteManifest(entry.repo)

    const hasUpdate = isVersionHigher(remoteManifest.version, installed.version)

    return {
      pluginId: installed.id,
      installedVersion: installed.version,
      latestVersion: remoteManifest.version,
      hasUpdate,
      releaseUrl: `https://github.com/${entry.repo}/releases/latest`,
      repo: entry.repo,
    }
  }
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Compare two semantic version strings.
 * Returns true if `remote` is strictly higher than `installed`.
 * Splits on '.', compares major/minor/patch numerically.
 */
export function isVersionHigher(remote: string, installed: string): boolean {
  const remoteParts = remote.split('.').map(Number)
  const installedParts = installed.split('.').map(Number)

  const maxLength = Math.max(remoteParts.length, installedParts.length)

  for (let i = 0; i < maxLength; i++) {
    const r = remoteParts[i] ?? 0
    const inst = installedParts[i] ?? 0

    if (r > inst) return true
    if (r < inst) return false
  }

  return false
}
