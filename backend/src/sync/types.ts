// ─── Data Models ─────────────────────────────────────────────────────────────

/**
 * Sync configuration persisted as JSON per vault.
 */
export interface SyncConfig {
  /** CouchDB Endpoint-URL (http:// or https://). */
  endpoint: string
  /** CouchDB database name. */
  database: string
  /** Encrypted username. */
  usernameEncrypted: string
  /** Encrypted password. */
  passwordEncrypted: string
  /** Sync mode: bidirectional or read-only. */
  mode: 'bidirectional' | 'readonly'
  /** Sync trigger: manual or interval-based. */
  trigger: 'manual' | 'interval'
  /** Interval in minutes (only when trigger === 'interval'). */
  intervalMinutes?: number
  /** Configuration status. */
  status: 'active' | 'disabled'
  /** Whether E2E encryption is enabled. */
  e2eEnabled: boolean
  /** Encrypted E2E passphrase (only when e2eEnabled). */
  e2ePassphraseEncrypted?: string
  /** ISO 8601 timestamp of creation. */
  createdAt: string
  /** ISO 8601 timestamp of last modification. */
  updatedAt: string
}

/**
 * Sync checkpoint persisted as JSON per vault.
 * Tracks the last known sync state for incremental synchronization.
 */
export interface SyncCheckpoint {
  /** CouchDB sequence number (last_seq from Changes Feed). */
  lastSeq: string
  /** ISO 8601 timestamp of the last successful sync. */
  lastSyncAt: string
  /** Map of relative file paths to their last known mtime (ms since epoch). */
  localMtimes: Record<string, number>
}

/**
 * A single sync log entry persisted as JSONL.
 */
export interface SyncLogEntry {
  /** Unique log entry identifier. */
  id: string
  /** ISO 8601 timestamp. */
  timestamp: string
  /** Trigger type. */
  triggerType: 'manual' | 'interval'
  /** Sync mode during this operation. */
  mode: 'bidirectional' | 'readonly'
  /** Operation status. */
  status: 'started' | 'success' | 'partial_success' | 'failed' | 'connection_failed' | 'auth_failed'
  /** Number of pulled documents. */
  pulledCount?: number
  /** Number of pushed documents. */
  pushedCount?: number
  /** Duration in milliseconds. */
  durationMs?: number
  /** Error details (max 100 entries). */
  errors?: SyncErrorDetail[]
}

/**
 * Detail entry for a sync error affecting a specific document.
 */
export interface SyncErrorDetail {
  /** Relative path of the affected document. */
  documentPath: string
  /** Error type. */
  errorType: 'write_failed' | 'read_failed' | 'decryption_failed' | 'encryption_failed' | 'invalid_path' | 'permission_denied'
  /** Error description (max 500 characters). */
  description: string
}

/**
 * A conflict entry for a document modified both locally and remotely.
 */
export interface ConflictEntry {
  /** Relative path of the document in the vault. */
  documentPath: string
  /** Local revision information. */
  local: {
    /** Modification date (ISO 8601). */
    modifiedAt: string
    /** File size in bytes. */
    size: number
  }
  /** Remote revision information. */
  remote: {
    /** CouchDB revision number. */
    revision: string
    /** Modification date (ISO 8601). */
    modifiedAt: string
    /** File size in bytes. */
    size: number
  }
  /** ISO 8601 timestamp of conflict detection. */
  detectedAt: string
}

/**
 * Resolution strategy for a sync conflict.
 */
export type ConflictResolution = 'use_remote' | 'use_local' | 'skip'


/**
 * Analysis result containing summary and details of vault/CouchDB differences.
 */
export interface AnalysisResult {
  /** Summary by category. */
  summary: {
    remote_newer: CategorySummary
    local_newer: CategorySummary
    remote_only: CategorySummary
    local_only: CategorySummary
    remote_deleted: CategorySummary
    conflict: CategorySummary
    identical: CategorySummary
  }
  /** Detail list of all documents. */
  details: AnalysisDetail[]
  /** Duration of the analysis in milliseconds. */
  durationMs: number
}

/**
 * Summary for a single analysis category.
 */
export interface CategorySummary {
  /** Number of documents in this category. */
  count: number
  /** Total size in bytes of documents in this category. */
  totalBytes: number
}

/**
 * Detail entry for a single document in the analysis result.
 */
export interface AnalysisDetail {
  /** Relative path. */
  path: string
  /** Category. */
  category: 'remote_newer' | 'local_newer' | 'remote_only' | 'local_only' | 'remote_deleted' | 'conflict' | 'identical'
  /** Remote revision number (if available). */
  remoteRevision?: string
  /** Local modification date (ISO 8601, if available). */
  localModifiedAt?: string
  /** Remote modification date (ISO 8601, if available). */
  remoteModifiedAt?: string
  /** Local file size in bytes (if available). */
  localSize?: number
  /** Remote file size in bytes (if available). */
  remoteSize?: number
}

// ─── API Input/Output Types ──────────────────────────────────────────────────

/**
 * Input for creating a new sync configuration.
 * Either setupUri + setupUriPassphrase OR manual fields (endpoint, database, username, password).
 */
export interface CreateSyncConfigInput {
  /** Setup-URI (optional, alternative to manual configuration). */
  setupUri?: string
  /** Passphrase to decrypt the Setup-URI. */
  setupUriPassphrase?: string
  /** Manual configuration: CouchDB endpoint URL. */
  endpoint?: string
  /** Manual configuration: CouchDB database name. */
  database?: string
  /** Manual configuration: CouchDB username. */
  username?: string
  /** Manual configuration: CouchDB password. */
  password?: string
  /** Sync mode (default: readonly). */
  mode?: 'bidirectional' | 'readonly'
  /** Sync trigger (default: manual). */
  trigger?: 'manual' | 'interval'
  /** Interval in minutes (only when trigger === 'interval'). */
  intervalMinutes?: number
  /** Whether E2E encryption is enabled. */
  e2eEnabled?: boolean
  /** E2E encryption passphrase (required when e2eEnabled is true). */
  e2ePassphrase?: string
}

/**
 * Input for updating an existing sync configuration.
 * All fields are optional — only provided fields are updated.
 */
export interface UpdateSyncConfigInput {
  /** CouchDB endpoint URL. */
  endpoint?: string
  /** CouchDB database name. */
  database?: string
  /** CouchDB username. */
  username?: string
  /** CouchDB password. */
  password?: string
  /** Sync mode. */
  mode?: 'bidirectional' | 'readonly'
  /** Sync trigger. */
  trigger?: 'manual' | 'interval'
  /** Interval in minutes. */
  intervalMinutes?: number
  /** Whether E2E encryption is enabled. */
  e2eEnabled?: boolean
  /** E2E encryption passphrase. */
  e2ePassphrase?: string
}

/**
 * Sync configuration response returned by the API (credentials masked).
 */
export interface SyncConfigResponse {
  /** CouchDB endpoint URL. */
  endpoint: string
  /** CouchDB database name. */
  database: string
  /** Username (plaintext). */
  username: string
  /** Masked password (all characters replaced with * except last 4). */
  passwordMasked: string
  /** Sync mode. */
  mode: 'bidirectional' | 'readonly'
  /** Sync trigger. */
  trigger: 'manual' | 'interval'
  /** Interval in minutes (only when trigger === 'interval'). */
  intervalMinutes?: number
  /** Configuration status. */
  status: 'active' | 'disabled'
  /** Whether E2E encryption is enabled. */
  e2eEnabled: boolean
  /** ISO 8601 timestamp of creation. */
  createdAt: string
  /** ISO 8601 timestamp of last modification. */
  updatedAt: string
}

/**
 * Result of creating or updating a sync configuration.
 * Includes the configuration response and the connection test result.
 */
export interface SyncConfigResult {
  /** The sync configuration (with masked credentials). */
  config: SyncConfigResponse
  /** Result of the connection test to CouchDB. */
  connectionTest: ConnectionTestResult
}

/**
 * Result of a connection test to a CouchDB instance.
 */
export interface ConnectionTestResult {
  /** Whether the CouchDB instance is reachable. */
  reachable: boolean
  /** Whether authentication was successful. */
  authenticated: boolean
  /** Error description (if connection or auth failed). */
  error?: string
}

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  /** Overall sync status. */
  status: 'success' | 'partial_success' | 'failed' | 'connection_failed' | 'auth_failed'
  /** Number of documents pulled from CouchDB. */
  pulledCount: number
  /** Number of documents pushed to CouchDB. */
  pushedCount: number
  /** Number of conflicts detected during this sync. */
  conflictsDetected: number
  /** Duration in milliseconds. */
  durationMs: number
  /** Error details for individual document failures. */
  errors: SyncErrorDetail[]
}

/**
 * Paginated sync log response.
 */
export interface PaginatedSyncLog {
  /** Log entries for the current page. */
  items: SyncLogEntry[]
  /** Total number of log entries. */
  total: number
  /** Current page number (1-based). */
  page: number
  /** Number of entries per page. */
  pageSize: number
  /** Total number of pages. */
  totalPages: number
}

// ─── Engine Helper Types ─────────────────────────────────────────────────────

/**
 * Connection parameters for CouchDB communication.
 */
export interface SyncConnectionParams {
  /** CouchDB endpoint URL. */
  endpoint: string
  /** CouchDB database name. */
  database: string
  /** CouchDB username (plaintext). */
  username: string
  /** CouchDB password (plaintext). */
  password: string
}

/**
 * Parameters for a pull operation from CouchDB.
 */
export interface PullParams {
  /** Connection parameters. */
  connection: SyncConnectionParams
  /** Vault ID for file path resolution. */
  vaultId: string
  /** Path to the vault directory on the filesystem. */
  vaultPath: string
  /** Last known CouchDB sequence number (null for initial full pull). */
  since: string | null
  /** Current local file mtimes from checkpoint. */
  localMtimes: Record<string, number>
  /** Whether E2E encryption is enabled. */
  e2eEnabled: boolean
  /** E2E passphrase (plaintext, only when e2eEnabled). */
  e2ePassphrase?: string
}

/**
 * Result of a pull operation.
 */
export interface PullResult {
  /** Pull status. */
  status: 'success' | 'partial_success' | 'failed' | 'connection_failed' | 'auth_failed'
  /** New CouchDB sequence number after pull. */
  newLastSeq: string
  /** Number of documents successfully pulled. */
  pulledCount: number
  /** Conflicts detected during pull. */
  conflicts: ConflictEntry[]
  /** Errors encountered during pull. */
  errors: SyncErrorDetail[]
}

/**
 * Parameters for a push operation to CouchDB.
 */
export interface PushParams {
  /** Connection parameters. */
  connection: SyncConnectionParams
  /** Vault ID. */
  vaultId: string
  /** Path to the vault directory on the filesystem. */
  vaultPath: string
  /** Current local file mtimes from checkpoint. */
  localMtimes: Record<string, number>
  /** Whether E2E encryption is enabled. */
  e2eEnabled: boolean
  /** E2E passphrase (plaintext, only when e2eEnabled). */
  e2ePassphrase?: string
}

/**
 * Result of a push operation.
 */
export interface PushResult {
  /** Push status. */
  status: 'success' | 'partial_success' | 'failed' | 'connection_failed' | 'auth_failed'
  /** Number of documents successfully pushed. */
  pushedCount: number
  /** Errors encountered during push. */
  errors: SyncErrorDetail[]
}

/**
 * Parameters for an analysis operation.
 */
export interface AnalyzeParams {
  /** Connection parameters. */
  connection: SyncConnectionParams
  /** Vault ID. */
  vaultId: string
  /** Path to the vault directory on the filesystem. */
  vaultPath: string
  /** Last known CouchDB sequence number (null for full comparison). */
  since: string | null
  /** Current local file mtimes from checkpoint. */
  localMtimes: Record<string, number>
}

/**
 * Parameters extracted from a parsed obsidian-livesync Setup-URI.
 */
export interface SetupUriParams {
  /** CouchDB endpoint URL. */
  endpoint: string
  /** CouchDB database name. */
  database: string
  /** CouchDB username. */
  username: string
  /** CouchDB password. */
  password: string
  /** Whether E2E encryption is enabled. */
  e2eEnabled: boolean
  /** E2E passphrase (if encryption is enabled). */
  e2ePassphrase?: string
}

// ─── Service Interfaces ──────────────────────────────────────────────────────

/**
 * Business logic orchestrator for vault synchronization.
 * Coordinates all sync operations, manages configuration, and handles conflicts.
 */
export interface ISyncService {
  /** Creates a new sync configuration for a vault. */
  createConfig(vaultId: string, ownerId: string, input: CreateSyncConfigInput): Promise<SyncConfigResult>

  /** Returns the sync configuration for a vault (password masked). */
  getConfig(vaultId: string): Promise<SyncConfigResponse | null>

  /** Updates an existing sync configuration. */
  updateConfig(vaultId: string, input: UpdateSyncConfigInput): Promise<SyncConfigResult>

  /** Disables the sync configuration. */
  disableConfig(vaultId: string): Promise<void>

  /** Re-enables a disabled sync configuration. */
  enableConfig(vaultId: string): Promise<void>

  /** Removes the sync configuration completely. */
  removeConfig(vaultId: string): Promise<void>

  /** Triggers a manual synchronization. */
  triggerSync(vaultId: string): Promise<SyncResult>

  /** Starts the analysis mode. */
  analyze(vaultId: string): Promise<AnalysisResult>

  /** Returns the sync log paginated. */
  getLog(vaultId: string, page: number, pageSize: number): Promise<PaginatedSyncLog>

  /** Returns all open conflicts. */
  getConflicts(vaultId: string): Promise<ConflictEntry[]>

  /** Resolves a conflict. */
  resolveConflict(vaultId: string, documentPath: string, resolution: ConflictResolution): Promise<void>

  /**
   * Resets the sync checkpoint for a vault.
   * The next sync will perform a full pull from CouchDB (since=0),
   * re-processing all documents including tombstones for deleted/moved files.
   * Use this to clean up stale files from previous sync bugs.
   */
  resetCheckpoint(vaultId: string): Promise<void>

  /** Initializes sync intervals after server restart. */
  initializeSchedulers(): Promise<void>
}

/**
 * CouchDB communication engine.
 * Handles direct HTTP interaction with the CouchDB instance.
 */
export interface ISyncEngine {
  /** Tests the connection to a CouchDB instance. */
  testConnection(config: SyncConnectionParams): Promise<ConnectionTestResult>

  /** Performs a pull from CouchDB (Changes Feed). */
  pull(params: PullParams): Promise<PullResult>

  /** Performs a push of local changes to CouchDB. */
  push(params: PushParams): Promise<PushResult>

  /** Determines differences between vault and CouchDB (analysis mode). */
  analyze(params: AnalyzeParams): Promise<AnalysisResult>
}

/**
 * Persistence layer for sync configuration.
 * Stores configuration as JSON files on the filesystem.
 */
export interface ISyncConfigStore {
  /** Saves a sync configuration. */
  save(vaultId: string, config: SyncConfig): Promise<void>

  /** Loads a sync configuration. Returns null if not found. */
  load(vaultId: string): Promise<SyncConfig | null>

  /** Removes a sync configuration. */
  remove(vaultId: string): Promise<void>

  /** Loads all active configurations (for scheduler initialization). */
  loadAll(): Promise<Array<{ vaultId: string; config: SyncConfig }>>
}

/**
 * Persistence layer for sync log entries.
 * Stores log entries as JSONL files (append-only) on the filesystem.
 */
export interface ISyncLogStore {
  /** Appends a log entry. Rotates if > 1000 entries. */
  append(vaultId: string, entry: SyncLogEntry): Promise<void>

  /** Reads log entries paginated. */
  read(vaultId: string, page: number, pageSize: number): Promise<PaginatedSyncLog>

  /** Updates the last log entry (for status updates). */
  updateLast(vaultId: string, update: Partial<SyncLogEntry>): Promise<void>
}

/**
 * Persistence layer for sync conflicts.
 * Stores conflicts as a JSON file per vault.
 */
export interface IConflictStore {
  /** Adds a new conflict. */
  add(vaultId: string, conflict: ConflictEntry): Promise<void>

  /** Returns all open conflicts. */
  getAll(vaultId: string): Promise<ConflictEntry[]>

  /** Removes a resolved conflict. */
  remove(vaultId: string, documentPath: string): Promise<void>

  /** Checks whether a conflict exists for a document path. */
  exists(vaultId: string, documentPath: string): Promise<boolean>
}

/**
 * Encryption service for credentials and document content.
 * Uses AES-256-GCM for server-side credential encryption and
 * obsidian-livesync-compatible AES-GCM for E2E document encryption.
 */
export interface ICryptoService {
  /** Encrypts a string with the server secret. */
  encrypt(plaintext: string): string

  /** Decrypts a string with the server secret. */
  decrypt(ciphertext: string): string

  /** Encrypts document content with a passphrase (E2E, obsidian-livesync-compatible). */
  encryptDocument(content: Buffer, passphrase: string): Buffer

  /** Decrypts document content with a passphrase (E2E, obsidian-livesync-compatible). */
  decryptDocument(encrypted: Buffer, passphrase: string): Buffer
}

/**
 * Parser for obsidian-livesync Setup-URIs.
 * Extracts connection parameters from a Base64-encoded, AES-GCM-encrypted JSON string.
 */
export interface ISetupUriParser {
  /** Parses an obsidian-livesync Setup-URI and extracts connection parameters. */
  parse(uri: string, passphrase: string): SetupUriParams
}

/**
 * Scheduler for interval-based sync triggering.
 * Manages setInterval timers per vault.
 */
export interface ISyncScheduler {
  /** Starts an interval timer for a vault. */
  start(vaultId: string, intervalMinutes: number, callback: () => Promise<void>): void

  /** Stops the interval timer for a vault. */
  stop(vaultId: string): void

  /** Resets the timer (after manual sync). */
  reset(vaultId: string): void

  /** Checks whether a timer is active for a vault. */
  isActive(vaultId: string): boolean

  /** Stops all timers (for shutdown). */
  stopAll(): void
}

/**
 * In-memory mutex for preventing concurrent sync operations on the same vault.
 * Safe in single-threaded Node.js (no TOCTOU issues).
 */
export interface ISyncLock {
  /** Attempts to acquire the lock for a vault. Returns false if already locked. */
  acquire(vaultId: string): boolean

  /** Releases the lock for a vault. */
  release(vaultId: string): void

  /** Checks whether a vault is currently locked. */
  isLocked(vaultId: string): boolean
}

/**
 * Persistence layer for sync checkpoints.
 * Stores the last known sync state for incremental synchronization.
 */
export interface ICheckpointStore {
  /** Saves a checkpoint atomically. */
  save(vaultId: string, checkpoint: SyncCheckpoint): Promise<void>

  /** Loads the checkpoint. Returns null if not found or corrupt. */
  load(vaultId: string): Promise<SyncCheckpoint | null>

  /** Removes the checkpoint (when config is removed). */
  remove(vaultId: string): Promise<void>
}
