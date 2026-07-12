// PluginStore — Filesystem persistence for plugin files, settings, and registry

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { IPluginStore, PluginFiles, PluginManifest, PluginRegistryData } from './types.js'
import { PluginFileTooLargeError, PluginSettingsTooLargeError } from './errors.js'
import { isValidPluginId } from './validation.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum file size for plugin files (manifest, bundle, styles): 5 MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024

/** Maximum file size for plugin settings (data.json): 1 MB */
const MAX_SETTINGS_SIZE = 1 * 1024 * 1024

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-based persistence for plugin files and metadata.
 * Stores plugins under `data/plugins/<vaultId>/<pluginId>/`.
 * All writes are atomic (temp file → rename).
 */
export class PluginStore implements IPluginStore {
  private readonly pluginsDir: string

  constructor(dataDir: string) {
    this.pluginsDir = path.join(dataDir, 'plugins')
  }

  /**
   * Saves plugin files (manifest, bundle, optional styles) atomically.
   * Creates the plugin directory if it does not exist.
   * Validates file sizes before writing.
   */
  async savePlugin(vaultId: string, pluginId: string, files: PluginFiles): Promise<void> {
    this.validateFileSize(files.manifest, 'manifest.json')
    this.validateFileSize(files.bundle, 'main.js')
    if (files.styles !== undefined) {
      this.validateFileSize(files.styles, 'styles.css')
    }

    const dir = this.getPluginDir(vaultId, pluginId)
    await fs.mkdir(dir, { recursive: true })

    await this.atomicWrite(path.join(dir, 'manifest.json'), files.manifest)
    await this.atomicWrite(path.join(dir, 'main.js'), files.bundle)

    if (files.styles !== undefined) {
      await this.atomicWrite(path.join(dir, 'styles.css'), files.styles)
    }
  }

  /**
   * Loads a plugin manifest from disk.
   * Returns null if the file does not exist or cannot be parsed.
   */
  async loadManifest(vaultId: string, pluginId: string): Promise<PluginManifest | null> {
    const filePath = path.join(this.getPluginDir(vaultId, pluginId), 'manifest.json')
    return this.readJsonFile<PluginManifest>(filePath)
  }

  /**
   * Loads a plugin bundle (main.js) from disk.
   * Returns null if the file does not exist.
   */
  async loadBundle(vaultId: string, pluginId: string): Promise<string | null> {
    const filePath = path.join(this.getPluginDir(vaultId, pluginId), 'main.js')
    return this.readTextFile(filePath)
  }

  /**
   * Loads plugin styles (styles.css) from disk.
   * Returns null if the file does not exist.
   */
  async loadStyles(vaultId: string, pluginId: string): Promise<string | null> {
    const filePath = path.join(this.getPluginDir(vaultId, pluginId), 'styles.css')
    return this.readTextFile(filePath)
  }

  /**
   * Saves plugin settings (data.json) atomically.
   * Validates that settings do not exceed 1 MB.
   */
  async saveSettings(vaultId: string, pluginId: string, data: string): Promise<void> {
    const size = Buffer.byteLength(data, 'utf-8')
    if (size > MAX_SETTINGS_SIZE) {
      throw new PluginSettingsTooLargeError(pluginId)
    }

    const dir = this.getPluginDir(vaultId, pluginId)
    await fs.mkdir(dir, { recursive: true })

    const filePath = path.join(dir, 'data.json')
    await this.atomicWrite(filePath, data)
  }

  /**
   * Loads plugin settings (data.json) from disk.
   * Returns null if the file does not exist.
   */
  async loadSettings(vaultId: string, pluginId: string): Promise<string | null> {
    const filePath = path.join(this.getPluginDir(vaultId, pluginId), 'data.json')
    return this.readTextFile(filePath)
  }

  /**
   * Lists all plugins installed for a vault by reading subdirectories
   * and loading their manifest.json files.
   * Skips directories without a valid manifest.
   */
  async listPlugins(vaultId: string): Promise<PluginManifest[]> {
    const vaultDir = this.getVaultDir(vaultId)
    const manifests: PluginManifest[] = []

    let entries: string[]
    try {
      entries = await fs.readdir(vaultDir)
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return manifests
      }
      throw error
    }

    for (const entry of entries) {
      // Skip registry file and hidden files
      if (entry.startsWith('_') || entry.startsWith('.')) {
        continue
      }

      const manifestPath = path.join(vaultDir, entry, 'manifest.json')
      const manifest = await this.readJsonFile<PluginManifest>(manifestPath)
      if (manifest !== null) {
        manifests.push(manifest)
      }
    }

    return manifests
  }

  /**
   * Deletes a plugin and all its data (manifest, bundle, styles, settings).
   * Recursively removes the plugin directory.
   * Does nothing if the directory does not exist.
   */
  async deletePlugin(vaultId: string, pluginId: string): Promise<void> {
    const dir = this.getPluginDir(vaultId, pluginId)
    try {
      await fs.rm(dir, { recursive: true, force: true })
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      throw error
    }
  }

  /**
   * Deletes all plugin data for a vault.
   * Recursively removes the vault plugin directory.
   * Does nothing if the directory does not exist.
   */
  async deleteAllForVault(vaultId: string): Promise<void> {
    const dir = this.getVaultDir(vaultId)
    try {
      await fs.rm(dir, { recursive: true, force: true })
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      throw error
    }
  }

  /**
   * Saves the plugin registry (_registry.json) atomically.
   * Contains activation status, permissions, and compatibility info.
   */
  async saveRegistry(vaultId: string, registry: PluginRegistryData): Promise<void> {
    const dir = this.getVaultDir(vaultId)
    await fs.mkdir(dir, { recursive: true })

    const filePath = path.join(dir, '_registry.json')
    const content = JSON.stringify(registry, null, 2)
    await this.atomicWrite(filePath, content)
  }

  /**
   * Loads the plugin registry (_registry.json) from disk.
   * Returns null if the file does not exist or cannot be parsed.
   */
  async loadRegistry(vaultId: string): Promise<PluginRegistryData | null> {
    const filePath = path.join(this.getVaultDir(vaultId), '_registry.json')
    return this.readJsonFile<PluginRegistryData>(filePath)
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Returns the directory path for a vault's plugins.
   */
  private getVaultDir(vaultId: string): string {
    return path.join(this.pluginsDir, vaultId)
  }

  /**
   * Returns the directory path for a specific plugin.
   * Validates the pluginId to prevent path traversal attacks.
   * @throws Error if pluginId contains unsafe characters.
   */
  private getPluginDir(vaultId: string, pluginId: string): string {
    if (!isValidPluginId(pluginId)) {
      throw new Error(`Invalid plugin ID: "${pluginId}" — must match /^[a-z0-9][a-z0-9-]{0,63}$/`)
    }

    const resolved = path.join(this.pluginsDir, vaultId, pluginId)
    const expectedParent = path.join(this.pluginsDir, vaultId) + path.sep

    // Defense-in-depth: verify resolved path stays within the vault plugins directory
    if (!resolved.startsWith(expectedParent)) {
      throw new Error(`Path traversal detected for plugin ID: "${pluginId}"`)
    }

    return resolved
  }

  /**
   * Validates that a file's byte size does not exceed the maximum.
   * @throws PluginFileTooLargeError if size exceeds MAX_FILE_SIZE.
   */
  private validateFileSize(content: string, _fileName: string): void {
    const size = Buffer.byteLength(content, 'utf-8')
    if (size > MAX_FILE_SIZE) {
      throw new PluginFileTooLargeError(MAX_FILE_SIZE, size)
    }
  }

  /**
   * Writes content to a file atomically using temp file + rename.
   * Uses a random suffix for the temp file to avoid collisions.
   */
  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`

    await fs.writeFile(tempPath, content, 'utf-8')

    try {
      await fs.rename(tempPath, filePath)
    } catch (renameError) {
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw renameError
    }
  }

  /**
   * Reads and parses a JSON file from disk.
   * Returns null if the file does not exist or cannot be parsed.
   */
  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(raw) as T
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null
      }
      // Parse errors or other read errors → return null
      return null
    }
  }

  /**
   * Reads a text file from disk.
   * Returns null if the file does not exist.
   */
  private async readTextFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
