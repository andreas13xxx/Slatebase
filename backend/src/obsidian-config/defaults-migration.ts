// Slatebase's app.json defaults were aligned with Obsidian's (alwaysUpdateLinks was true, is false).
// A vault that Slatebase created or has worked in would silently change behaviour, so once per vault
// the old default is written into app.json where the key is missing. The default then no longer
// matters for that vault, and the change is visible to anyone who opens the file.
//
// A vault whose app.json was written by Obsidian (the file exists and the vault has no `.slatebase/`
// folder) is left alone: there, a missing key means Obsidian's behaviour.
//
// The marker lives under the data directory, not in the vault, so it is not synced and every
// instance decides for itself. It is set only after the work is done (or not needed); a vault that
// cannot be written, or whose app.json is not a JSON object, is retried on the next start.
// Must run before the other app.json migrations, which create the file.

import fs from 'node:fs/promises'
import path from 'node:path'
import { LEGACY_APP_CONFIG_DEFAULTS, isAppConfigKey } from '@slatebase/shared-contracts'
import type { ILogger } from '../logger/index.js'
import { isMissing, withRetry } from '../shared/fs-retry.js'
import { ObsidianConfigFileInvalidError, readObsidianConfig } from '../shared/obsidian-config-file.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { AppConfigRequest, IAppConfigService } from './app-config.js'

const MARKER_DIR = path.join('migrations', 'app-config-defaults')
const SAFE_VAULT_ID = /^[A-Za-z0-9_-]+$/

export interface DefaultsMigrationResult {
  /** Vaults where old defaults were written. */
  pinned: number
  /** Vaults that were checked and needed nothing. */
  skipped: number
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

/** Never throws: a failing vault is logged and retried on the next start. */
export async function migrateAppConfigDefaults(deps: {
  dataDir: string
  vaultRegistry: Pick<IVaultRegistry, 'load'>
  appConfigService: IAppConfigService
  logger: ILogger
}): Promise<DefaultsMigrationResult> {
  const { dataDir, vaultRegistry, appConfigService, logger } = deps
  const result: DefaultsMigrationResult = { pinned: 0, skipped: 0 }

  for (const vault of await vaultRegistry.load()) {
    if (!SAFE_VAULT_ID.test(vault.id)) continue
    const marker = path.join(dataDir, MARKER_DIR, vault.id)
    try {
      if (await exists(marker)) continue

      const current = await readObsidianConfig(vault.storagePath, 'app.json')
      const slatebaseVault = current === null || (await exists(path.join(vault.storagePath, '.slatebase')))

      const patch: Record<string, unknown> = {}
      if (slatebaseVault) {
        for (const [key, value] of Object.entries(LEGACY_APP_CONFIG_DEFAULTS)) {
          if (isAppConfigKey(key) && current?.[key] === undefined) patch[key] = value
        }
      }
      if (Object.keys(patch).length > 0) {
        await appConfigService.patch(vault.storagePath, patch as AppConfigRequest)
        result.pinned++
        logger.info('Kept the previous app.json defaults for this vault', { vaultId: vault.id, keys: Object.keys(patch) })
      } else {
        result.skipped++
      }

      await fs.mkdir(path.dirname(marker), { recursive: true })
      await fs.writeFile(marker, new Date().toISOString(), 'utf-8')
    } catch (error: unknown) {
      if (error instanceof ObsidianConfigFileInvalidError) {
        logger.warn('app.json is not a JSON object; its defaults are migrated once it is valid', { vaultId: vault.id })
      } else {
        logger.warn('Could not migrate the app.json defaults of a vault; will retry on the next start', {
          vaultId: vault.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  return result
}
