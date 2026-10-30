// Moves the per-user copies of vault settings that Obsidian's `app.json` owns now out of the user
// preference files (`data/users/<userId>-preferences.json`, `vaultSettings.<vaultId>`).
//
//   lineNumbers          →  app.json  showLineNumber
//   readableLineLength   →  app.json  readableLineLength
//   spellcheck           →  app.json  spellcheck
//
// The preference store no longer knows these keys and drops them the next time it saves a file, so
// this runs once at start, before that can happen. A vault has one value, so when several users
// set one, the most recently changed preference file wins. A value that app.json already has always
// wins and is never overwritten. The old keys are removed from a preference file only after
// app.json holds the value, so a failure keeps them and is retried on the next start. Idempotent:
// without the old keys nothing happens. Only boolean values are moved or removed; anything else in
// those keys is left alone. It runs before the server listens, so no preference write can race the
// cleanup; the file is re-read right before it is rewritten all the same.

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import { isMissing, withRetry } from '../shared/fs-retry.js'
import { writeJsonFileAtomic } from '../shared/json-file-store.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { isRecord } from '../preferences/preferences-store.js'
import type { AppConfigRequest, IAppConfigService } from './app-config.js'

const USER_KEYS = { lineNumbers: 'showLineNumber', readableLineLength: 'readableLineLength', spellcheck: 'spellcheck' } as const satisfies Record<string, keyof AppConfigRequest>
type UserKey = keyof typeof USER_KEYS

export interface UserSettingsMigrationResult {
  /** Vaults that received at least one value in app.json. */
  vaults: number
  /** Preference files the old keys were removed from. */
  cleanedFiles: number
}

interface PreferenceFile {
  file: string
  mtimeMs: number
  data: Record<string, unknown>
}

async function readPreferenceFiles(usersDir: string, only?: string): Promise<PreferenceFile[]> {
  let names: string[]
  try {
    names = await withRetry(() => fs.readdir(usersDir))
  } catch (error: unknown) {
    if (isMissing(error)) return []
    throw error
  }
  const files: PreferenceFile[] = []
  for (const name of names.filter((n) => n.endsWith('-preferences.json') && (only === undefined || n === only))) {
    const file = path.join(usersDir, name)
    try {
      const data: unknown = JSON.parse(await withRetry(() => fs.readFile(file, 'utf-8')))
      if (isRecord(data)) files.push({ file, mtimeMs: (await fs.stat(file)).mtimeMs, data })
    } catch {
      // An unreadable or invalid file is the preference store's concern, not ours.
    }
  }
  return files
}

/** Never throws: a failing vault is logged and retried on the next start. */
export async function migrateUserVaultSettingsToAppConfig(deps: {
  dataDir: string
  vaultRegistry: Pick<IVaultRegistry, 'load'>
  appConfigService: IAppConfigService
  logger: ILogger
}): Promise<UserSettingsMigrationResult> {
  const { dataDir, vaultRegistry, appConfigService, logger } = deps
  const result: UserSettingsMigrationResult = { vaults: 0, cleanedFiles: 0 }

  let files: PreferenceFile[]
  try {
    files = (await readPreferenceFiles(path.join(dataDir, 'users'))).sort((a, b) => b.mtimeMs - a.mtimeMs)
  } catch (error: unknown) {
    logger.error('User settings migration failed, will retry on next start', { error: error instanceof Error ? error.message : String(error) })
    return result
  }

  const vaultSettingsOf = (pref: PreferenceFile, vaultId: string): Record<string, unknown> | null => {
    const all = pref.data['vaultSettings']
    const entry = isRecord(all) ? all[vaultId] : undefined
    return isRecord(entry) ? entry : null
  }

  const handled = new Map<string, Set<UserKey>>()
  try {
    for (const vault of await vaultRegistry.load()) {
      try {
        const patch: AppConfigRequest = {}
        const keys = new Set<UserKey>()
        for (const key of Object.keys(USER_KEYS) as UserKey[]) {
          for (const pref of files) {
            const value = vaultSettingsOf(pref, vault.id)?.[key]
            if (typeof value === 'boolean') {
              patch[USER_KEYS[key]] = value
              keys.add(key)
              break
            }
          }
        }
        if (keys.size === 0) continue

        const existing = await appConfigService.get(vault.storagePath)
        const missing: AppConfigRequest = {}
        for (const key of keys) {
          if (typeof existing[USER_KEYS[key]] !== 'boolean') missing[USER_KEYS[key]] = patch[USER_KEYS[key]]
        }
        if (Object.keys(missing).length > 0) {
          await appConfigService.patch(vault.storagePath, missing)
          result.vaults++
          logger.info('Moved user settings into the vault\'s app.json', { vaultId: vault.id, moved: Object.keys(missing) })
        }
        handled.set(vault.id, keys)
      } catch (error: unknown) {
        logger.error('User settings migration failed, will retry on next start', {
          vaultId: vault.id, error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  } catch (error: unknown) {
    logger.error('User settings migration failed, will retry on next start', { error: error instanceof Error ? error.message : String(error) })
    return result
  }

  for (const stale of files) {
    try {
      const [pref] = await readPreferenceFiles(path.dirname(stale.file), path.basename(stale.file))
      if (pref === undefined) continue
      let changed = false
      for (const vaultId of handled.keys()) {
        const entry = vaultSettingsOf(pref, vaultId)
        if (entry === null) continue
        for (const key of Object.keys(USER_KEYS)) {
          if (typeof entry[key] === 'boolean') {
            delete entry[key]
            changed = true
          }
        }
      }
      if (changed) {
        await writeJsonFileAtomic(pref.file, pref.data)
        result.cleanedFiles++
      }
    } catch (error: unknown) {
      logger.error('Could not remove migrated keys from a preference file', { file: stale.file, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
