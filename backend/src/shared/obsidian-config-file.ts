// Access to JSON config files in `<vault>/.obsidian/` that Obsidian also reads and writes
// (`app.json`, ...). Same rules as appearance-file.ts: one lock per vault and file serialises every
// read-modify-write cycle, fields this app does not know are kept, and a file that is not a JSON
// object is never overwritten (it may be mid-sync or hand-edited).

import fs from 'node:fs/promises'
import { validateFilePath } from '../vault/index.js'
import { KeyedMutex } from './async-mutex.js'
import { isMissing, withRetry } from './fs-retry.js'
import { writeJsonFileAtomic } from './json-file-store.js'

/** The Obsidian config files this module may touch. A closed list: the name never comes from a request. */
export type ObsidianConfigFile = 'app.json' | 'templates.json' | 'daily-notes.json'

/** Thrown when the file exists but is not a JSON object. The file is left untouched. */
export class ObsidianConfigFileInvalidError extends Error {
  constructor(public readonly file: ObsidianConfigFile) {
    super(`.obsidian/${file} is not a valid JSON object; leaving it untouched`)
    this.name = 'ObsidianConfigFileInvalidError'
  }
}

const mutex = new KeyedMutex()

function relativePath(file: ObsidianConfigFile): string {
  return `.obsidian/${file}`
}

/**
 * Reads the file. Returns null if it does not exist; throws {@link ObsidianConfigFileInvalidError}
 * if it is not a JSON object, and the raw I/O error if it cannot be read — never reports an
 * unreadable file as absent.
 */
export async function readObsidianConfig(vaultPath: string, file: ObsidianConfigFile): Promise<Record<string, unknown> | null> {
  const target = validateFilePath(vaultPath, relativePath(file))
  let raw: string
  try {
    raw = await withRetry(() => fs.readFile(target, 'utf-8'))
  } catch (error: unknown) {
    if (isMissing(error)) return null
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ObsidianConfigFileInvalidError(file)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ObsidianConfigFileInvalidError(file)
  }
  return parsed as Record<string, unknown>
}

/**
 * Read-modify-write under the vault's lock. `change` receives the current fields (an empty object
 * if the file does not exist yet) and returns the new ones; nothing is written if it returns the
 * same object untouched (`null`). Returns the fields as they are on disk afterwards.
 */
export function updateObsidianConfig(
  vaultPath: string,
  file: ObsidianConfigFile,
  change: (current: Record<string, unknown>) => Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  return mutex.runExclusive(`${vaultPath}\0${file}`, async () => {
    const current = (await readObsidianConfig(vaultPath, file)) ?? {}
    const next = change({ ...current })
    if (next === null) return current
    await writeJsonFileAtomic(validateFilePath(vaultPath, relativePath(file)), next)
    return next
  })
}
