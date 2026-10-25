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
 * Validates raw JSON into a word list. Returns null (= fall back to empty) for
 * unrecognizable data; individual non-string entries are dropped.
 */
function sanitizeList(raw: unknown): SpellcheckWordList | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.words)) return null
  const words = obj.words.filter((w): w is string => typeof w === 'string' && w.length > 0)
  return { words: normalizeWords(words).slice(0, MAX_SPELLCHECK_WORDS) }
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
    await this.assertReadable(vaultId)
    return this.store.mutate(vaultId, (current) => {
      const merged = normalizeWords([...current.words, ...words])
      if (merged.length > MAX_SPELLCHECK_WORDS) {
        throw new SpellcheckDictionaryFullError(MAX_SPELLCHECK_WORDS)
      }
      return { words: merged }
    })
  }

  async removeWord(vaultId: string, word: string): Promise<SpellcheckWordList> {
    await this.assertReadable(vaultId)
    return this.store.mutate(vaultId, (current) => ({
      words: current.words.filter((entry) => entry !== word),
    }))
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
   * Refuses to write over a file that exists but cannot be parsed — typically a
   * Git merge that left conflict markers in it. Reading treats such a file as an
   * empty list; writing would replace the user's words with a list of one.
   */
  private async assertReadable(vaultId: string): Promise<void> {
    const filePath = this.getFilePath(vaultId)
    let raw: string
    try {
      raw = await readFile(filePath, 'utf-8')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return
      throw err
    }
    try {
      JSON.parse(raw)
    } catch {
      throw new SpellcheckDictionaryUnreadableError()
    }
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

/** Thrown when `.slatebase/spellcheck-words.json` exists but is not valid JSON. */
export class SpellcheckDictionaryUnreadableError extends Error {
  constructor() {
    super('The personal dictionary file is not valid JSON (unresolved Git merge?) — fix or delete .slatebase/spellcheck-words.json')
    this.name = 'SpellcheckDictionaryUnreadableError'
  }
}
