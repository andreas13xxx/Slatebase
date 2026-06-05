// ─── Sync Protocol Types ─────────────────────────────────────────────────────
// Event-based sync log with individual entries per operation (server-log style).

/**
 * Log level for a protocol entry.
 */
export type SyncProtocolLevel = 'info' | 'warn' | 'error'

/**
 * Event type for a protocol entry.
 */
export type SyncProtocolEventType =
  | 'sync_start'
  | 'sync_complete'
  | 'connecting'
  | 'connected'
  | 'connection_failed'
  | 'auth_failed'
  | 'pull_start'
  | 'pull_complete'
  | 'push_start'
  | 'push_complete'
  | 'file_pulled'
  | 'file_pushed'
  | 'file_deleted'
  | 'file_push_deleted'
  | 'file_failed'
  | 'conflict'
  | 'checkpoint'
  | 'scheduler_start'
  | 'scheduler_stop'
  | 'config_changed'

/**
 * A single event entry in the sync protocol (server-log style).
 */
export interface SyncProtocolEntry {
  /** ISO 8601 timestamp with milliseconds. */
  timestamp: string
  /** Log level. */
  level: SyncProtocolLevel
  /** Event type (structured, for filtering). */
  event: SyncProtocolEventType
  /** Human-readable message. */
  message: string
  /** Optional: sync run ID to group entries belonging to the same sync operation. */
  runId?: string
  /** Optional: affected file path (for file-level events). */
  path?: string
  /** Optional: file size in bytes. */
  size?: number
  /** Optional: duration in ms (for completion events). */
  durationMs?: number
}

/**
 * Paginated sync protocol response.
 */
export interface PaginatedSyncProtocol {
  /** Protocol entries for the current page (newest first). */
  items: SyncProtocolEntry[]
  /** Total number of entries matching the filter. */
  total: number
  /** Current page number (1-based). */
  page: number
  /** Number of entries per page. */
  pageSize: number
  /** Total number of pages. */
  totalPages: number
}

/**
 * Filter options for reading the sync protocol.
 */
export interface SyncProtocolFilter {
  /** Filter by log level (show only entries of this level or higher). */
  level?: SyncProtocolLevel
  /** Text filter — case-insensitive substring match against message and path. */
  search?: string
  /** Filter by run ID (show only entries from a specific sync run). */
  runId?: string
}

/**
 * Persistence interface for the sync protocol store.
 */
export interface ISyncProtocolStore {
  /** Appends one or more protocol entries. */
  append(vaultId: string, entries: SyncProtocolEntry[]): Promise<void>

  /** Reads protocol entries paginated with optional filters. */
  read(vaultId: string, page: number, pageSize: number, filter?: SyncProtocolFilter): Promise<PaginatedSyncProtocol>

  /** Removes all protocol entries for a vault. */
  clear(vaultId: string): Promise<void>
}
