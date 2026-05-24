import { mkdir, appendFile, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { PaginatedResult } from '../user/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * All auditable actions in the system.
 */
export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'ROLE_CHANGED'
  | 'USER_CREATED'
  | 'USER_DELETED'
  | 'USER_SUSPENDED'
  | 'USER_UNSUSPENDED'
  | 'VAULT_SHARE_CREATED'
  | 'VAULT_SHARE_REVOKED'
  | 'VAULT_SHARE_UPDATED'
  | 'VAULT_OWNERSHIP_TRANSFERRED'
  | 'CONFIG_CHANGED'

/**
 * A single audit log entry.
 */
export interface AuditEntry {
  /** ISO 8601 timestamp of the event. */
  timestamp: string
  /** User who performed the action, or null for unauthenticated events. */
  userId: string | null
  /** The type of action performed. */
  action: AuditAction
  /** The affected resource (userId, vaultId, etc.). */
  target: string
  /** IP address of the request origin. */
  ipAddress: string
  /** Whether the action succeeded. */
  success: boolean
  /** Optional additional details (no sensitive data). */
  details?: string
}

/**
 * Filter criteria for querying audit log entries.
 */
export interface AuditFilter {
  /** Filter by specific action type. */
  action?: AuditAction
  /** Filter entries from this date (ISO 8601). */
  startDate?: string
  /** Filter entries until this date (ISO 8601). */
  endDate?: string
  /** Page number (1-based). */
  page: number
  /** Number of items per page (max 100). */
  pageSize: number
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * High-level audit service for logging and querying audit events.
 */
export interface IAuditService {
  /** Log an audit event (timestamp is added automatically). */
  log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void>

  /** Query audit log entries with filtering and pagination. */
  query(filter: AuditFilter): Promise<PaginatedResult<AuditEntry>>
}

/**
 * Low-level audit logger responsible for filesystem persistence.
 * Writes to append-only JSONL files under `data/audit/`.
 */
export interface IAuditLogger {
  /** Append a single audit entry to the log file. */
  append(entry: AuditEntry): Promise<void>

  /** Read audit entries with filtering and pagination. */
  read(filter: AuditFilter): Promise<PaginatedResult<AuditEntry>>
}

// ─── Sensitive Data Patterns ─────────────────────────────────────────────────

/** Fields that must never appear in audit log entries. */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'csrfToken',
  'sessionToken',
  'secret',
  'currentPassword',
  'newPassword',
])

/**
 * Strips sensitive fields from a details string before writing to the audit log.
 * If the details string contains JSON with sensitive keys, those keys are redacted.
 */
function sanitizeDetails(details: string | undefined): string | undefined {
  if (details === undefined) return undefined

  try {
    const parsed: unknown = JSON.parse(details)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const sanitized: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(key)) {
          sanitized[key] = '[REDACTED]'
        } else {
          sanitized[key] = value
        }
      }
      return JSON.stringify(sanitized)
    }
  } catch {
    // Not JSON — check for obvious sensitive patterns in plain text
  }

  // Redact common sensitive patterns in plain text
  return details
    .replace(/password\s*[:=]\s*\S+/gi, 'password=[REDACTED]')
    .replace(/token\s*[:=]\s*\S+/gi, 'token=[REDACTED]')
}

// ─── AuditService ────────────────────────────────────────────────────────────

/**
 * High-level audit service that adds timestamps and delegates to the underlying AuditLogger.
 * This is a thin wrapper — the heavy lifting (filesystem I/O, filtering, pagination) is done by AuditLogger.
 */
export class AuditService implements IAuditService {
  private readonly auditLogger: IAuditLogger

  /**
   * Creates a new AuditService instance.
   * @param auditLogger - The low-level audit logger responsible for persistence.
   */
  constructor(auditLogger: IAuditLogger) {
    this.auditLogger = auditLogger
  }

  /**
   * Log an audit event. Automatically adds the current timestamp before delegating to the logger.
   * @param entry - The audit entry without a timestamp (timestamp is added automatically).
   */
  async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    }
    await this.auditLogger.append(fullEntry)
  }

  /**
   * Query audit log entries with filtering and pagination.
   * Delegates directly to the underlying AuditLogger.
   * @param filter - Filter criteria including action type, date range, and pagination.
   */
  async query(filter: AuditFilter): Promise<PaginatedResult<AuditEntry>> {
    return this.auditLogger.read(filter)
  }
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-based audit logger that persists entries as JSONL files.
 * One file per day: `data/audit/YYYY-MM-DD.jsonl`.
 * Append-only — never overwrites or deletes audit files.
 */
export class AuditLogger implements IAuditLogger {
  private readonly auditDir: string
  private dirEnsured = false

  /**
   * Creates a new AuditLogger instance.
   * @param dataDir - Base data directory (e.g., `data/`). Audit files are stored under `<dataDir>/audit/`.
   */
  constructor(dataDir: string) {
    this.auditDir = path.join(dataDir, 'audit')
  }

  /**
   * Append a single audit entry to the daily log file.
   * Creates the audit directory if it does not exist.
   * Sensitive data in the details field is automatically redacted.
   */
  async append(entry: AuditEntry): Promise<void> {
    await this.ensureDirectory()

    const sanitizedEntry: AuditEntry = {
      timestamp: entry.timestamp,
      userId: entry.userId,
      action: entry.action,
      target: entry.target,
      ipAddress: entry.ipAddress,
      success: entry.success,
    }

    const sanitizedDetails = sanitizeDetails(entry.details)
    if (sanitizedDetails !== undefined) {
      sanitizedEntry.details = sanitizedDetails
    }

    const dateStr = this.extractDateFromTimestamp(entry.timestamp)
    const filePath = path.join(this.auditDir, `${dateStr}.jsonl`)
    const line = JSON.stringify(sanitizedEntry) + '\n'

    await appendFile(filePath, line, 'utf-8')
  }

  /**
   * Read audit entries with filtering and pagination.
   * Scans relevant date-range files, filters by action type, and applies pagination.
   */
  async read(filter: AuditFilter): Promise<PaginatedResult<AuditEntry>> {
    await this.ensureDirectory()

    const files = await this.getRelevantFiles(filter.startDate, filter.endDate)
    const allEntries: AuditEntry[] = []

    for (const file of files) {
      const filePath = path.join(this.auditDir, file)
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
          const entry = JSON.parse(trimmed) as AuditEntry

          if (!this.matchesFilter(entry, filter)) continue

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

  /**
   * Ensures the audit directory exists, creating it if necessary.
   */
  private async ensureDirectory(): Promise<void> {
    if (this.dirEnsured) return
    await mkdir(this.auditDir, { recursive: true })
    this.dirEnsured = true
  }

  /**
   * Extracts the date portion (YYYY-MM-DD) from an ISO 8601 timestamp.
   */
  private extractDateFromTimestamp(timestamp: string): string {
    // ISO 8601: "2025-01-15T10:30:00.000Z" → "2025-01-15"
    const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(timestamp)
    if (dateMatch?.[1]) {
      return dateMatch[1]
    }
    // Fallback to today's date
    return new Date().toISOString().slice(0, 10)
  }

  /**
   * Gets the list of audit files relevant to the given date range.
   * Files are sorted chronologically.
   */
  private async getRelevantFiles(startDate?: string, endDate?: string): Promise<string[]> {
    let files: string[]
    try {
      files = await readdir(this.auditDir)
    } catch {
      return []
    }

    // Filter to only .jsonl files with valid date names
    const datePattern = /^(\d{4}-\d{2}-\d{2})\.jsonl$/
    const auditFiles = files
      .filter(f => datePattern.test(f))
      .sort()

    if (!startDate && !endDate) {
      return auditFiles
    }

    const start = startDate ? this.extractDateFromTimestamp(startDate) : ''
    const end = endDate ? this.extractDateFromTimestamp(endDate) : '\uffff'

    return auditFiles.filter(f => {
      const match = datePattern.exec(f)
      const fileDate = match?.[1]
      if (!fileDate) return false
      return fileDate >= start && fileDate <= end
    })
  }

  /**
   * Checks whether an entry matches the given filter criteria.
   */
  private matchesFilter(entry: AuditEntry, filter: AuditFilter): boolean {
    if (filter.action !== undefined && entry.action !== filter.action) {
      return false
    }

    if (filter.startDate !== undefined && entry.timestamp < filter.startDate) {
      return false
    }

    if (filter.endDate !== undefined && entry.timestamp > filter.endDate) {
      return false
    }

    return true
  }
}
