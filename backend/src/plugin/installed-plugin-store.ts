// InstalledPluginStore — Plugins of a vault, stored the way Obsidian stores them:
//   <vault>/.obsidian/plugins/<id>/{manifest.json,main.js,styles.css,data.json}
//   <vault>/.obsidian/community-plugins.json   (ids of the enabled plugins)
// What stays on the server, outside the vault (it is a trust decision of this server, not vault
// content): `data/plugins/<vaultId>/_registry.json` (permissions, compatibility, approval) and
// `data/plugins/<vaultId>/<id>/secrets.json` (encrypted secrets, see secret-store.ts).
//
// Not to be confused with the `plugin-store/` module, which manages the marketplace of plugins
// available to install.

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { IInstalledPluginStore, PluginFiles, PluginManifest, PluginRegistryData } from './types.js'
import {
  CommunityPluginsFileInvalidError,
  PluginFileTooLargeError,
  PluginSettingsTooLargeError,
  PluginVaultUnavailableError,
} from './errors.js'
import { PLUGIN_LIMITS } from '@slatebase/shared-contracts'
import { PLUGIN_ID_PATTERN, isValidPluginId } from './validation.js'
import { KeyedMutex } from '../shared/async-mutex.js'
import { isNodeError } from '../shared/fs-utils.js'
import { KeyedJsonFileStore, writeJsonFileAtomic } from '../shared/json-file-store.js'
import { PathTraversalError, assertRealPathInsideVault, validateFilePath } from '../vault/index.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum file size for plugin files (manifest, bundle, styles); see shared-contracts plugin-limits.ts. */
const MAX_FILE_SIZE = PLUGIN_LIMITS.maxFileBytes

/** Maximum file size for plugin settings (data.json) and community-plugins.json. */
const MAX_SETTINGS_SIZE = PLUGIN_LIMITS.maxSettingsBytes

const PLUGINS_DIR = '.obsidian/plugins'
const COMMUNITY_PLUGINS_FILE = '.obsidian/community-plugins.json'

/** Resolves a vault id to the absolute path of the vault, or null for an unknown vault. */
export type VaultPathResolver = (vaultId: string) => string | null

function isMissing(error: unknown): boolean {
  return isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-based persistence for plugin files and metadata.
 * Plugin files live in the vault (`.obsidian/plugins/<pluginId>/`); the registry and the
 * secrets stay under `data/plugins/<vaultId>/`. All writes are atomic (temp file → rename).
 *
 * Nothing in the vault is trusted: a plugin file that is a symlink leaving the vault is treated
 * as absent, and file sizes are capped before reading.
 */
export class InstalledPluginStore implements IInstalledPluginStore {
  /** Server-local data: registry and secrets. */
  private readonly pluginsDir: string
  private readonly registryStore: KeyedJsonFileStore<PluginRegistryData | null>
  /** Serialises community-plugins.json read-modify-write cycles per vault. */
  private readonly enabledMutex = new KeyedMutex()

  constructor(dataDir: string, private readonly resolveVaultPath: VaultPathResolver) {
    this.pluginsDir = path.join(dataDir, 'plugins')
    this.registryStore = new KeyedJsonFileStore<PluginRegistryData | null>(
      (vaultId) => path.join(this.getVaultDir(vaultId), '_registry.json'),
      null,
    )
  }

  /**
   * Saves plugin files (manifest, bundle, optional styles) atomically into the vault.
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
    await this.assertInsideVault(vaultId, dir)
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
   *
   * The `id` field is normalized to the directory name (the pluginId this
   * plugin was actually installed under), overriding whatever the manifest
   * file itself declares. A plugin's manifest.json is attacker/upstream
   * controlled content — its `id` can drift from the install-time pluginId
   * (e.g. a community-store entry id vs. the id baked into the downloaded
   * release). Every other lookup (bundle, styles, settings, activate,
   * delete) is keyed by directory name, so callers that trust manifest.id
   * from listPlugins()/getManifest() must see the same value or those
   * follow-up requests 404.
   */
  async loadManifest(vaultId: string, pluginId: string): Promise<PluginManifest | null> {
    const raw = await this.readVaultFile(vaultId, path.join(this.getPluginDir(vaultId, pluginId), 'manifest.json'), MAX_FILE_SIZE)
    if (raw === null) return null
    let manifest: PluginManifest
    try {
      manifest = JSON.parse(raw) as PluginManifest
    } catch {
      return null
    }
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return null
    return { ...manifest, id: pluginId }
  }

  /**
   * Loads a plugin bundle (main.js) from disk.
   * Returns null if the file does not exist.
   */
  async loadBundle(vaultId: string, pluginId: string): Promise<string | null> {
    return this.readVaultFile(vaultId, path.join(this.getPluginDir(vaultId, pluginId), 'main.js'), MAX_FILE_SIZE)
  }

  /**
   * Loads plugin styles (styles.css) from disk.
   * Returns null if the file does not exist.
   */
  async loadStyles(vaultId: string, pluginId: string): Promise<string | null> {
    return this.readVaultFile(vaultId, path.join(this.getPluginDir(vaultId, pluginId), 'styles.css'), MAX_FILE_SIZE)
  }

  /**
   * Saves plugin settings (data.json) atomically.
   * Validates that settings do not exceed PLUGIN_LIMITS.maxSettingsBytes.
   */
  async saveSettings(vaultId: string, pluginId: string, data: string): Promise<void> {
    const size = Buffer.byteLength(data, 'utf-8')
    if (size > MAX_SETTINGS_SIZE) {
      throw new PluginSettingsTooLargeError(pluginId, size)
    }

    const dir = this.getPluginDir(vaultId, pluginId)
    await this.assertInsideVault(vaultId, dir)
    await fs.mkdir(dir, { recursive: true })

    await this.atomicWrite(path.join(dir, 'data.json'), data)
  }

  /**
   * Loads plugin settings (data.json) from disk.
   * Returns null if the file does not exist.
   */
  async loadSettings(vaultId: string, pluginId: string): Promise<string | null> {
    return this.readVaultFile(
      vaultId,
      path.join(this.getPluginDir(vaultId, pluginId), 'data.json'),
      MAX_SETTINGS_SIZE,
      () => new PluginSettingsTooLargeError(pluginId),
    )
  }

  /**
   * Lists all plugins in the vault's `.obsidian/plugins/` folder by reading the
   * subdirectories and their manifest.json files. Skips entries that are not plain
   * directories, whose name is not a valid plugin id, or that have no valid manifest.
   */
  async listPlugins(vaultId: string): Promise<PluginManifest[]> {
    const pluginsDir = validateFilePath(this.getVaultPath(vaultId), PLUGINS_DIR)
    const manifests: PluginManifest[] = []

    let entries: string[]
    try {
      entries = await fs.readdir(pluginsDir)
    } catch (error: unknown) {
      if (isMissing(error)) return manifests
      throw error
    }

    for (const entry of entries) {
      if (!isValidPluginId(entry)) continue

      let stat: Awaited<ReturnType<typeof fs.lstat>>
      try {
        stat = await fs.lstat(path.join(pluginsDir, entry))
      } catch {
        continue
      }
      if (!stat.isDirectory()) continue

      const manifest = await this.loadManifest(vaultId, entry)
      if (manifest !== null) {
        manifests.push(manifest)
      }
    }

    return manifests
  }

  /**
   * Deletes a plugin: its folder in the vault, its server-side data (secrets) and its entry in
   * `community-plugins.json`. Does nothing for parts that do not exist.
   */
  async deletePlugin(vaultId: string, pluginId: string): Promise<void> {
    const dir = this.getPluginDir(vaultId, pluginId)
    await this.assertInsideVault(vaultId, dir)
    await fs.rm(dir, { recursive: true, force: true })
    await fs.rm(this.getServerPluginDir(vaultId, pluginId), { recursive: true, force: true })

    try {
      await this.updateEnabledIds(vaultId, (ids) => ids.filter((id) => id !== pluginId))
    } catch (error: unknown) {
      // A hand-edited community-plugins.json must not block the uninstall; the id stays listed.
      if (!(error instanceof CommunityPluginsFileInvalidError)) throw error
    }
  }

  /**
   * Deletes the server-side plugin data of a vault (registry, secrets).
   * The plugins themselves live in the vault and go with it.
   * Does nothing if the directory does not exist.
   */
  async deleteAllForVault(vaultId: string): Promise<void> {
    await fs.rm(this.getVaultDir(vaultId), { recursive: true, force: true })
  }

  /**
   * Saves the plugin registry (_registry.json) atomically.
   * Contains activation status, permissions, and compatibility info.
   */
  async saveRegistry(vaultId: string, registry: PluginRegistryData): Promise<void> {
    await this.registryStore.write(vaultId, registry)
  }

  /**
   * Loads the plugin registry (_registry.json) from disk.
   * Returns null if the file does not exist or cannot be parsed.
   */
  async loadRegistry(vaultId: string): Promise<PluginRegistryData | null> {
    return this.registryStore.read(vaultId)
  }

  /**
   * Atomically read-modify-write the registry inside its per-vault mutex.
   * See `IInstalledPluginStore.mutateRegistry` for why this matters — two
   * plugin installs racing on the same vault must not lose each other's
   * registry update.
   */
  async mutateRegistry(
    vaultId: string,
    fn: (current: PluginRegistryData | null) => PluginRegistryData,
  ): Promise<PluginRegistryData> {
    // fn always returns a non-null PluginRegistryData; the store's generic
    // type is nullable only to represent "no registry file yet" on read.
    return this.registryStore.mutate(vaultId, (current) => fn(current)) as Promise<PluginRegistryData>
  }

  /**
   * Ids listed in `community-plugins.json`. A missing or invalid file yields an empty list;
   * I/O errors propagate.
   */
  async loadEnabledIds(vaultId: string): Promise<string[]> {
    try {
      return (await this.readEnabledIds(vaultId)) ?? []
    } catch (error: unknown) {
      if (error instanceof CommunityPluginsFileInvalidError) return []
      throw error
    }
  }

  /**
   * Read-modify-write of `community-plugins.json` inside a per-vault lock. `fn` receives the
   * current ids (empty if the file does not exist) and returns the ids to persist. The write is
   * skipped when nothing changed.
   * @throws CommunityPluginsFileInvalidError if the file exists but is not a JSON array.
   */
  async updateEnabledIds(vaultId: string, fn: (current: string[]) => string[]): Promise<void> {
    const vaultPath = this.getVaultPath(vaultId)
    await this.enabledMutex.runExclusive(vaultPath, async () => {
      const existing = await this.readEnabledIds(vaultId)
      const current = existing ?? []
      const next = [...new Set(fn(current))]
      if (existing === null && next.length === 0) return
      if (existing !== null && next.length === current.length && next.every((id, index) => id === current[index])) return
      const file = validateFilePath(vaultPath, COMMUNITY_PLUGINS_FILE)
      await assertRealPathInsideVault(vaultPath, file, { vaultId, requestedPath: COMMUNITY_PLUGINS_FILE })
      await writeJsonFileAtomic(file, next)
    })
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /** Reads community-plugins.json; null if it does not exist. */
  private async readEnabledIds(vaultId: string): Promise<string[] | null> {
    const vaultPath = this.getVaultPath(vaultId)
    const raw = await this.readVaultFile(vaultId, validateFilePath(vaultPath, COMMUNITY_PLUGINS_FILE), MAX_SETTINGS_SIZE)
    if (raw === null) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new CommunityPluginsFileInvalidError()
    }
    if (!Array.isArray(parsed)) throw new CommunityPluginsFileInvalidError()
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  }

  /** Absolute path of the vault; throws for an unknown vault. */
  private getVaultPath(vaultId: string): string {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (vaultPath === null) throw new PluginVaultUnavailableError(vaultId)
    return vaultPath
  }

  /** Returns the server-local directory of a vault (registry, secrets). */
  private getVaultDir(vaultId: string): string {
    return path.join(this.pluginsDir, vaultId)
  }

  /** Server-local directory of one plugin (secrets). */
  private getServerPluginDir(vaultId: string, pluginId: string): string {
    this.assertValidPluginId(pluginId)
    return path.join(this.getVaultDir(vaultId), pluginId)
  }

  private assertValidPluginId(pluginId: string): void {
    if (!isValidPluginId(pluginId)) {
      throw new Error(`Invalid plugin ID: "${pluginId}" — must match ${PLUGIN_ID_PATTERN}`)
    }
  }

  /**
   * Returns the directory of a specific plugin inside the vault.
   * Validates the pluginId and confines the path to the vault.
   * @throws Error if pluginId contains unsafe characters.
   */
  private getPluginDir(vaultId: string, pluginId: string): string {
    this.assertValidPluginId(pluginId)
    return validateFilePath(this.getVaultPath(vaultId), `${PLUGINS_DIR}/${pluginId}`)
  }

  /** Throws PathTraversalError if `target` resolves outside the vault through a symlink. */
  private async assertInsideVault(vaultId: string, target: string): Promise<void> {
    const vaultPath = this.getVaultPath(vaultId)
    await assertRealPathInsideVault(vaultPath, target, { vaultId, requestedPath: path.relative(vaultPath, target) })
  }

  /**
   * Reads a text file from the vault. Returns null if it does not exist, is not a regular file,
   * or resolves outside the vault. A file over `maxSize` is rejected before it is read.
   */
  private async readVaultFile(
    vaultId: string,
    filePath: string,
    maxSize: number,
    tooLarge: (size: number) => Error = (size) => new PluginFileTooLargeError(maxSize, size, path.basename(filePath)),
  ): Promise<string | null> {
    try {
      await this.assertInsideVault(vaultId, filePath)
    } catch (error: unknown) {
      if (error instanceof PathTraversalError) return null
      throw error
    }

    let stat: Awaited<ReturnType<typeof fs.lstat>>
    try {
      stat = await fs.lstat(filePath)
    } catch (error: unknown) {
      if (isMissing(error)) return null
      throw error
    }
    if (!stat.isFile()) return null
    if (stat.size > maxSize) throw tooLarge(stat.size)

    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (error: unknown) {
      if (isMissing(error)) return null
      throw error
    }
  }

  /**
   * Validates that a file's byte size does not exceed the maximum.
   * @throws PluginFileTooLargeError if size exceeds MAX_FILE_SIZE.
   */
  private validateFileSize(content: string, fileName: string): void {
    const size = Buffer.byteLength(content, 'utf-8')
    if (size > MAX_FILE_SIZE) {
      throw new PluginFileTooLargeError(MAX_FILE_SIZE, size, fileName)
    }
  }

  /**
   * Writes content to a file atomically using temp file + rename.
   * Uses a random suffix for the temp file to avoid collisions.
   * Retries on EPERM/EACCES errors (common on Windows due to file locking,
   * e.g. OneDrive sync or antivirus briefly holding the target open). If
   * renaming still fails after retries, unlinking the target and retrying
   * once more, then falling back to a direct write, so a lingering lock
   * never surfaces as a lost write or a spurious error to the caller.
   */
  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`

    await fs.writeFile(tempPath, content, 'utf-8')

    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fs.rename(tempPath, filePath)
        return
      } catch (renameError) {
        lastError = renameError
        const code = isNodeError(renameError) ? renameError.code : ''
        if (code === 'EPERM' || code === 'EACCES') {
          // Windows file locking — wait and retry
          await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)))
          continue
        }
        // Non-retryable error — cleanup and throw immediately
        try {
          await fs.unlink(tempPath)
        } catch {
          // Ignore cleanup errors
        }
        throw renameError
      }
    }

    // Retries exhausted but the lock may still be transient — unlink the
    // target and retry once, then fall back to a direct write as a last
    // resort so the operation never silently loses data.
    const code = isNodeError(lastError) ? lastError.code : ''
    if (code === 'EPERM' || code === 'EACCES') {
      try {
        await fs.unlink(filePath)
        await fs.rename(tempPath, filePath)
        return
      } catch {
        try {
          await fs.writeFile(filePath, content, 'utf-8')
          await fs.unlink(tempPath)
          return
        } catch (fallbackError) {
          lastError = fallbackError
        }
      }
    }

    // All retries exhausted — cleanup temp file and throw
    try {
      await fs.unlink(tempPath)
    } catch {
      // Ignore cleanup errors
    }
    throw lastError
  }
}
