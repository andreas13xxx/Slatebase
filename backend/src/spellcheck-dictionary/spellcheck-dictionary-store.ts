/**
 * SpellcheckDictionaryStore — filesystem persistence for a vault's personal spellcheck words.
 * Each vault's list is stored as `.slatebase/spellcheck-words.json` inside the vault's data
 * directory and travels with the vault through Git Sync (see MANAGED_GITIGNORE_LINES).
 * Uses atomic writes (temp → rename) via KeyedJsonFileStore for crash safety.
 */

import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { ILogger } from '../logger/index.js'
import type { ISpellcheckDictionaryService, SpellcheckWordList } from './types.js'
import { MAX_SPELLCHECK_WORDS } from './types.js'
import { isValidSpellcheckWord } from './validation.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'
import { isNodeError } from '../shared/fs-utils.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Word list file path relative to vault root. */
const WORDS_PATH = path.join('.slatebase', 'spellcheck-words.json')

const EMPTY_LIST: SpellcheckWordList = { words: [] }

// ─── Types ───────────────────────────────────────────────────────────────────

/** Resolves a vault ID to its storage path, or null if not found. */
export type VaultPathResolver = (vaultId: string) => string | null

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deduplicates and sorts by code point, so the same set always serializes to the same lines. */
function normalizeWords(words: Iterable<string>): string[] {
  return [...new Set(words)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Validates raw JSON into a word list. Returns null (= unrecognizable) for
 * anything that is not `{ words: [...] }`; individual entries the API would not
 * accept are dropped. The list is deliberately not cut to the cap: a Git merge
 * of two devices' lists can exceed it, and truncating on read would delete the
 * alphabetically last words on the next write.
 */
function sanitizeList(raw: unknown): SpellcheckWordList | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.words)) return null
  const words = obj.words.filter((w): w is string => typeof w === 'string' && isValidSpellcheckWord(w))
  return { words: normalizeWords(words) }
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class SpellcheckDictionaryStore implements ISpellcheckDictionaryService {
  private readonly store: KeyedJsonFileStore<SpellcheckWordList>

  constructor(
    private readonly resolveVaultPath: VaultPathResolver,
    private readonly logger: ILogger,
  ) {
    this.store = new KeyedJsonFileStore<SpellcheckWordList>(
      (vaultId) => this.getFilePath(vaultId),
      EMPTY_LIST,
      sanitizeList,
      (error) => this.logger.error('Failed to load spellcheck word list', { error: String(error) }),
    )
  }

  async getWords(vaultId: string): Promise<SpellcheckWordList> {
    return this.store.read(vaultId)
  }

  async addWords(vaultId: string, words: string[]): Promise<SpellcheckWordList> {
    // Nothing new: answer from the file without touching it, so a repeated add
    // never rewrites (and so never dirties) a file that Git Sync tracks.
    const current = await this.store.read(vaultId)
    if (words.every((word) => current.words.includes(word))) return current

    return this.store.mutate(vaultId, async (latest) => {
      await this.assertReadable(vaultId)
      const merged = normalizeWords([...latest.words, ...words])
      if (merged.length > MAX_SPELLCHECK_WORDS && merged.length > latest.words.length) {
        throw new SpellcheckDictionaryFullError(MAX_SPELLCHECK_WORDS)
      }
      return { words: merged }
    })
  }

  async removeWord(vaultId: string, word: string): Promise<SpellcheckWordList> {
    // Removing a word that is not there must not create or reformat the file.
    const current = await this.store.read(vaultId)
    if (!current.words.includes(word)) return current

    return this.store.mutate(vaultId, async (latest) => {
      await this.assertReadable(vaultId)
      return { words: latest.words.filter((entry) => entry !== word) }
    })
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private getFilePath(vaultId: string): string {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (!vaultPath) {
      throw new Error(`Vault not found: ${vaultId}`)
    }
    return path.join(vaultPath, WORDS_PATH)
  }

  /**
   * Refuses to write over a file that exists but is not a word list — invalid
   * JSON (typically a Git merge that left conflict markers) or valid JSON of
   * the wrong shape. Reading treats such a file as an empty list; writing would
   * replace the user's words with a list of one. Called from inside the
   * store's `mutate`, so the check and the write share the per-vault lock.
   */
  private async assertReadable(vaultId: string): Promise<void> {
    let raw: string
    try {
      raw = await readFile(this.getFilePath(vaultId), 'utf-8')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return
      throw err
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new SpellcheckDictionaryUnreadableError()
    }
    if (sanitizeList(parsed) === null) throw new SpellcheckDictionaryUnreadableError()
  }
}

// ─── Error Classes ───────────────────────────────────────────────────────────

/** Thrown when adding words would exceed the per-vault cap. */
export class SpellcheckDictionaryFullError extends Error {
  constructor(max: number) {
    super(`The personal dictionary is limited to ${max} words`)
    this.name = 'SpellcheckDictionaryFullError'
  }
}

/** Thrown when `.slatebase/spellcheck-words.json` exists but is not a readable word list. */
export class SpellcheckDictionaryUnreadableError extends Error {
  constructor() {
    super('The personal dictionary file is not a valid word list (unresolved Git merge?) — fix or delete .slatebase/spellcheck-words.json')
    this.name = 'SpellcheckDictionaryUnreadableError'
  }
}
