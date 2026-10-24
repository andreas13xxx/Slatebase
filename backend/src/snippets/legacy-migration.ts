// Moves CSS snippets from the former per-server location (`data/snippets/<vaultId>/`) into
// the vault's `.obsidian/snippets/` folder, where Obsidian keeps them.
//
// Idempotent and non-destructive: nothing is overwritten (an existing file in the vault wins)
// and nothing is deleted — the old folder gets a marker file once everything has been copied,
// so a later start skips it. Any failure leaves the marker unwritten and is retried next start.

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import { AppearanceFileInvalidError } from '../shared/appearance-file.js'
import { isMissing, withRetry } from '../shared/fs-retry.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ISnippetStore } from './types.js'
import { MAX_SNIPPET_SIZE, isValidSnippetFilename, snippetIdFromFilename } from './validation.js'

/** Written into the old folder after a successful migration. */
export const LEGACY_MIGRATED_MARKER = '.migrated-to-vault'

const LEGACY_REGISTRY_FILE = '_registry.json'

/** True if the path exists. Only a definite "missing" counts as absent; other I/O errors propagate. */
async function exists(target: string): Promise<boolean> {
  try {
    await withRetry(() => fs.access(target))
    return true
  } catch (error: unknown) {
    if (isMissing(error)) return false
    throw error
  }
}

/** True if the path is an existing directory. Only a definite "missing" counts as no; other I/O errors propagate. */
async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await withRetry(() => fs.stat(target))).isDirectory()
  } catch (error: unknown) {
    if (isMissing(error)) return false
    throw error
  }
}

/** Reads ids marked enabled in the old `_registry.json`. A missing or unparsable file yields []. */
async function readLegacyEnabledIds(legacyDir: string): Promise<string[]> {
  let raw: string
  try {
    raw = await withRetry(() => fs.readFile(path.join(legacyDir, LEGACY_REGISTRY_FILE), 'utf-8'))
  } catch (error: unknown) {
    if (isMissing(error)) return []
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  const snippets = (parsed as { snippets?: unknown } | null)?.snippets
  if (typeof snippets !== 'object' || snippets === null) return []
  return Object.entries(snippets as Record<string, unknown>)
    .filter(([, entry]) => (entry as { enabled?: unknown } | null)?.enabled === true)
    .map(([id]) => id)
}

/** Migrates one vault. Returns how many snippets were copied; throws on I/O trouble. */
async function migrateVault(
  legacyDir: string,
  vaultPath: string,
  store: ISnippetStore,
  logger: ILogger,
  vaultId: string,
): Promise<number> {
  const entries = (await withRetry(() => fs.readdir(legacyDir))).filter(isValidSnippetFilename)

  let copied = 0
  for (const filename of entries) {
    const id = snippetIdFromFilename(filename)
    if ((await store.loadSnippet(vaultPath, id)) !== null) {
      logger.warn('Snippet already exists in the vault, keeping the vault version', { vaultId, snippet: filename })
      continue
    }
    const stat = await fs.stat(path.join(legacyDir, filename))
    if (stat.size > MAX_SNIPPET_SIZE) {
      logger.warn('Legacy snippet exceeds the size limit, not migrated', { vaultId, snippet: filename })
      continue
    }
    const content = await withRetry(() => fs.readFile(path.join(legacyDir, filename), 'utf-8'))
    await store.saveSnippet(vaultPath, id, content)
    copied += 1
  }

  const legacyEnabled = await readLegacyEnabledIds(legacyDir)
  if (legacyEnabled.length > 0) {
    const current = await store.loadEnabledIds(vaultPath)
    const missing = legacyEnabled.filter((id) => !current.includes(id))
    if (missing.length > 0) await store.saveEnabledIds(vaultPath, [...current, ...missing])
  }

  return copied
}

/**
 * Runs the migration for every vault in the registry. Never throws: a failing vault is
 * logged and retried on the next start.
 */
export async function migrateLegacySnippets(deps: {
  dataDir: string
  vaultRegistry: IVaultRegistry
  snippetStore: ISnippetStore
  logger: ILogger
}): Promise<void> {
  const { dataDir, vaultRegistry, snippetStore, logger } = deps

  for (const vault of await vaultRegistry.load()) {
    const legacyDir = path.join(dataDir, 'snippets', vault.id)
    try {
      if (!(await exists(legacyDir)) || (await exists(path.join(legacyDir, LEGACY_MIGRATED_MARKER)))) continue

      // An unreachable vault (unmounted drive, offline OneDrive folder) must not get a phantom
      // directory tree created for it, nor be marked as migrated: its snippets would be stranded.
      if (!(await isDirectory(vault.storagePath))) {
        logger.warn('Snippet migration postponed: vault folder is not available', { vaultId: vault.id })
        continue
      }

      const copied = await migrateVault(legacyDir, vault.storagePath, snippetStore, logger, vault.id)
      await fs.writeFile(path.join(legacyDir, LEGACY_MIGRATED_MARKER), new Date().toISOString(), 'utf-8')
      logger.info('Migrated CSS snippets into the vault', { vaultId: vault.id, copied })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof AppearanceFileInvalidError) {
        logger.warn('Snippet migration postponed: .obsidian/appearance.json is not valid JSON', { vaultId: vault.id })
      } else {
        logger.error('Snippet migration failed, will retry on next start', { vaultId: vault.id, error: message })
      }
    }
  }
}
