// Moves settings that `.slatebase/config.json` used to hold into the Obsidian files that now own
// them. Obsidian's files are the source of truth (decided 2026-10-29), so after the move the
// field is gone from config.json.
//
//   attachmentsDirectory    →  app.json          attachmentFolderPath   ("" → "./")
//   templatesDirectory      →  templates.json    folder
//   dailyNotesDirectory     →  daily-notes.json  folder
//   dailyNoteTemplateName   →  daily-notes.json  template               (<templates folder>/<name>, without .md)
//
// A value that equals the default is not written (the default applies anyway). An existing value in
// the Obsidian file always wins and is never overwritten. The old fields are removed only after the
// Obsidian files hold the values, so a failure at any point keeps them and is retried on the next
// start. Idempotent: without the old fields nothing happens.

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import { isMissing, withRetry } from '../shared/fs-retry.js'
import { writeJsonFileAtomic } from '../shared/json-file-store.js'
import { ObsidianConfigFileInvalidError } from '../shared/obsidian-config-file.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IAppConfigService } from './app-config.js'
import type { INoteConfigService, NoteConfigPatch } from './note-config.js'

const CONFIG_PATH = path.join('.slatebase', 'config.json')

/** The fields of config.json that Obsidian's files own now. */
const LEGACY_KEYS = ['attachmentsDirectory', 'templatesDirectory', 'dailyNotesDirectory', 'dailyNoteTemplateName'] as const

/** The template file name that already is the default. */
const DEFAULT_DAILY_TEMPLATE_NAME = 'daily.md'

export interface VaultConfigMigrationResult {
  /** Vaults whose old fields were moved (or dropped because the Obsidian files already had a value). */
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
  noteConfigService: INoteConfigService
  /** The server's default template folder (a value equal to it is not worth writing). */
  defaultTemplatesDirectory: string
  logger: ILogger
}): Promise<VaultConfigMigrationResult> {
  const { vaultRegistry, appConfigService, noteConfigService, defaultTemplatesDirectory, logger } = deps
  const result: VaultConfigMigrationResult = { migrated: 0 }

  for (const vault of await vaultRegistry.load()) {
    const configFile = path.join(vault.storagePath, CONFIG_PATH)
    try {
      const config = await readConfig(configFile)
      if (config === null) continue
      const moving = LEGACY_KEYS.filter((key) => typeof config[key] === 'string')
      if (moving.length === 0) continue

      if (typeof config['attachmentsDirectory'] === 'string') {
        const legacy = config['attachmentsDirectory'].trim()
        const existing = await appConfigService.get(vault.storagePath)
        if (typeof existing['attachmentFolderPath'] !== 'string') {
          await appConfigService.patch(vault.storagePath, { attachmentFolderPath: legacy === '' ? './' : legacy })
        }
      }

      const note = await noteConfigService.get(vault.storagePath)
      const noteChanges: NoteConfigPatch = {}
      const legacyTemplates = typeof config['templatesDirectory'] === 'string' ? config['templatesDirectory'].trim() : ''
      if (legacyTemplates !== '' && legacyTemplates !== defaultTemplatesDirectory && note.templatesFolder === null) {
        noteChanges.templatesFolder = legacyTemplates
      }
      const legacyDaily = typeof config['dailyNotesDirectory'] === 'string' ? config['dailyNotesDirectory'].trim() : ''
      if (legacyDaily !== '' && note.dailyFolder === null) noteChanges.dailyFolder = legacyDaily
      if (typeof config['dailyNoteTemplateName'] === 'string' && note.dailyTemplate === null) {
        const name = config['dailyNoteTemplateName'].trim()
        if (name !== DEFAULT_DAILY_TEMPLATE_NAME) {
          const folder = legacyTemplates || note.templatesFolder || defaultTemplatesDirectory
          noteChanges.dailyTemplate = name === '' ? '' : `${folder}/${name}`
        }
      }
      if (Object.keys(noteChanges).length > 0) await noteConfigService.patch(vault.storagePath, noteChanges)

      const rest = Object.fromEntries(Object.entries(config).filter(([key]) => !(LEGACY_KEYS as readonly string[]).includes(key)))
      await writeJsonFileAtomic(configFile, rest)
      result.migrated++
      logger.info('Moved settings from .slatebase/config.json into the vault\'s Obsidian files', { vaultId: vault.id, moved: moving })
    } catch (error: unknown) {
      if (error instanceof ObsidianConfigFileInvalidError) {
        logger.warn('Settings migration postponed: an Obsidian config file is not valid JSON', { vaultId: vault.id })
      } else {
        logger.error('Settings migration failed, will retry on next start', {
          vaultId: vault.id, error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  return result
}
