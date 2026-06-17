// TrashService — Soft-delete operations with atomic index updates

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { ITrashService, TrashEntry, TrashIndex } from './types.js'
import { TrashNotFoundError, TrashRestoreError } from './errors.js'

/**
 * Resolves a vault ID to its data directory path.
 */
export type VaultPathResolver = (vaultId: string) => string

/**
 * TrashService manages soft-delete operations.
 * Files are moved to `.trash/<uniqueId>/` and metadata is tracked in `_index.json`.
 * All index updates are atomic (temp file → rename).
 */
export class TrashService implements ITrashService {
  constructor(
    private readonly resolveVaultPath: VaultPathResolver,
    private readonly logger: ILogger,
  ) {}

  /**
   * Moves a file or folder into the `.trash/` directory and records metadata.
   * The file is stored under `.trash/<uniqueId>/<originalFilename>`.
   */
  async moveToTrash(vaultId: string, relativePath: string): Promise<TrashEntry> {
    const vaultDir = this.resolveVaultPath(vaultId)
    const trashDir = path.join(vaultDir, '.trash')
    const entryId = crypto.randomBytes(6).toString('hex')

    // 1. Ensure .trash/ directory exists
    await fs.mkdir(trashDir, { recursive: true })

    // 2. Create entry subdirectory
    const entryDir = path.join(trashDir, entryId)
    await fs.mkdir(entryDir)

    // 3. Determine source path and check if it's a directory
    const sourcePath = path.join(vaultDir, relativePath)
    const stat = await fs.stat(sourcePath)
    const isDirectory = stat.isDirectory()

    // 4. Move file/folder to .trash/<id>/<originalFilename>
    const fileName = path.basename(relativePath)
    const destPath = path.join(entryDir, fileName)
    await fs.rename(sourcePath, destPath)

    // 5. Create entry metadata
    const entry: TrashEntry = {
      id: entryId,
      originalPath: relativePath,
      deletedAt: new Date().toISOString(),
      isDirectory,
    }

    // 6. Update _index.json atomically
    await this.updateIndex(trashDir, (index) => {
      index.entries.push(entry)
    })

    this.logger.info('Moved to trash', { vaultId, path: relativePath, entryId })
    return entry
  }

  /**
   * Lists all trash entries for a vault, sorted by `deletedAt` descending.
   */
  async listTrash(vaultId: string): Promise<TrashEntry[]> {
    const vaultDir = this.resolveVaultPath(vaultId)
    const trashDir = path.join(vaultDir, '.trash')
    const index = await this.readIndex(trashDir)

    return index.entries.sort(
      (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
    )
  }

  /**
   * Restores a file from trash to its original path.
   * Creates missing parent directories automatically.
   * Appends suffix (`-restored`, `-restored-2`, ..., `-restored-99`) if path is occupied.
   */
  async restore(vaultId: string, entryId: string): Promise<{ restoredPath: string }> {
    const vaultDir = this.resolveVaultPath(vaultId)
    const trashDir = path.join(vaultDir, '.trash')
    const index = await this.readIndex(trashDir)

    const entry = index.entries.find((e) => e.id === entryId)
    if (!entry) {
      throw new TrashNotFoundError(entryId)
    }

    // Determine source path in .trash/
    const fileName = path.basename(entry.originalPath)
    const entryDir = path.join(trashDir, entryId)
    const sourcePath = path.join(entryDir, fileName)

    // Determine restore target path (with suffix if occupied)
    const restoredPath = await this.findAvailablePath(vaultDir, entry.originalPath)
    const absoluteRestorePath = path.join(vaultDir, restoredPath)

    try {
      // Create missing parent directories
      const parentDir = path.dirname(absoluteRestorePath)
      await fs.mkdir(parentDir, { recursive: true })

      // Move file back to original (or suffixed) location
      await fs.rename(sourcePath, absoluteRestorePath)

      // Clean up the entry directory (should be empty now)
      await fs.rm(entryDir, { recursive: true, force: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new TrashRestoreError(entryId, message)
    }

    // Remove entry from index atomically
    await this.updateIndex(trashDir, (idx) => {
      idx.entries = idx.entries.filter((e) => e.id !== entryId)
    })

    this.logger.info('Restored from trash', { vaultId, entryId, restoredPath })
    return { restoredPath }
  }

  /**
   * Permanently deletes a trash entry and its associated files.
   */
  async deletePermanently(vaultId: string, entryId: string): Promise<void> {
    const vaultDir = this.resolveVaultPath(vaultId)
    const trashDir = path.join(vaultDir, '.trash')
    const index = await this.readIndex(trashDir)

    const entry = index.entries.find((e) => e.id === entryId)
    if (!entry) {
      throw new TrashNotFoundError(entryId)
    }

    // Remove the entry directory and its contents
    const entryDir = path.join(trashDir, entryId)
    await fs.rm(entryDir, { recursive: true, force: true })

    // Remove entry from index atomically
    await this.updateIndex(trashDir, (idx) => {
      idx.entries = idx.entries.filter((e) => e.id !== entryId)
    })

    this.logger.info('Permanently deleted from trash', { vaultId, entryId })
  }

  /**
   * Removes entries older than `retentionDays` and returns the number purged.
   */
  async purgeExpired(vaultId: string, retentionDays: number): Promise<number> {
    const vaultDir = this.resolveVaultPath(vaultId)
    const trashDir = path.join(vaultDir, '.trash')
    const index = await this.readIndex(trashDir)

    if (index.entries.length === 0) {
      return 0
    }

    const now = Date.now()
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000
    const expiredIds: string[] = []

    for (const entry of index.entries) {
      const deletedAt = new Date(entry.deletedAt).getTime()
      if (now - deletedAt > retentionMs) {
        expiredIds.push(entry.id)
      }
    }

    if (expiredIds.length === 0) {
      return 0
    }

    // Remove expired entry directories (isolated per entry — one failure doesn't stop others)
    for (const id of expiredIds) {
      const entryDir = path.join(trashDir, id)
      try {
        await fs.rm(entryDir, { recursive: true, force: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error('Failed to purge trash entry', { vaultId, entryId: id, error: message })
      }
    }

    // Remove expired entries from index atomically
    await this.updateIndex(trashDir, (idx) => {
      idx.entries = idx.entries.filter((e) => !expiredIds.includes(e.id))
    })

    this.logger.info('Purged expired trash entries', { vaultId, count: expiredIds.length })
    return expiredIds.length
  }

  /**
   * Permanently deletes a file immediately (when retentionDays is 0).
   * Does not move to .trash/, simply removes from disk.
   */
  async deleteImmediately(vaultId: string, relativePath: string): Promise<void> {
    const vaultDir = this.resolveVaultPath(vaultId)
    const filePath = path.join(vaultDir, relativePath)

    await fs.rm(filePath, { recursive: true, force: true })

    this.logger.info('Permanently deleted immediately', { vaultId, path: relativePath })
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Reads the `_index.json` file from the trash directory.
   * Returns an empty index if the file doesn't exist.
   */
  private async readIndex(trashDir: string): Promise<TrashIndex> {
    const indexPath = path.join(trashDir, '_index.json')

    try {
      const raw = await fs.readFile(indexPath, 'utf-8')
      const data: unknown = JSON.parse(raw)
      if (data && typeof data === 'object' && 'entries' in data && Array.isArray((data as TrashIndex).entries)) {
        return data as TrashIndex
      }
      return { entries: [] }
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return { entries: [] }
      }
      throw error
    }
  }

  /**
   * Atomically updates the `_index.json` file.
   * Reads current index, applies the updater function, writes to temp file, renames.
   */
  private async updateIndex(trashDir: string, updater: (index: TrashIndex) => void): Promise<void> {
    const indexPath = path.join(trashDir, '_index.json')

    // Read current index
    const index = await this.readIndex(trashDir)

    // Apply update
    updater(index)

    // Write atomically: temp → rename
    const content = JSON.stringify(index, null, 2)
    const tempPath = `${indexPath}.${crypto.randomBytes(8).toString('hex')}.tmp`

    await fs.writeFile(tempPath, content, 'utf-8')

    try {
      await fs.rename(tempPath, indexPath)
    } catch (renameError) {
      // Clean up temp file on rename failure
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw renameError
    }
  }

  /**
   * Finds an available path for restoration.
   * If the original path is free, returns it.
   * Otherwise appends `-restored`, `-restored-2`, ..., `-restored-99` before the extension.
   */
  private async findAvailablePath(vaultDir: string, originalPath: string): Promise<string> {
    const absolutePath = path.join(vaultDir, originalPath)

    if (!(await this.pathExists(absolutePath))) {
      return originalPath
    }

    const ext = path.extname(originalPath)
    const base = originalPath.slice(0, originalPath.length - ext.length)

    // Try -restored first
    const restoredPath = `${base}-restored${ext}`
    if (!(await this.pathExists(path.join(vaultDir, restoredPath)))) {
      return restoredPath
    }

    // Try -restored-2 through -restored-99
    for (let i = 2; i <= 99; i++) {
      const suffixedPath = `${base}-restored-${i}${ext}`
      if (!(await this.pathExists(path.join(vaultDir, suffixedPath)))) {
        return suffixedPath
      }
    }

    // Exhausted all suffixes — use -restored-99 (will overwrite if exists, but spec says max 99)
    return `${base}-restored-99${ext}`
  }

  /**
   * Checks if a path exists on the filesystem.
   */
  private async pathExists(absolutePath: string): Promise<boolean> {
    try {
      await fs.access(absolutePath)
      return true
    } catch {
      return false
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
