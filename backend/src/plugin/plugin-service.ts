// PluginService — Business-logic layer between plugin routes and the
// InstalledPluginStore/PluginInstaller, matching the routes → service → store
// layering used by vault/chat/user. Routes stay responsible for auth checks
// and HTTP status mapping; this service owns everything else.

import type { IInstalledPluginStore, PluginManifest, PluginRegistryData } from './types.js'
import type { IPluginInstaller, PluginInstallResult } from './plugin-installer.js'
import type { IEventBus } from '../realtime/types.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Business logic for managing the plugins of a vault: listing them (they live in the
 * vault's `.obsidian/plugins/` folder), installing from a ZIP, and reading/writing per-plugin data.
 */
export interface IPluginService {
  /** Installs a plugin from an uploaded ZIP buffer. */
  installFromZip(vaultId: string, zipBuffer: Buffer): Promise<PluginInstallResult>
  /** Saves the plugin registry (activation status, permissions). */
  saveRegistry(vaultId: string, registry: PluginRegistryData): Promise<void>
  /** Loads the plugin registry. */
  loadRegistry(vaultId: string): Promise<PluginRegistryData | null>
  /** Atomically read-modify-write the registry. See `IInstalledPluginStore.mutateRegistry`. */
  mutateRegistry(vaultId: string, fn: (current: PluginRegistryData | null) => PluginRegistryData): Promise<PluginRegistryData>
  /** Lists all plugins installed for a vault. */
  listPlugins(vaultId: string): Promise<PluginManifest[]>
  /** Loads a single plugin's manifest. */
  getManifest(vaultId: string, pluginId: string): Promise<PluginManifest | null>
  /** Deletes a plugin and all its data. */
  deletePlugin(vaultId: string, pluginId: string): Promise<void>
  /** Loads a plugin's bundle (main.js). */
  loadBundle(vaultId: string, pluginId: string): Promise<string | null>
  /** Loads a plugin's styles (styles.css). */
  loadStyles(vaultId: string, pluginId: string): Promise<string | null>
  /** Loads a plugin's settings (data.json). */
  loadSettings(vaultId: string, pluginId: string): Promise<string | null>
  /** Saves a plugin's settings (data.json). */
  saveSettings(vaultId: string, pluginId: string, data: string): Promise<void>
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class PluginService implements IPluginService {
  constructor(
    private readonly pluginStore: IInstalledPluginStore,
    private readonly pluginInstaller: IPluginInstaller,
    private readonly eventBus?: IEventBus,
  ) {}

  async installFromZip(vaultId: string, zipBuffer: Buffer): Promise<PluginInstallResult> {
    return this.pluginInstaller.installFromZip(vaultId, zipBuffer)
  }

  /**
   * Saves the registry and mirrors the activation into the vault's `community-plugins.json`
   * (the list Obsidian uses): active/loading plugins are added, inactive ones removed. A plugin
   * in `error` state keeps its place in the list — a failure to load it here says nothing about
   * Obsidian — and plugins the registry does not mention are left alone.
   * The list is updated first, so an invalid `community-plugins.json` rejects the save
   * (CommunityPluginsFileInvalidError) before anything is written.
   */
  async saveRegistry(vaultId: string, registry: PluginRegistryData): Promise<void> {
    // Only plugins that are really in the vault may be listed: the keys come from the request body.
    const installed = new Set((await this.pluginStore.listPlugins(vaultId)).map((manifest) => manifest.id))
    await this.pluginStore.updateEnabledIds(vaultId, (current) => {
      const next = new Set(current)
      for (const [pluginId, entry] of Object.entries(registry.plugins)) {
        if (entry.status === 'active' || entry.status === 'loading') {
          if (installed.has(pluginId)) next.add(pluginId)
        } else if (entry.status === 'inactive') {
          next.delete(pluginId)
        }
      }
      return [...next]
    })
    await this.pluginStore.saveRegistry(vaultId, registry)
  }

  /**
   * Loads the registry. The server's approval (`status: active`) only counts while the plugin is
   * also listed in the vault's `community-plugins.json`: disabling a plugin in Obsidian switches
   * it off here, and a plugin that merely arrives in the vault (sync, file API) or is enabled
   * only in Obsidian never starts here on its own — activating it in Slatebase is a separate,
   * explicit step.
   */
  async loadRegistry(vaultId: string): Promise<PluginRegistryData | null> {
    const registry = await this.pluginStore.loadRegistry(vaultId)
    if (registry === null) return null

    const enabled = new Set(await this.pluginStore.loadEnabledIds(vaultId))
    const plugins: PluginRegistryData['plugins'] = {}
    for (const [pluginId, entry] of Object.entries(registry.plugins)) {
      const switchedOff = (entry.status === 'active' || entry.status === 'loading') && !enabled.has(pluginId)
      plugins[pluginId] = switchedOff ? { ...entry, status: 'inactive' } : entry
    }
    return { ...registry, plugins }
  }

  async mutateRegistry(
    vaultId: string,
    fn: (current: PluginRegistryData | null) => PluginRegistryData,
  ): Promise<PluginRegistryData> {
    return this.pluginStore.mutateRegistry(vaultId, fn)
  }

  async listPlugins(vaultId: string): Promise<PluginManifest[]> {
    return this.pluginStore.listPlugins(vaultId)
  }

  async getManifest(vaultId: string, pluginId: string): Promise<PluginManifest | null> {
    return this.pluginStore.loadManifest(vaultId, pluginId)
  }

  async deletePlugin(vaultId: string, pluginId: string): Promise<void> {
    await this.pluginStore.deletePlugin(vaultId, pluginId)
  }

  async loadBundle(vaultId: string, pluginId: string): Promise<string | null> {
    return this.pluginStore.loadBundle(vaultId, pluginId)
  }

  async loadStyles(vaultId: string, pluginId: string): Promise<string | null> {
    return this.pluginStore.loadStyles(vaultId, pluginId)
  }

  async loadSettings(vaultId: string, pluginId: string): Promise<string | null> {
    return this.pluginStore.loadSettings(vaultId, pluginId)
  }

  async saveSettings(vaultId: string, pluginId: string, data: string): Promise<void> {
    await this.pluginStore.saveSettings(vaultId, pluginId, data)
    // Lets any other open tab/device with this plugin loaded for this vault
    // reload its settings instead of silently drifting from what was just
    // saved — the frontend's own recent-write tracker (settings-manager.ts)
    // suppresses this for the tab that made the write itself.
    this.eventBus?.publish({
      type: 'plugin-settings:change',
      payload: { vaultId, pluginId },
      target: { kind: 'broadcast' },
    })
  }
}
