// The property types used to live only in `.slatebase/property-types.json`. They live in Obsidian's
// `.obsidian/types.json` now, so Obsidian and Slatebase see the same types. Once, at the first start
// of this version, the entries of the old file that types.json lacks are copied over; a key that
// types.json already has keeps the type it has there (Obsidian's file wins). The old file then keeps
// only the entries with options, which are Slatebase's own.
//
// One marker under the data directory ends it, so a key removed from types.json later does not come
// back from the old file. A vault that cannot be handled (folder missing, types.json not a JSON
// object, no write access) is named in a warning and is not retried for the same reason.

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import { isMissing, withRetry } from '../shared/fs-retry.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { PropertyTypeStore } from './property-type-store.js'

const MARKER = path.join('migrations', 'property-types-to-obsidian.done')

export interface PropertyTypesMigrationResult {
  /** Vaults that got entries in types.json. */
  migrated: number
  /** Entries copied in total. */
  entries: number
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
export async function migratePropertyTypesToObsidian(deps: {
  dataDir: string
  vaultRegistry: Pick<IVaultRegistry, 'load'>
  store: Pick<PropertyTypeStore, 'adoptLegacyEntries'>
  logger: ILogger
}): Promise<PropertyTypesMigrationResult> {
  const { dataDir, vaultRegistry, store, logger } = deps
  const result: PropertyTypesMigrationResult = { migrated: 0, entries: 0, failed: 0, alreadyDone: false }
  const marker = path.join(dataDir, MARKER)

  try {
    if (await exists(marker)) return { ...result, alreadyDone: true }

    for (const vault of await vaultRegistry.load()) {
      try {
        if (!(await exists(vault.storagePath))) throw new Error('vault folder does not exist')
        const added = await store.adoptLegacyEntries(vault.id)
        if (added > 0) {
          result.migrated++
          result.entries += added
          logger.info('Moved property types into .obsidian/types.json', { vaultId: vault.id, entries: added })
        }
      } catch (error: unknown) {
        result.failed++
        logger.warn('Could not move the property types of a vault into .obsidian/types.json; they stay in .slatebase', {
          vaultId: vault.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await fs.mkdir(path.dirname(marker), { recursive: true })
    await fs.writeFile(marker, new Date().toISOString(), 'utf-8')
  } catch (error: unknown) {
    logger.warn('Could not migrate the property types; will retry on the next start', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return result
}
