// SnippetStore — CSS snippets in the vault's `.obsidian/snippets/` folder, like Obsidian.
// Activation lives in `enabledCssSnippets` of `.obsidian/appearance.json`.

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Stats } from 'node:fs'
import type { ISnippetStore, SnippetMeta } from './types.js'
import { SnippetTooLargeError } from './errors.js'
import { isValidSnippetFilename, snippetIdFromFilename, MAX_SNIPPET_SIZE } from './validation.js'
import { AppearanceFileInvalidError, readAppearance, withAppearanceLock, writeAppearance } from '../shared/appearance-file.js'
import { isMissing, withRetry } from '../shared/fs-retry.js'
import { isNodeError } from '../shared/fs-utils.js'
import { validateFilePath } from '../vault/index.js'

const SNIPPETS_DIR = '.obsidian/snippets'
const ENABLED_KEY = 'enabledCssSnippets'

/** Reads `enabledCssSnippets` from an appearance object; anything but an array of strings yields []. */
function enabledIdsOf(appearance: Record<string, unknown> | null): string[] {
  const value = appearance?.[ENABLED_KEY]
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/**
 * Filesystem-based persistence for CSS snippets, stored in the vault itself at
 * `<vault>/.obsidian/snippets/<id>.css`. All writes are atomic (temp file → rename).
 *
 * Symlinks are never followed: a snippet that is a link is treated as absent, so a
 * link planted in a synced vault cannot expose files outside the vault.
 */
export class SnippetStore implements ISnippetStore {
  /**
   * Saves (creates or overwrites) a snippet's CSS content atomically.
   * Validates the size before writing.
   */
  async saveSnippet(vaultPath: string, snippetId: string, content: string): Promise<void> {
    const size = Buffer.byteLength(content, 'utf-8')
    if (size > MAX_SNIPPET_SIZE) {
      throw new SnippetTooLargeError(MAX_SNIPPET_SIZE, size)
    }

    const filePath = this.getSnippetPath(vaultPath, snippetId)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await this.atomicWrite(filePath, content)
  }

  /**
   * Loads a snippet's CSS content from disk.
   * Returns null if it does not exist (or is not a regular file).
   */
  async loadSnippet(vaultPath: string, snippetId: string): Promise<string | null> {
    const filePath = this.getSnippetPath(vaultPath, snippetId)
    const stat = await this.lstatOrNull(filePath)
    if (stat === null || !stat.isFile()) return null
    return this.readTextFile(filePath)
  }

  /**
   * Deletes a snippet and removes it from `enabledCssSnippets`.
   * Does nothing if it does not exist.
   */
  async deleteSnippet(vaultPath: string, snippetId: string): Promise<void> {
    const filePath = this.getSnippetPath(vaultPath, snippetId)
    await withAppearanceLock(vaultPath, async () => {
      try {
        await withRetry(() => fs.unlink(filePath))
      } catch (error: unknown) {
        if (!isMissing(error)) throw error
      }

      let current: Record<string, unknown> | null
      try {
        current = await readAppearance(vaultPath)
      } catch (error: unknown) {
        if (error instanceof AppearanceFileInvalidError) return // never touch a file we cannot parse
        throw error
      }
      const enabled = enabledIdsOf(current)
      if (current !== null && enabled.includes(snippetId)) {
        await writeAppearance(vaultPath, { ...current, [ENABLED_KEY]: enabled.filter((id) => id !== snippetId) })
      }
    })
  }

  /**
   * Lists metadata for all snippets in a vault by reading the `.css` files in
   * `.obsidian/snippets/`. Files whose names Slatebase cannot address are skipped.
   */
  async listSnippets(vaultPath: string): Promise<SnippetMeta[]> {
    const dir = validateFilePath(vaultPath, SNIPPETS_DIR)

    let entries: string[]
    try {
      entries = await withRetry(() => fs.readdir(dir))
    } catch (error: unknown) {
      if (isMissing(error)) return []
      throw error
    }

    const metas: SnippetMeta[] = []
    for (const filename of entries) {
      if (!isValidSnippetFilename(filename)) continue

      let stat: Stats | null
      try {
        stat = await this.lstatOrNull(path.join(dir, filename))
      } catch {
        continue
      }
      if (stat === null || !stat.isFile()) continue

      metas.push({
        id: snippetIdFromFilename(filename),
        filename,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      })
    }

    return metas
  }

  /**
   * Ids listed in `enabledCssSnippets`. An absent or unparsable appearance.json
   * yields an empty list; I/O errors propagate.
   */
  async loadEnabledIds(vaultPath: string): Promise<string[]> {
    try {
      return enabledIdsOf(await readAppearance(vaultPath))
    } catch (error: unknown) {
      if (error instanceof AppearanceFileInvalidError) return []
      throw error
    }
  }

  /**
   * Replaces `enabledCssSnippets`, preserving all other appearance.json fields.
   * @throws AppearanceFileInvalidError if the file exists but is not a JSON object.
   */
  async saveEnabledIds(vaultPath: string, ids: string[]): Promise<void> {
    await withAppearanceLock(vaultPath, async () => {
      const current = (await readAppearance(vaultPath)) ?? {}
      await fs.mkdir(path.dirname(validateFilePath(vaultPath, '.obsidian/appearance.json')), { recursive: true })
      await writeAppearance(vaultPath, { ...current, [ENABLED_KEY]: ids })
    })
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /** lstat that returns null for a missing path. Symlinks are reported as-is (never followed). */
  private async lstatOrNull(filePath: string): Promise<Stats | null> {
    try {
      return await withRetry(() => fs.lstat(filePath))
    } catch (error: unknown) {
      if (isMissing(error)) return null
      throw error
    }
  }

  /**
   * Returns the file path for a specific snippet inside the vault.
   * Validates the snippetId and confines the path to the vault.
   * @throws Error if snippetId is not a valid snippet name.
   */
  private getSnippetPath(vaultPath: string, snippetId: string): string {
    const filename = `${snippetId}.css`
    if (!isValidSnippetFilename(filename)) {
      throw new Error(`Invalid snippet ID: "${snippetId}"`)
    }
    return validateFilePath(vaultPath, `${SNIPPETS_DIR}/${filename}`)
  }

  /**
   * Writes content to a file atomically using temp file + rename.
   * Retries on EPERM/EACCES errors (Windows file locking), then falls back
   * to a direct write, so a transient lock never surfaces as a lost write.
   * Mirrors `plugin/installed-plugin-store.ts`'s `atomicWrite`.
   */
  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`

    await fs.writeFile(tempPath, content, 'utf-8')

    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fs.rename(tempPath, filePath)
        return
      } catch (renameError) {
        lastError = renameError
        const code = isNodeError(renameError) ? renameError.code : ''
        if (code === 'EPERM' || code === 'EACCES') {
          await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)))
          continue
        }
        try {
          await fs.unlink(tempPath)
        } catch {
          // Ignore cleanup errors
        }
        throw renameError
      }
    }

    const code = isNodeError(lastError) ? lastError.code : ''
    if (code === 'EPERM' || code === 'EACCES') {
      try {
        await fs.unlink(filePath)
        await fs.rename(tempPath, filePath)
        return
      } catch {
        try {
          await fs.writeFile(filePath, content, 'utf-8')
          await fs.unlink(tempPath)
          return
        } catch (fallbackError) {
          lastError = fallbackError
        }
      }
    }

    try {
      await fs.unlink(tempPath)
    } catch {
      // Ignore cleanup errors
    }
    throw lastError
  }

  /**
   * Reads a text file from disk.
   * Returns null if the file does not exist.
   */
  private async readTextFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }
}
