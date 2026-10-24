// Access to `<vault>/.obsidian/appearance.json`, shared by everything that edits it
// (active theme, enabled CSS snippets). One lock per vault serialises every
// read-modify-write cycle, so two features can never overwrite each other's fields.

import fs from 'node:fs/promises'
import { validateFilePath } from '../vault/index.js'
import { KeyedMutex } from './async-mutex.js'
import { isMissing, withRetry } from './fs-retry.js'
import { writeJsonFileAtomic } from './json-file-store.js'

const APPEARANCE_FILE = '.obsidian/appearance.json'

/**
 * Thrown when `.obsidian/appearance.json` exists but is not a JSON object.
 * The file is never overwritten in that case — it may be mid-sync or hand-edited.
 */
export class AppearanceFileInvalidError extends Error {
  constructor() {
    super('.obsidian/appearance.json is not a valid JSON object; leaving it untouched')
    this.name = 'AppearanceFileInvalidError'
  }
}

const appearanceMutex = new KeyedMutex()

/** Runs `fn` while holding the vault's appearance.json lock. */
export function withAppearanceLock<T>(vaultPath: string, fn: () => Promise<T>): Promise<T> {
  return appearanceMutex.runExclusive(vaultPath, fn)
}

/**
 * Reads appearance.json. Returns null if the file does not exist; throws
 * {@link AppearanceFileInvalidError} if it is not a JSON object, and the raw
 * I/O error if it cannot be read — never reports an unreadable file as absent.
 */
export async function readAppearance(vaultPath: string): Promise<Record<string, unknown> | null> {
  const file = validateFilePath(vaultPath, APPEARANCE_FILE)
  let raw: string
  try {
    raw = await withRetry(() => fs.readFile(file, 'utf-8'))
  } catch (error: unknown) {
    if (isMissing(error)) return null
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AppearanceFileInvalidError()
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AppearanceFileInvalidError()
  }
  return parsed as Record<string, unknown>
}

/** Writes appearance.json atomically. Call inside {@link withAppearanceLock}, with fields merged from {@link readAppearance}. */
export async function writeAppearance(vaultPath: string, appearance: Record<string, unknown>): Promise<void> {
  await writeJsonFileAtomic(validateFilePath(vaultPath, APPEARANCE_FILE), appearance)
}
