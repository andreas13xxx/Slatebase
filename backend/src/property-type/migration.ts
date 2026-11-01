// The property types used to live only in `.slatebase/property-types.json`. They live in Obsidian's
// `.obsidian/types.json` now, so Obsidian and Slatebase see the same types. The entries of the old
// file that types.json lacks are copied over; a key that types.json already has keeps the type it
// has there (Obsidian's file wins). The old file then keeps only the entries with options, which
// are Slatebase's own.
//
// Each vault is migrated once: its id goes into the marker file under the data directory when it is
// done, so a key removed from types.json later does not come back from the old file. A vault that
// could not be handled (folder missing, types.json not a JSON object, no write access) is named in
// a warning and tried again at the next start, until every vault is done; then the marker is
// complete and nothing is scanned any more. Vaults created after that are never touched.

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import { isMissing, withRetry } from '../shared/fs-retry.js'
import { writeJsonFileAtomic } from '../shared/json-file-store.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { PropertyTypeStore } from './property-type-store.js'

const MARKER = path.join('migrations', 'property-types-to-obsidian.json')

interface Marker {
  /** Vaults that are done. */
  done: string[]
  /** True once a pass finished without a failing vault. */
  complete: boolean
}

export interface PropertyTypesMigrationResult {
  /** Vaults that got entries in types.json. */
  migrated: number
  /** Entries copied in total. */
  entries: number
  /** Vaults that could not be handled (named in a warning; retried at the next start). */
  failed: number
  /** True if the migration was complete before and nothing was scanned. */
  alreadyDone: boolean
}

async function readMarker(file: string): Promise<Marker> {
  try {
    const parsed: unknown = JSON.parse(await withRetry(() => fs.readFile(file, 'utf-8')))
    if (typeof parsed === 'object' && parsed !== null) {
      const { done, complete } = parsed as { done?: unknown, complete?: unknown }
      return {
        done: Array.isArray(done) ? done.filter((id): id is string => typeof id === 'string') : [],
        complete: complete === true,
      }
    }
  } catch (error: unknown) {
    if (!isMissing(error) && !(error instanceof SyntaxError)) throw error
  }
  return { done: [], complete: false }
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
  const markerFile = path.join(dataDir, MARKER)

  try {
    const marker = await readMarker(markerFile)
    if (marker.complete) return { ...result, alreadyDone: true }
    const done = new Set(marker.done)

    for (const vault of await vaultRegistry.load()) {
      if (done.has(vault.id)) continue
      try {
        if (!(await exists(vault.storagePath))) throw new Error('vault folder does not exist')
        const added = await store.adoptLegacyEntries(vault.id)
        if (added > 0) {
          result.migrated++
          result.entries += added
          logger.info('Moved property types into .obsidian/types.json', { vaultId: vault.id, entries: added })
        }
        done.add(vault.id)
      } catch (error: unknown) {
        result.failed++
        logger.warn('Could not move the property types of a vault into .obsidian/types.json; will retry on the next start', {
          vaultId: vault.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await writeJsonFileAtomic(markerFile, { done: [...done], complete: result.failed === 0 } satisfies Marker)
  } catch (error: unknown) {
    logger.warn('Could not migrate the property types; will retry on the next start', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return result
}
