// CheckpointStore — Persistent sync checkpoint stored as JSON per vault

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { ICheckpointStore, SyncCheckpoint } from './types.js'

/**
 * Filesystem-based checkpoint store.
 * Stores the last known sync state (CouchDB sequence number + local mtimes)
 * as a JSON file under `data/sync/<vaultId>/checkpoint.json`.
 *
 * Uses atomic writes (temp file → rename) to prevent corruption.
 * Returns null for missing or corrupt checkpoints (triggers full pull).
 */
export class CheckpointStore implements ICheckpointStore {
  private readonly baseDir: string

  constructor(
    dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.baseDir = path.join(dataDir, 'sync')
  }

  /**
   * Saves a checkpoint atomically (temp file → rename).
   * Creates the vault sync directory if it does not exist.
   */
  async save(vaultId: string, checkpoint: SyncCheckpoint): Promise<void> {
    const dir = this.getVaultDir(vaultId)
    await fs.mkdir(dir, { recursive: true })

    const filePath = this.getFilePath(vaultId)
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    const content = JSON.stringify(checkpoint, null, 2)

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
   * Loads the checkpoint for a vault.
   * Returns null if the file does not exist or contains invalid/corrupt data.
   * A null return triggers a full pull on the next sync.
   */
  async load(vaultId: string): Promise<SyncCheckpoint | null> {
    const filePath = this.getFilePath(vaultId)

    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf-8')
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null
      }
      this.logger.error('Failed to read checkpoint file', { vaultId, error: String(error) })
      return null
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isValidCheckpoint(parsed)) {
        this.logger.warn('Checkpoint file has invalid structure, treating as missing', { vaultId })
        return null
      }
      return parsed
    } catch (error: unknown) {
      this.logger.error('Checkpoint file is corrupt (invalid JSON), treating as missing', { vaultId, error: String(error) })
      return null
    }
  }

  /**
   * Removes the checkpoint file for a vault.
   * Silently succeeds if the file does not exist.
   */
  async remove(vaultId: string): Promise<void> {
    const filePath = this.getFilePath(vaultId)

    try {
      await fs.unlink(filePath)
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      throw error
    }
  }

  /** Returns the vault-specific sync directory path. */
  private getVaultDir(vaultId: string): string {
    return path.join(this.baseDir, vaultId)
  }

  /** Returns the full path to the checkpoint file for a vault. */
  private getFilePath(vaultId: string): string {
    return path.join(this.baseDir, vaultId, 'checkpoint.json')
  }
}

// --- Helpers ---

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

/**
 * Validates that a parsed JSON value has the expected SyncCheckpoint structure.
 */
function isValidCheckpoint(value: unknown): value is SyncCheckpoint {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  if (typeof obj['lastSeq'] !== 'string') return false
  if (typeof obj['lastSyncAt'] !== 'string') return false
  if (typeof obj['localMtimes'] !== 'object' || obj['localMtimes'] === null) return false
  return true
}
