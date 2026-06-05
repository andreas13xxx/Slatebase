// SyncProtocolStore — Persistent event-based sync protocol stored as JSONL

import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type {
  ISyncProtocolStore,
  SyncProtocolEntry,
  SyncProtocolFilter,
  SyncProtocolLevel,
  PaginatedSyncProtocol,
} from './protocol-types.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of protocol entries before oldest are removed. */
const MAX_ENTRIES = 5000

/** Maximum allowed page size. */
const MAX_PAGE_SIZE = 200

/** Level priority for filtering (higher = more severe). */
const LEVEL_PRIORITY: Record<SyncProtocolLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-based sync protocol store using JSONL format.
 * Stores individual sync events (server-log style) with automatic rotation at 5000 entries.
 * Supports filtering by level, text search, and run ID.
 */
export class SyncProtocolStore implements ISyncProtocolStore {
  private readonly baseDir: string
  private dirCache: Set<string> = new Set()

  /**
   * Creates a new SyncProtocolStore instance.
   * @param dataDir - Base data directory. Protocol stored under `<dataDir>/sync/<vaultId>/protocol.jsonl`.
   * @param logger - Logger instance for error reporting.
   */
  constructor(
    dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.baseDir = path.join(dataDir, 'sync')
  }

  /**
   * Appends one or more protocol entries to the vault's protocol file.
   * Rotates if total entries exceed MAX_ENTRIES.
   */
  async append(vaultId: string, entries: SyncProtocolEntry[]): Promise<void> {
    if (entries.length === 0) return

    const filePath = this.getFilePath(vaultId)
    await this.ensureDirectory(vaultId)

    const newLines = entries.map(e => JSON.stringify(e)).join('\n') + '\n'

    // Read existing to check rotation
    const existing = await this.readAllEntries(vaultId)
    const total = existing.length + entries.length

    if (total > MAX_ENTRIES) {
      // Combine and keep only newest MAX_ENTRIES
      const combined = [...existing, ...entries]
      // Sort chronologically (oldest first for file order)
      combined.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      const kept = combined.slice(combined.length - MAX_ENTRIES)
      await this.writeAllEntries(vaultId, kept)
    } else {
      // Simple append
      try {
        await readFile(filePath, { flag: 'r' })
        // File exists — append
        const { appendFile } = await import('node:fs/promises')
        await appendFile(filePath, newLines, 'utf-8')
      } catch {
        // File doesn't exist — atomic write for new file
        const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
        await writeFile(tempPath, newLines, 'utf-8')
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
   * Reads protocol entries paginated with optional filters.
   * Returns entries sorted descending by timestamp (newest first).
   */
  async read(vaultId: string, page: number, pageSize: number, filter?: SyncProtocolFilter): Promise<PaginatedSyncProtocol> {
    const effectivePageSize = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE)
    const effectivePage = Math.max(1, page)

    let entries = await this.readAllEntries(vaultId)

    // Apply filters
    if (filter) {
      entries = this.applyFilter(entries, filter)
    }

    // Sort descending by timestamp (newest first)
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
   * Removes all protocol entries for a vault.
   */
  async clear(vaultId: string): Promise<void> {
    const filePath = this.getFilePath(vaultId)
    try {
      await unlink(filePath)
    } catch {
      // File doesn't exist — nothing to do
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Applies filter criteria to entries.
   */
  private applyFilter(entries: SyncProtocolEntry[], filter: SyncProtocolFilter): SyncProtocolEntry[] {
    let result = entries

    // Level filter (show entries at this level or higher severity)
    if (filter.level) {
      const minPriority = LEVEL_PRIORITY[filter.level]
      result = result.filter(e => LEVEL_PRIORITY[e.level] >= minPriority)
    }

    // Text search (case-insensitive against message and path)
    if (filter.search) {
      const needle = filter.search.toLowerCase()
      result = result.filter(e =>
        e.message.toLowerCase().includes(needle) ||
        (e.path && e.path.toLowerCase().includes(needle)),
      )
    }

    // Run ID filter
    if (filter.runId) {
      result = result.filter(e => e.runId === filter.runId)
    }

    return result
  }

  /**
   * Reads all protocol entries from the vault's JSONL file.
   * Returns empty array if file doesn't exist or is corrupt.
   */
  private async readAllEntries(vaultId: string): Promise<SyncProtocolEntry[]> {
    const filePath = this.getFilePath(vaultId)

    let content: string
    try {
      content = await readFile(filePath, 'utf-8')
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return []
      }
      this.logger.error('Failed to read sync protocol file', { vaultId, error: String(error) })
      return []
    }

    const lines = content.split('\n')
    const entries: SyncProtocolEntry[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '') continue

      try {
        const parsed = JSON.parse(trimmed) as SyncProtocolEntry
        entries.push(parsed)
      } catch {
        // Skip corrupt lines silently (don't spam logs for protocol corruption)
      }
    }

    return entries
  }

  /**
   * Writes all entries to the vault's protocol file atomically.
   */
  private async writeAllEntries(vaultId: string, entries: SyncProtocolEntry[]): Promise<void> {
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
   * Returns the file path for a vault's sync protocol.
   */
  private getFilePath(vaultId: string): string {
    return path.join(this.baseDir, vaultId, 'protocol.jsonl')
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
