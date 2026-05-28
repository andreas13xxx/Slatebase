// ConflictStore — Persistent conflict entries stored as a JSON file per vault

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { ConflictEntry, IConflictStore } from './types.js'

/**
 * Filesystem-based implementation of IConflictStore.
 * Stores conflicts as a JSON array in `data/sync/<vaultId>/conflicts.json`.
 * All mutations use atomic writes (temp file → rename) to prevent corruption.
 */
export class ConflictStore implements IConflictStore {
  private readonly baseDir: string

  constructor(
    dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.baseDir = path.join(dataDir, 'sync')
  }

  /**
   * Returns the path to the conflicts.json file for a given vault.
   */
  private conflictsPath(vaultId: string): string {
    return path.join(this.baseDir, vaultId, 'conflicts.json')
  }

  /**
   * Ensures the vault sync directory exists.
   */
  private async ensureDirectory(vaultId: string): Promise<void> {
    await fs.mkdir(path.join(this.baseDir, vaultId), { recursive: true })
  }

  /**
   * Reads and parses the conflicts file for a vault.
   * Returns an empty array if the file does not exist or is corrupt.
   */
  private async readConflicts(vaultId: string): Promise<ConflictEntry[]> {
    const filePath = this.conflictsPath(vaultId)
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        this.logger.warn('Conflicts file is not an array, returning empty', { vaultId })
        return []
      }
      return parsed as ConflictEntry[]
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return []
      }
      this.logger.error('Failed to read conflicts file, returning empty', { vaultId, error: String(error) })
      return []
    }
  }

  /**
   * Writes the conflicts array atomically (temp file → rename).
   */
  private async writeConflicts(vaultId: string, conflicts: ConflictEntry[]): Promise<void> {
    await this.ensureDirectory(vaultId)
    const filePath = this.conflictsPath(vaultId)
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    const content = JSON.stringify(conflicts, null, 2)

    await fs.writeFile(tempPath, content, 'utf-8')

    try {
      await fs.rename(tempPath, filePath)
    } catch (renameError) {
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw renameError
    }
  }

  /**
   * Adds a new conflict entry. If a conflict for the same documentPath
   * already exists, it is replaced with the new entry.
   */
  async add(vaultId: string, conflict: ConflictEntry): Promise<void> {
    const conflicts = await this.readConflicts(vaultId)
    const existingIndex = conflicts.findIndex((c) => c.documentPath === conflict.documentPath)
    if (existingIndex >= 0) {
      conflicts[existingIndex] = conflict
    } else {
      conflicts.push(conflict)
    }
    await this.writeConflicts(vaultId, conflicts)
  }

  /**
   * Returns all open conflicts for a vault.
   */
  async getAll(vaultId: string): Promise<ConflictEntry[]> {
    return this.readConflicts(vaultId)
  }

  /**
   * Removes a resolved conflict by document path.
   */
  async remove(vaultId: string, documentPath: string): Promise<void> {
    const conflicts = await this.readConflicts(vaultId)
    const filtered = conflicts.filter((c) => c.documentPath !== documentPath)
    await this.writeConflicts(vaultId, filtered)
  }

  /**
   * Checks whether a conflict exists for a given document path.
   */
  async exists(vaultId: string, documentPath: string): Promise<boolean> {
    const conflicts = await this.readConflicts(vaultId)
    return conflicts.some((c) => c.documentPath === documentPath)
  }
}

// --- Helpers ---

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
