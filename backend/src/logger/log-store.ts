// Server Log Store — Persists structured log entries to JSONL files and provides read access.

import { mkdir, appendFile, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Log levels matching Pino's level names. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * A single structured log entry persisted to disk.
 */
export interface LogEntry {
  /** ISO 8601 timestamp. */
  timestamp: string
  /** Log level. */
  level: LogLevel
  /** Log message. */
  message: string
  /** Optional structured metadata (no sensitive data). */
  meta?: Record<string, unknown>
}

/**
 * Filter criteria for querying server log entries.
 */
export interface LogFilter {
  /** Filter by minimum log level. */
  level?: LogLevel
  /** Filter entries from this date (ISO 8601). */
  startDate?: string
  /** Filter entries until this date (ISO 8601). */
  endDate?: string
  /** Full-text search in message field. */
  search?: string
  /** Page number (1-based). */
  page: number
  /** Number of items per page (max 100). */
  pageSize: number
}

/**
 * Paginated result for log queries.
 */
export interface PaginatedLogResult {
  items: LogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Interface for the server log store.
 * Responsible for persisting and querying structured log entries.
 */
export interface IServerLogStore {
  /** Append a log entry to the daily log file. */
  append(entry: LogEntry): Promise<void>

  /** Query log entries with filtering and pagination. */
  query(filter: LogFilter): Promise<PaginatedLogResult>
}

// ─── Level Priority ──────────────────────────────────────────────────────────

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// ─── Sensitive Data Sanitization ─────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'csrfToken',
  'sessionToken',
  'secret',
  'currentPassword',
  'newPassword',
  'authorization',
])

/**
 * Recursively strips sensitive fields from metadata before writing to disk.
 */
function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeMeta(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-based server log store.
 * Writes one JSONL file per day: `data/logs/YYYY-MM-DD.jsonl`.
 * Append-only — never overwrites or deletes log files.
 */
export class ServerLogStore implements IServerLogStore {
  private readonly logDir: string
  private dirEnsured = false

  /**
   * Creates a new ServerLogStore instance.
   * @param dataDir - Base data directory (e.g., `data/`). Logs are stored under `<dataDir>/logs/`.
   */
  constructor(dataDir: string) {
    this.logDir = path.join(dataDir, 'logs')
  }

  /**
   * Append a single log entry to the daily log file.
   * Sensitive metadata fields are automatically redacted.
   */
  async append(entry: LogEntry): Promise<void> {
    await this.ensureDirectory()

    const sanitizedEntry: LogEntry = {
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
    }

    if (entry.meta !== undefined && Object.keys(entry.meta).length > 0) {
      sanitizedEntry.meta = sanitizeMeta(entry.meta)
    }

    const dateStr = this.extractDate(entry.timestamp)
    const filePath = path.join(this.logDir, `${dateStr}.jsonl`)
    const line = JSON.stringify(sanitizedEntry) + '\n'

    await appendFile(filePath, line, 'utf-8')
  }

  /**
   * Query log entries with filtering and pagination.
   * Scans relevant date-range files, applies filters, and paginates.
   */
  async query(filter: LogFilter): Promise<PaginatedLogResult> {
    await this.ensureDirectory()

    const files = await this.getRelevantFiles(filter.startDate, filter.endDate)
    const allEntries: LogEntry[] = []

    const minLevel = filter.level !== undefined ? LEVEL_PRIORITY[filter.level] : 0
    const searchLower = filter.search?.toLowerCase()

    for (const file of files) {
      const filePath = path.join(this.logDir, file)
      let content: string
      try {
        content = await readFile(filePath, 'utf-8')
      } catch {
        continue
      }

      const lines = content.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === '') continue

        try {
          const entry = JSON.parse(trimmed) as LogEntry

          // Level filter
          const entryLevel = LEVEL_PRIORITY[entry.level]
          if (entryLevel === undefined || entryLevel < minLevel) continue

          // Date range filter
          if (filter.startDate !== undefined && entry.timestamp < filter.startDate) continue
          if (filter.endDate !== undefined && entry.timestamp > filter.endDate) continue

          // Search filter
          if (searchLower !== undefined && !entry.message.toLowerCase().includes(searchLower)) continue

          allEntries.push(entry)
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Sort by timestamp descending (newest first)
    allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    const total = allEntries.length
    const pageSize = Math.min(Math.max(filter.pageSize, 1), 100)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(Math.max(filter.page, 1), totalPages)
    const startIndex = (page - 1) * pageSize
    const items = allEntries.slice(startIndex, startIndex + pageSize)

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    }
  }

  private async ensureDirectory(): Promise<void> {
    if (this.dirEnsured) return
    await mkdir(this.logDir, { recursive: true })
    this.dirEnsured = true
  }

  private extractDate(timestamp: string): string {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(timestamp)
    if (match?.[1]) return match[1]
    return new Date().toISOString().slice(0, 10)
  }

  private async getRelevantFiles(startDate?: string, endDate?: string): Promise<string[]> {
    let files: string[]
    try {
      files = await readdir(this.logDir)
    } catch {
      return []
    }

    const datePattern = /^(\d{4}-\d{2}-\d{2})\.jsonl$/
    const logFiles = files.filter(f => datePattern.test(f)).sort()

    if (!startDate && !endDate) return logFiles

    const start = startDate ? this.extractDate(startDate) : ''
    const end = endDate ? this.extractDate(endDate) : '\uffff'

    return logFiles.filter(f => {
      const match = datePattern.exec(f)
      const fileDate = match?.[1]
      if (!fileDate) return false
      return fileDate >= start && fileDate <= end
    })
  }
}
