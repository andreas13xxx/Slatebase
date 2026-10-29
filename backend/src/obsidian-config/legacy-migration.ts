// Moves settings that `.slatebase/config.json` used to hold into the Obsidian files that now own
// them. Obsidian's files are the source of truth (decided 2026-10-29), so after the move the
// field is gone from config.json.
//
//   attachmentsDirectory   →   app.json  attachmentFolderPath
//     ""  (next to the note)  →  "./"
//     "Folder"                →  "Folder"
//
// An existing value in the Obsidian file always wins and is never overwritten. The old field is
// removed only after the Obsidian file holds the value, so a failure at any point keeps the old
// field and is retried on the next start. Idempotent: without the old field nothing happens.

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import { isMissing, withRetry } from '../shared/fs-retry.js'
import { writeJsonFileAtomic } from '../shared/json-file-store.js'
import { ObsidianConfigFileInvalidError } from '../shared/obsidian-config-file.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IAppConfigService } from './app-config.js'

const CONFIG_PATH = path.join('.slatebase', 'config.json')

export interface VaultConfigMigrationResult {
  /** Vaults whose attachmentsDirectory was moved (or dropped because app.json already had a value). */
  migrated: number
}

async function readConfig(file: string): Promise<Record<string, unknown> | null> {
  let raw: string
  try {
    raw = await withRetry(() => fs.readFile(file, 'utf-8'))
  } catch (error: unknown) {
    if (isMissing(error)) return null
    throw error
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Never throws: a failing vault is logged and retried on the next start. */
export async function migrateVaultConfigToObsidianFiles(deps: {
  vaultRegistry: Pick<IVaultRegistry, 'load'>
  appConfigService: IAppConfigService
  logger: ILogger
}): Promise<VaultConfigMigrationResult> {
  const { vaultRegistry, appConfigService, logger } = deps
  const result: VaultConfigMigrationResult = { migrated: 0 }

  for (const vault of await vaultRegistry.load()) {
    const configFile = path.join(vault.storagePath, CONFIG_PATH)
    try {
      const config = await readConfig(configFile)
      if (config === null || typeof config['attachmentsDirectory'] !== 'string') continue

      const legacy = config['attachmentsDirectory'].trim()
      const existing = await appConfigService.get(vault.storagePath)
      if (typeof existing['attachmentFolderPath'] !== 'string') {
        await appConfigService.patch(vault.storagePath, { attachmentFolderPath: legacy === '' ? './' : legacy })
      }

      const { attachmentsDirectory: _moved, ...rest } = config
      await writeJsonFileAtomic(configFile, rest)
      result.migrated++
      logger.info('Moved the attachments directory into the vault\'s app.json', { vaultId: vault.id })
    } catch (error: unknown) {
      if (error instanceof ObsidianConfigFileInvalidError) {
        logger.warn('Attachments directory migration postponed: .obsidian/app.json is not valid JSON', { vaultId: vault.id })
      } else {
        logger.error('Attachments directory migration failed, will retry on next start', {
          vaultId: vault.id, error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  return result
}
