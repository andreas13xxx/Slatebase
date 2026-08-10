// PluginService — Business-logic layer between plugin routes and the
// InstalledPluginStore/PluginInstaller, matching the routes → service → store
// layering used by vault/chat/user. Routes stay responsible for auth checks
// and HTTP status mapping; this service owns everything else.

import fs from 'node:fs/promises'
import path from 'node:path'
import type { IInstalledPluginStore, PluginManifest, PluginRegistryData } from './types.js'
import type { IPluginInstaller, PluginInstallResult } from './plugin-installer.js'
import { isNodeError } from '../shared/fs-utils.js'
import type { IEventBus } from '../realtime/types.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Detected plugin from .obsidian/plugins/ directory. */
export interface DetectedPluginInfo {
  /** Plugin folder name (used as plugin ID). */
  id: string
  /** Whether a manifest.json was found. */
  hasManifest: boolean
  /** Whether a main.js was found. */
  hasMainJs: boolean
}

/**
 * Business logic for managing plugins installed into a vault: browsing
 * detected/installed plugins, installing (from ZIP or from a detected
 * `.obsidian/plugins/` folder), and reading/writing per-plugin data.
 */
export interface IPluginService {
  /** Scans `.obsidian/plugins/` inside the given vault storage path. */
  listDetected(vaultStoragePath: string): Promise<DetectedPluginInfo[]>
  /** Installs a plugin detected under `.obsidian/plugins/<pluginId>/`. */
  installDetected(vaultId: string, pluginId: string, vaultStoragePath: string): Promise<PluginInstallResult>
  /** Installs a plugin from an uploaded ZIP buffer. */
  installFromZip(vaultId: string, zipBuffer: Buffer): Promise<PluginInstallResult>
  /** Saves the plugin registry (activation status, permissions). */
  saveRegistry(vaultId: string, registry: PluginRegistryData): Promise<void>
  /** Loads the plugin registry. */
  loadRegistry(vaultId: string): Promise<PluginRegistryData | null>
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

  async listDetected(vaultStoragePath: string): Promise<DetectedPluginInfo[]> {
    return scanObsidianPlugins(vaultStoragePath)
  }

  async installDetected(vaultId: string, pluginId: string, vaultStoragePath: string): Promise<PluginInstallResult> {
    return this.pluginInstaller.installFromDetected(vaultId, pluginId, vaultStoragePath)
  }

  async installFromZip(vaultId: string, zipBuffer: Buffer): Promise<PluginInstallResult> {
    return this.pluginInstaller.installFromZip(vaultId, zipBuffer)
  }

  async saveRegistry(vaultId: string, registry: PluginRegistryData): Promise<void> {
    await this.pluginStore.saveRegistry(vaultId, registry)
  }

  async loadRegistry(vaultId: string): Promise<PluginRegistryData | null> {
    return this.pluginStore.loadRegistry(vaultId)
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

// ─── Detected Plugin Scanner ─────────────────────────────────────────────────

/**
 * Scans the .obsidian/plugins/ directory inside a vault's storage path
 * and returns information about detected plugins (folder name, presence of manifest/bundle).
 * Returns empty array if .obsidian/plugins/ does not exist.
 */
async function scanObsidianPlugins(vaultStoragePath: string): Promise<DetectedPluginInfo[]> {
  const pluginsDir = path.join(vaultStoragePath, '.obsidian', 'plugins')

  let entries: string[]
  try {
    entries = await fs.readdir(pluginsDir)
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return []
    }
    throw error
  }

  const detected: DetectedPluginInfo[] = []

  for (const entry of entries) {
    const entryPath = path.join(pluginsDir, entry)

    let stat: import('node:fs').Stats
    try {
      stat = await fs.stat(entryPath)
    } catch {
      continue
    }

    if (!stat.isDirectory()) continue

    // Check for manifest.json and main.js
    let hasManifest = false
    let hasMainJs = false

    try {
      await fs.access(path.join(entryPath, 'manifest.json'))
      hasManifest = true
    } catch {
      // not found
    }

    try {
      await fs.access(path.join(entryPath, 'main.js'))
      hasMainJs = true
    } catch {
      // not found
    }

    detected.push({ id: entry, hasManifest, hasMainJs })
  }

  return detected
}
