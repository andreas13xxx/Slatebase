// Moves plugins from the former per-server location (`data/plugins/<vaultId>/<pluginId>/`) into
// the vault's `.obsidian/plugins/` folder, where Obsidian keeps them, and lists the active ones
// in the vault's `community-plugins.json`.
//
// What stays where it is: the registry (`_registry.json`: permissions, compatibility, approval)
// and the secrets (`<pluginId>/secrets.json`) are server-side data and are still read from there.
//
// Idempotent and non-destructive: nothing is overwritten (a file already in the vault wins) and
// nothing is deleted — the old plugin files stay next to the secrets, and a marker file is
// written once everything has been copied, so a later start skips the vault. Any failure leaves
// the marker unwritten and is retried on the next start.

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import { isNodeError } from '../shared/fs-utils.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { CommunityPluginsFileInvalidError } from './errors.js'
import type { IInstalledPluginStore, PluginRegistryData } from './types.js'
import { isValidPluginId } from './validation.js'

/** Written into the old folder after a successful migration. */
export const LEGACY_PLUGINS_MIGRATED_MARKER = '.migrated-to-vault'

function isMissing(error: unknown): boolean {
  return isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

/** True if the path exists. Only a definite "missing" counts as absent; other I/O errors propagate. */
async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch (error: unknown) {
    if (isMissing(error)) return false
    throw error
  }
}

/** True if the path is an existing directory. Only a definite "missing" counts as no. */
async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory()
  } catch (error: unknown) {
    if (isMissing(error)) return false
    throw error
  }
}

/** Reads a text file; null if it does not exist. */
async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (error: unknown) {
    if (isMissing(error)) return null
    throw error
  }
}

/** Ids the old registry marks active. A missing or unparsable file yields []. */
async function readLegacyActiveIds(legacyDir: string): Promise<string[]> {
  const raw = await readOptional(path.join(legacyDir, '_registry.json'))
  if (raw === null) return []
  let parsed: PluginRegistryData
  try {
    parsed = JSON.parse(raw) as PluginRegistryData
  } catch {
    return []
  }
  const plugins = parsed?.plugins
  if (typeof plugins !== 'object' || plugins === null) return []
  return Object.entries(plugins)
    .filter(([, entry]) => entry?.status === 'active' || entry?.status === 'loading')
    .map(([id]) => id)
}

/** Migrates one vault. Returns how many plugins were copied; throws on I/O trouble. */
async function migrateVault(
  legacyDir: string,
  vaultId: string,
  store: IInstalledPluginStore,
  logger: ILogger,
): Promise<number> {
  const entries = await fs.readdir(legacyDir, { withFileTypes: true })

  let copied = 0
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidPluginId(entry.name)) continue
    const pluginId = entry.name
    const pluginDir = path.join(legacyDir, pluginId)

    if ((await store.loadManifest(vaultId, pluginId)) !== null) {
      logger.warn('Plugin already exists in the vault, keeping the vault version', { vaultId, pluginId })
    } else {
      const manifest = await readOptional(path.join(pluginDir, 'manifest.json'))
      const bundle = await readOptional(path.join(pluginDir, 'main.js'))
      if (manifest === null || bundle === null) continue // not a plugin folder (e.g. only secrets)
      const styles = await readOptional(path.join(pluginDir, 'styles.css'))
      await store.savePlugin(vaultId, pluginId, styles === null ? { manifest, bundle } : { manifest, bundle, styles })
      copied += 1
    }

    // Settings only fill a gap: whatever Obsidian (or an earlier sync) left in the vault wins.
    if ((await store.loadSettings(vaultId, pluginId)) === null) {
      const settings = await readOptional(path.join(pluginDir, 'data.json'))
      if (settings !== null) await store.saveSettings(vaultId, pluginId, settings)
    }
  }

  // Active plugins stay active: list them where Obsidian looks, but only if they exist in the vault.
  const installed = new Set((await store.listPlugins(vaultId)).map((manifest) => manifest.id))
  const active = (await readLegacyActiveIds(legacyDir)).filter((id) => installed.has(id))
  if (active.length > 0) {
    await store.updateEnabledIds(vaultId, (current) => [...current, ...active.filter((id) => !current.includes(id))])
  }

  return copied
}

/**
 * Runs the migration for every vault in the registry. Never throws: a failing vault is
 * logged and retried on the next start.
 */
export async function migrateLegacyPlugins(deps: {
  dataDir: string
  vaultRegistry: IVaultRegistry
  pluginStore: IInstalledPluginStore
  logger: ILogger
}): Promise<void> {
  const { dataDir, vaultRegistry, pluginStore, logger } = deps

  for (const vault of await vaultRegistry.load()) {
    const legacyDir = path.join(dataDir, 'plugins', vault.id)
    try {
      if (!(await isDirectory(legacyDir)) || (await exists(path.join(legacyDir, LEGACY_PLUGINS_MIGRATED_MARKER)))) continue

      // An unreachable vault (unmounted drive, offline OneDrive folder) must not get a phantom
      // directory tree created for it, nor be marked as migrated: its plugins would be stranded.
      if (!(await isDirectory(vault.storagePath))) {
        logger.warn('Plugin migration postponed: vault folder is not available', { vaultId: vault.id })
        continue
      }

      const copied = await migrateVault(legacyDir, vault.id, pluginStore, logger)
      await fs.writeFile(path.join(legacyDir, LEGACY_PLUGINS_MIGRATED_MARKER), new Date().toISOString(), 'utf-8')
      logger.info('Migrated plugins into the vault', { vaultId: vault.id, copied })
    } catch (error: unknown) {
      if (error instanceof CommunityPluginsFileInvalidError) {
        logger.warn('Plugin migration postponed: .obsidian/community-plugins.json is not a valid JSON array', { vaultId: vault.id })
      } else {
        const message = error instanceof Error ? error.message : String(error)
        logger.error('Plugin migration failed, will retry on next start', { vaultId: vault.id, error: message })
      }
    }
  }
}
