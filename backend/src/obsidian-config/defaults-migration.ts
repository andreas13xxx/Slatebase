// Slatebase's app.json defaults were aligned with Obsidian's (alwaysUpdateLinks was true, is false).
// A vault that already existed when this version first started would silently change behaviour, so
// in that one pass the old default is written into app.json where the key is missing. The default
// then no longer matters for that vault, and the change is visible to anyone who opens the file.
//
// A vault whose app.json was written by Obsidian (the file exists and the vault has no `.slatebase/`
// folder) is left alone: there, a missing key means Obsidian's behaviour. The check is a heuristic.
//
// One marker under the data directory (not in the vault, so it is not synced and every instance
// decides for itself) ends the migration after the first pass. Vaults created later are never
// touched. A vault that could not be handled in that pass (folder missing, app.json not a JSON
// object, no write access) is named in a warning and keeps Obsidian's default; it is not retried,
// because a retry months later would change its behaviour unannounced.
// Must run before the other app.json migrations, which create the file.

import fs from 'node:fs/promises'
import path from 'node:path'
import { LEGACY_APP_CONFIG_DEFAULTS } from '@slatebase/shared-contracts'
import type { ILogger } from '../logger/index.js'
import { isMissing, withRetry } from '../shared/fs-retry.js'
import { readObsidianConfig } from '../shared/obsidian-config-file.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IAppConfigService } from './app-config.js'

const MARKER = path.join('migrations', 'app-config-defaults.done')

export interface DefaultsMigrationResult {
  /** Vaults where old defaults were written. */
  pinned: number
  /** Vaults that were checked and needed nothing. */
  skipped: number
  /** Vaults that could not be handled (named in a warning). */
  failed: number
  /** True if the marker already existed and nothing was scanned. */
  alreadyDone: boolean
}

async function exists(target: string): Promise<boolean> {
  try {
    await withRetry(() => fs.stat(target))
    return true
  } catch (error: unknown) {
    if (isMissing(error)) return false
    throw error
  }
}

/** Never throws. */
export async function migrateAppConfigDefaults(deps: {
  dataDir: string
  vaultRegistry: Pick<IVaultRegistry, 'load'>
  appConfigService: IAppConfigService
  logger: ILogger
}): Promise<DefaultsMigrationResult> {
  const { dataDir, vaultRegistry, appConfigService, logger } = deps
  const result: DefaultsMigrationResult = { pinned: 0, skipped: 0, failed: 0, alreadyDone: false }
  const marker = path.join(dataDir, MARKER)

  try {
    if (await exists(marker)) return { ...result, alreadyDone: true }

    for (const vault of await vaultRegistry.load()) {
      try {
        if (!(await exists(vault.storagePath))) throw new Error('vault folder does not exist')
        const current = await readObsidianConfig(vault.storagePath, 'app.json')
        const slatebaseVault = current === null || (await exists(path.join(vault.storagePath, '.slatebase')))

        const patch: Partial<typeof LEGACY_APP_CONFIG_DEFAULTS> = {}
        if (slatebaseVault) {
          if (LEGACY_APP_CONFIG_DEFAULTS.alwaysUpdateLinks !== undefined && current?.['alwaysUpdateLinks'] === undefined) {
            patch.alwaysUpdateLinks = LEGACY_APP_CONFIG_DEFAULTS.alwaysUpdateLinks
          }
        }
        if (Object.keys(patch).length > 0) {
          await appConfigService.patch(vault.storagePath, patch)
          result.pinned++
          logger.info('Kept the previous app.json defaults for this vault', { vaultId: vault.id, keys: Object.keys(patch) })
        } else {
          result.skipped++
        }
      } catch (error: unknown) {
        result.failed++
        logger.warn('Could not keep the previous app.json defaults for a vault; it uses Obsidian\'s defaults', {
          vaultId: vault.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await fs.mkdir(path.dirname(marker), { recursive: true })
    await fs.writeFile(marker, new Date().toISOString(), 'utf-8')
  } catch (error: unknown) {
    logger.warn('Could not migrate the app.json defaults; will retry on the next start', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return result
}
