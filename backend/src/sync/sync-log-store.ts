// SyncLogStore — Persistent sync log stored as JSONL (one entry per line, append-only)

import { mkdir, readFile, writeFile, appendFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { ISyncLogStore, SyncLogEntry, PaginatedSyncLog } from './types.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of log entries before rotation removes oldest entries. */
const MAX_ENTRIES = 1000

/** Maximum allowed page size. */
const MAX_PAGE_SIZE = 100

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-based sync log store using JSONL format (one JSON object per line).
 * Supports append-only writes with automatic rotation at 1000 entries,
 * paginated reads sorted descending by timestamp, and last-entry updates.
 */
export class SyncLogStore implements ISyncLogStore {
  private readonly baseDir: string
  private dirCache: Set<string> = new Set()

  /**
   * Creates a new SyncLogStore instance.
   * @param dataDir - Base data directory (e.g., `data/`). Logs are stored under `<dataDir>/sync/<vaultId>/sync-log.jsonl`.
   * @param logger - Logger instance for error reporting.
   */
  constructor(
    dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.baseDir = path.join(dataDir, 'sync')
  }

  /**
   * Appends a log entry to the vault's sync log file.
   * If the log exceeds 1000 entries after appending, the oldest entries are removed.
   */
  async append(vaultId: string, entry: SyncLogEntry): Promise<void> {
    const filePath = this.getFilePath(vaultId)
    await this.ensureDirectory(vaultId)

    const line = JSON.stringify(entry) + '\n'

    // Read existing entries to check count for rotation
    const entries = await this.readAllEntries(vaultId)
    entries.push(entry)

    if (entries.length > MAX_ENTRIES) {
      // Rotate: keep only the newest MAX_ENTRIES entries (sorted by timestamp descending, keep first MAX_ENTRIES)
      entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      const kept = entries.slice(0, MAX_ENTRIES)
      // Write back in chronological order (oldest first) for JSONL append consistency
      kept.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      await this.writeAllEntries(vaultId, kept)
    } else {
      // Simple append
      try {
        await readFile(filePath, { flag: 'r' })
        await appendFile(filePath, line, 'utf-8')
      } catch {
        // File doesn't exist yet — atomic write for new file
        const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
        await writeFile(tempPath, line, 'utf-8')
        try {
          await rename(tempPath, filePath)
        } catch (renameError) {
          try { await unlink(tempPath) } catch { /* ignore cleanup */ }
          throw renameError
        }
      }
    }
  }

  /**
   * Reads log entries paginated, sorted descending by timestamp.
   * Returns an empty paginated response if the file is corrupt or unreadable.
   */
  async read(vaultId: string, page: number, pageSize: number): Promise<PaginatedSyncLog> {
    const effectivePageSize = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE)
    const effectivePage = Math.max(1, page)

    const entries = await this.readAllEntries(vaultId)

    // Sort descending by timestamp
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    const total = entries.length
    const totalPages = total === 0 ? 0 : Math.ceil(total / effectivePageSize)
    const start = (effectivePage - 1) * effectivePageSize
    const items = entries.slice(start, start + effectivePageSize)

    return {
      items,
      total,
      page: effectivePage,
      pageSize: effectivePageSize,
      totalPages,
    }
  }

  /**
   * Updates the last log entry by merging the provided partial update.
   * If no entries exist or the file is unreadable, the operation is a no-op.
   */
  async updateLast(vaultId: string, update: Partial<SyncLogEntry>): Promise<void> {
    const entries = await this.readAllEntries(vaultId)
    if (entries.length === 0) return

    // Sort by timestamp ascending to find the chronologically last entry
    entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const lastEntry = entries[entries.length - 1]!

    // Merge the update into the last entry
    Object.assign(lastEntry, update)

    // Rewrite the entire file with the updated entries
    await this.writeAllEntries(vaultId, entries)
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Reads all log entries from the vault's JSONL file.
   * Returns an empty array if the file doesn't exist or is corrupt.
   * Skips individual corrupt lines with error logging.
   */
  private async readAllEntries(vaultId: string): Promise<SyncLogEntry[]> {
    const filePath = this.getFilePath(vaultId)

    let content: string
    try {
      content = await readFile(filePath, 'utf-8')
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return []
      }
      // File exists but is unreadable — log error and return empty
      this.logger.error('Failed to read sync log file', { vaultId, error: String(error) })
      return []
    }

    const lines = content.split('\n')
    const entries: SyncLogEntry[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '') continue

      try {
        const parsed = JSON.parse(trimmed) as SyncLogEntry
        entries.push(parsed)
      } catch {
        this.logger.warn('Skipping corrupt line in sync log', {
          vaultId,
          line: trimmed.slice(0, 100),
        })
      }
    }

    return entries
  }

  /**
   * Writes all entries to the vault's JSONL file atomically (temp → rename).
   */
  private async writeAllEntries(vaultId: string, entries: SyncLogEntry[]): Promise<void> {
    const filePath = this.getFilePath(vaultId)
    await this.ensureDirectory(vaultId)

    const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n'
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`

    await writeFile(tempPath, content, 'utf-8')
    try {
      await rename(tempPath, filePath)
    } catch (renameError) {
      try { await unlink(tempPath) } catch { /* ignore cleanup */ }
      throw renameError
    }
  }

  /**
   * Returns the file path for a vault's sync log.
   */
  private getFilePath(vaultId: string): string {
    return path.join(this.baseDir, vaultId, 'sync-log.jsonl')
  }

  /**
   * Ensures the vault's sync directory exists.
   */
  private async ensureDirectory(vaultId: string): Promise<void> {
    if (this.dirCache.has(vaultId)) return
    const dir = path.join(this.baseDir, vaultId)
    await mkdir(dir, { recursive: true })
    this.dirCache.add(vaultId)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
