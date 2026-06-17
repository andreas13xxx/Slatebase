// VersionService — file versioning with atomic writes and automatic pruning

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { IVersionService, VersionEntry } from './types.js'
import { VersionNotFoundError } from './errors.js'

/**
 * Resolves a vaultId to the vault's absolute filesystem path.
 */
export type VaultPathResolver = (vaultId: string) => string | null

/**
 * Service for file versioning.
 * Stores previous file content under `.versions/` before each save and
 * provides retrieval, restoration, and cleanup operations.
 */
export class VersionService implements IVersionService {
  constructor(
    private readonly resolveVaultPath: VaultPathResolver,
    private readonly maxVersionsPerFile: number,
    private readonly logger: ILogger
  ) {}

  /**
   * Creates a new version by saving the previous content before overwrite.
   * Writes atomically (temp → rename) and prunes excess versions.
   * No-op when maxVersionsPerFile is 0.
   */
  async createVersion(vaultId: string, relativePath: string, previousContent: Buffer): Promise<void> {
    if (this.maxVersionsPerFile === 0) return

    const versionDir = this.getVersionDir(vaultId, relativePath)
    await fs.mkdir(versionDir, { recursive: true })

    const timestamp = this.generateTimestamp()
    const ext = path.extname(relativePath)
    const versionFile = path.join(versionDir, `${timestamp}${ext}`)

    // Atomic write: temp → rename
    const tmpFile = `${versionFile}.${crypto.randomBytes(8).toString('hex')}.tmp`
    await fs.writeFile(tmpFile, previousContent)
    await fs.rename(tmpFile, versionFile)

    this.logger.debug('Version created', { vaultId, relativePath, timestamp })

    // Prune excess versions
    await this.pruneVersions(vaultId, relativePath, this.maxVersionsPerFile)
  }

  /**
   * Lists all versions of a file, sorted by timestamp descending.
   * Returns an empty array when the version directory does not exist.
   */
  async listVersions(vaultId: string, relativePath: string): Promise<VersionEntry[]> {
    const versionDir = this.getVersionDir(vaultId, relativePath)

    let entries: string[]
    try {
      entries = await fs.readdir(versionDir)
    } catch {
      // Directory doesn't exist — no versions
      return []
    }

    const ext = path.extname(relativePath)
    const versions: VersionEntry[] = []

    for (const entry of entries) {
      // Only consider files matching the expected pattern: <timestamp><ext>
      if (!entry.endsWith(ext)) continue
      const timestamp = entry.slice(0, entry.length - ext.length)
      if (!this.isValidTimestamp(timestamp)) continue

      try {
        const stat = await fs.stat(path.join(versionDir, entry))
        versions.push({ timestamp, sizeBytes: stat.size })
      } catch {
        // Skip files that can't be stat'd
      }
    }

    // Sort descending by timestamp (newest first)
    versions.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    return versions
  }

  /**
   * Reads the content of a specific version.
   * Throws VersionNotFoundError if the version file does not exist.
   */
  async getVersionContent(vaultId: string, relativePath: string, timestamp: string): Promise<Buffer> {
    const versionDir = this.getVersionDir(vaultId, relativePath)
    const ext = path.extname(relativePath)
    const versionFile = path.join(versionDir, `${timestamp}${ext}`)

    try {
      return await fs.readFile(versionFile)
    } catch {
      throw new VersionNotFoundError(relativePath, timestamp)
    }
  }

  /**
   * Restores a version: saves current file content as a new version,
   * then atomically overwrites the file with the selected version's content.
   */
  async restoreVersion(vaultId: string, relativePath: string, timestamp: string): Promise<void> {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (!vaultPath) {
      throw new VersionNotFoundError(relativePath, timestamp)
    }

    const filePath = path.join(vaultPath, relativePath)

    // 1. Save current file content as a new version
    const currentContent = await fs.readFile(filePath)
    await this.createVersion(vaultId, relativePath, currentContent)

    // 2. Read the selected version's content
    const versionContent = await this.getVersionContent(vaultId, relativePath, timestamp)

    // 3. Atomically overwrite the file (temp → rename)
    const tmpFile = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    await fs.writeFile(tmpFile, versionContent)
    await fs.rename(tmpFile, filePath)

    this.logger.info('Version restored', { vaultId, relativePath, timestamp })
  }

  /**
   * Removes oldest versions exceeding `maxVersions`.
   * Returns the number of versions pruned.
   */
  async pruneVersions(vaultId: string, relativePath: string, maxVersions: number): Promise<number> {
    const versions = await this.listVersions(vaultId, relativePath)

    if (versions.length <= maxVersions) return 0

    // Versions are sorted descending — oldest are at the end
    const toDelete = versions.slice(maxVersions)
    const versionDir = this.getVersionDir(vaultId, relativePath)
    const ext = path.extname(relativePath)

    let pruned = 0
    for (const version of toDelete) {
      const filePath = path.join(versionDir, `${version.timestamp}${ext}`)
      try {
        await fs.unlink(filePath)
        pruned++
      } catch {
        this.logger.warn('Failed to prune version file', { vaultId, relativePath, timestamp: version.timestamp })
      }
    }

    if (pruned > 0) {
      this.logger.debug('Versions pruned', { vaultId, relativePath, pruned })
    }

    return pruned
  }

  /**
   * Moves version history when a file is renamed or moved.
   * Renames the `.versions/oldPath/` directory to `.versions/newPath/`.
   */
  async moveVersions(vaultId: string, oldPath: string, newPath: string): Promise<void> {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (!vaultPath) return

    const oldVersionDir = path.join(vaultPath, '.versions', oldPath)
    const newVersionDir = path.join(vaultPath, '.versions', newPath)

    try {
      await fs.access(oldVersionDir)
    } catch {
      // No versions to move
      return
    }

    // Ensure parent directory of the new path exists
    await fs.mkdir(path.dirname(newVersionDir), { recursive: true })
    await fs.rename(oldVersionDir, newVersionDir)

    this.logger.info('Versions moved', { vaultId, oldPath, newPath })
  }

  /**
   * Deletes all versions of a file (when file is permanently deleted).
   * Uses recursive force removal.
   */
  async deleteVersions(vaultId: string, relativePath: string): Promise<void> {
    const versionDir = this.getVersionDir(vaultId, relativePath)

    try {
      await fs.rm(versionDir, { recursive: true, force: true })
      this.logger.debug('Versions deleted', { vaultId, relativePath })
    } catch {
      // Ignore errors (directory may not exist)
    }
  }

  /**
   * Generates a UTC timestamp in format YYYYMMDDTHHmmssSSS.
   */
  private generateTimestamp(): string {
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const hours = String(now.getUTCHours()).padStart(2, '0')
    const minutes = String(now.getUTCMinutes()).padStart(2, '0')
    const seconds = String(now.getUTCSeconds()).padStart(2, '0')
    const ms = String(now.getUTCMilliseconds()).padStart(3, '0')
    return `${year}${month}${day}T${hours}${minutes}${seconds}${ms}`
  }

  /**
   * Validates a timestamp string matches the expected format.
   */
  private isValidTimestamp(value: string): boolean {
    // Format: YYYYMMDDTHHmmssSSS (18 chars, T at position 8)
    if (value.length !== 18) return false
    if (value[8] !== 'T') return false
    const digits = value.slice(0, 8) + value.slice(9)
    return /^\d+$/.test(digits)
  }

  /**
   * Resolves the version directory for a given vault and relative file path.
   */
  private getVersionDir(vaultId: string, relativePath: string): string {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (!vaultPath) {
      throw new VersionNotFoundError(relativePath, 'unknown')
    }
    return path.join(vaultPath, '.versions', relativePath)
  }
}
