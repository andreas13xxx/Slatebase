// SnippetStore — Filesystem persistence for user CSS snippets, per vault.
// Modeled on `plugin/installed-plugin-store.ts`'s atomic-write pattern.

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ISnippetStore, SnippetMeta, SnippetRegistryData } from './types.js'
import { SnippetTooLargeError } from './errors.js'
import { isValidSnippetFilename, snippetIdFromFilename, MAX_SNIPPET_SIZE } from './validation.js'
import { isNodeError } from '../shared/fs-utils.js'

/**
 * Filesystem-based persistence for CSS snippets.
 * Stores snippets under `data/snippets/<vaultId>/<snippetId>.css`.
 * All writes are atomic (temp file → rename).
 */
export class SnippetStore implements ISnippetStore {
  private readonly snippetsDir: string

  constructor(dataDir: string) {
    this.snippetsDir = path.join(dataDir, 'snippets')
  }

  /**
   * Saves (creates or overwrites) a snippet's CSS content atomically.
   * Validates the size before writing.
   */
  async saveSnippet(vaultId: string, snippetId: string, content: string): Promise<void> {
    const size = Buffer.byteLength(content, 'utf-8')
    if (size > MAX_SNIPPET_SIZE) {
      throw new SnippetTooLargeError(MAX_SNIPPET_SIZE, size)
    }

    const dir = this.getVaultDir(vaultId)
    await fs.mkdir(dir, { recursive: true })

    const filePath = this.getSnippetPath(vaultId, snippetId)
    await this.atomicWrite(filePath, content)
  }

  /**
   * Loads a snippet's CSS content from disk.
   * Returns null if it does not exist.
   */
  async loadSnippet(vaultId: string, snippetId: string): Promise<string | null> {
    return this.readTextFile(this.getSnippetPath(vaultId, snippetId))
  }

  /**
   * Deletes a snippet. Does nothing if it does not exist.
   */
  async deleteSnippet(vaultId: string, snippetId: string): Promise<void> {
    try {
      await fs.unlink(this.getSnippetPath(vaultId, snippetId))
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      throw error
    }
  }

  /**
   * Lists metadata for all snippets in a vault by reading `.css` files in
   * the vault's snippet directory.
   */
  async listSnippets(vaultId: string): Promise<SnippetMeta[]> {
    const dir = this.getVaultDir(vaultId)

    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return []
      }
      throw error
    }

    const metas: SnippetMeta[] = []
    for (const filename of entries) {
      if (!isValidSnippetFilename(filename)) continue

      const filePath = path.join(dir, filename)
      let stat: Awaited<ReturnType<typeof fs.stat>>
      try {
        stat = await fs.stat(filePath)
      } catch {
        continue
      }

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
   * Saves the snippet activation registry (_registry.json) atomically.
   */
  async saveRegistry(vaultId: string, registry: SnippetRegistryData): Promise<void> {
    const dir = this.getVaultDir(vaultId)
    await fs.mkdir(dir, { recursive: true })

    const filePath = path.join(dir, '_registry.json')
    const content = JSON.stringify(registry, null, 2)
    await this.atomicWrite(filePath, content)
  }

  /**
   * Loads the snippet activation registry (_registry.json) from disk.
   * Returns null if the file does not exist or cannot be parsed.
   */
  async loadRegistry(vaultId: string): Promise<SnippetRegistryData | null> {
    const filePath = path.join(this.getVaultDir(vaultId), '_registry.json')
    return this.readJsonFile<SnippetRegistryData>(filePath)
  }

  /**
   * Deletes all snippet data for a vault (files + registry).
   * Recursively removes the vault's snippet directory. Does nothing if it
   * does not exist.
   */
  async deleteAllForVault(vaultId: string): Promise<void> {
    const dir = this.getVaultDir(vaultId)
    try {
      await fs.rm(dir, { recursive: true, force: true })
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      throw error
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private getVaultDir(vaultId: string): string {
    return path.join(this.snippetsDir, vaultId)
  }

  /**
   * Returns the file path for a specific snippet.
   * Validates the snippetId to prevent path traversal attacks.
   * @throws Error if snippetId contains unsafe characters.
   */
  private getSnippetPath(vaultId: string, snippetId: string): string {
    const filename = `${snippetId}.css`
    if (!isValidSnippetFilename(filename)) {
      throw new Error(`Invalid snippet ID: "${snippetId}" — must match /^[a-zA-Z0-9_-]+$/`)
    }

    const vaultDir = this.getVaultDir(vaultId)
    const resolved = path.join(vaultDir, filename)
    const expectedParent = vaultDir + path.sep

    // Defense-in-depth: verify resolved path stays within the vault snippets directory
    if (!resolved.startsWith(expectedParent)) {
      throw new Error(`Path traversal detected for snippet ID: "${snippetId}"`)
    }

    return resolved
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
   * Reads and parses a JSON file from disk.
   * Returns null if the file does not exist or cannot be parsed.
   */
  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(raw) as T
    } catch {
      return null
    }
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
