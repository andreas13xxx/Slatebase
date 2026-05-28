/**
 * Sync state management for the vault synchronization system.
 * Manages sync configuration, log, conflicts, analysis results, and loading states.
 */

// ─── Data Models (matching backend types) ────────────────────────────────────

/** Sync configuration response returned by the API (credentials masked). */
export interface SyncConfigResponse {
  endpoint: string
  database: string
  username: string
  passwordMasked: string
  mode: 'bidirectional' | 'readonly'
  trigger: 'manual' | 'interval'
  intervalMinutes?: number
  status: 'active' | 'disabled'
  e2eEnabled: boolean
  createdAt: string
  updatedAt: string
}

/** Result of a connection test to a CouchDB instance. */
export interface ConnectionTestResult {
  reachable: boolean
  authenticated: boolean
  error?: string
}

/** Result of creating or updating a sync configuration. */
export interface SyncConfigResult {
  config: SyncConfigResponse
  connectionTest: ConnectionTestResult
}

/** Result of a sync operation. */
export interface SyncResult {
  status: 'success' | 'partial_success' | 'failed' | 'connection_failed' | 'auth_failed'
  pulledCount: number
  pushedCount: number
  conflictsDetected: number
  durationMs: number
  errors: SyncErrorDetail[]
}

/** Detail entry for a sync error affecting a specific document. */
export interface SyncErrorDetail {
  documentPath: string
  errorType: 'write_failed' | 'read_failed' | 'decryption_failed' | 'encryption_failed' | 'invalid_path' | 'permission_denied'
  description: string
}

/** A single sync log entry. */
export interface SyncLogEntry {
  id: string
  timestamp: string
  triggerType: 'manual' | 'interval'
  mode: 'bidirectional' | 'readonly'
  status: 'started' | 'success' | 'partial_success' | 'failed' | 'connection_failed' | 'auth_failed'
  pulledCount?: number
  pushedCount?: number
  durationMs?: number
  errors?: SyncErrorDetail[]
}

/** Paginated sync log response. */
export interface PaginatedSyncLog {
  items: SyncLogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** A conflict entry for a document modified both locally and remotely. */
export interface ConflictEntry {
  documentPath: string
  local: {
    modifiedAt: string
    size: number
  }
  remote: {
    revision: string
    modifiedAt: string
    size: number
  }
  detectedAt: string
}

/** Analysis result containing summary and details of vault/CouchDB differences. */
export interface AnalysisResult {
  summary: {
    remote_newer: CategorySummary
    local_newer: CategorySummary
    remote_only: CategorySummary
    local_only: CategorySummary
    conflict: CategorySummary
    identical: CategorySummary
  }
  details: AnalysisDetail[]
  durationMs: number
}

/** Summary for a single analysis category. */
export interface CategorySummary {
  count: number
  totalBytes: number
}

/** Detail entry for a single document in the analysis result. */
export interface AnalysisDetail {
  path: string
  category: 'remote_newer' | 'local_newer' | 'remote_only' | 'local_only' | 'conflict' | 'identical'
  remoteRevision?: string
  localModifiedAt?: string
  remoteModifiedAt?: string
  localSize?: number
  remoteSize?: number
}

/** Input for creating a new sync configuration. */
export interface CreateSyncConfigInput {
  setupUri?: string
  setupUriPassphrase?: string
  endpoint?: string
  database?: string
  username?: string
  password?: string
  mode?: 'bidirectional' | 'readonly'
  trigger?: 'manual' | 'interval'
  intervalMinutes?: number
  e2eEnabled?: boolean
  e2ePassphrase?: string
}

/** Input for updating an existing sync configuration. */
export interface UpdateSyncConfigInput {
  endpoint?: string
  database?: string
  username?: string
  password?: string
  mode?: 'bidirectional' | 'readonly'
  trigger?: 'manual' | 'interval'
  intervalMinutes?: number
  e2eEnabled?: boolean
  e2ePassphrase?: string
}

// ─── State ───────────────────────────────────────────────────────────────────

/** Global sync state. */
export interface SyncState {
  config: SyncConfigResponse | null
  log: PaginatedSyncLog | null
  conflicts: ConflictEntry[]
  analysisResult: AnalysisResult | null
  syncResult: SyncResult | null
  isLoading: boolean
  isSyncing: boolean
  isAnalyzing: boolean
  error: string | null
}

/** Initial sync state with no configuration loaded. */
export const initialSyncState: SyncState = {
  config: null,
  log: null,
  conflicts: [],
  analysisResult: null,
  syncResult: null,
  isLoading: false,
  isSyncing: false,
  isAnalyzing: false,
  error: null,
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Discriminated union of all sync actions. */
export type SyncAction =
  | { type: 'SYNC_LOADING_STARTED' }
  | { type: 'SYNC_CONFIG_LOADED'; payload: SyncConfigResponse }
  | { type: 'SYNC_CONFIG_CREATED'; payload: SyncConfigResult }
  | { type: 'SYNC_CONFIG_UPDATED'; payload: SyncConfigResult }
  | { type: 'SYNC_CONFIG_REMOVED' }
  | { type: 'SYNC_DISABLED' }
  | { type: 'SYNC_ENABLED' }
  | { type: 'SYNC_TRIGGERED' }
  | { type: 'SYNC_COMPLETED'; payload: SyncResult }
  | { type: 'ANALYSIS_STARTED' }
  | { type: 'ANALYSIS_COMPLETED'; payload: AnalysisResult }
  | { type: 'SYNC_LOG_LOADED'; payload: PaginatedSyncLog }
  | { type: 'CONFLICTS_LOADED'; payload: ConflictEntry[] }
  | { type: 'CONFLICT_RESOLVED'; payload: string }
  | { type: 'SYNC_ERROR_OCCURRED'; payload: string }
  | { type: 'SYNC_CLEARED' }

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Pure reducer handling all sync state transitions.
 */
export function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case 'SYNC_LOADING_STARTED':
      return {
        ...state,
        isLoading: true,
        error: null,
      }

    case 'SYNC_CONFIG_LOADED':
      return {
        ...state,
        config: action.payload,
        isLoading: false,
      }

    case 'SYNC_CONFIG_CREATED':
      return {
        ...state,
        config: action.payload.config,
        isLoading: false,
      }

    case 'SYNC_CONFIG_UPDATED':
      return {
        ...state,
        config: action.payload.config,
        isLoading: false,
      }

    case 'SYNC_CONFIG_REMOVED':
      return {
        ...state,
        config: null,
        log: null,
        conflicts: [],
        analysisResult: null,
        syncResult: null,
        isLoading: false,
      }

    case 'SYNC_DISABLED':
      return {
        ...state,
        config: state.config ? { ...state.config, status: 'disabled' } : null,
        isLoading: false,
      }

    case 'SYNC_ENABLED':
      return {
        ...state,
        config: state.config ? { ...state.config, status: 'active' } : null,
        isLoading: false,
      }

    case 'SYNC_TRIGGERED':
      return {
        ...state,
        isSyncing: true,
        error: null,
      }

    case 'SYNC_COMPLETED':
      return {
        ...state,
        syncResult: action.payload,
        isSyncing: false,
      }

    case 'ANALYSIS_STARTED':
      return {
        ...state,
        isAnalyzing: true,
        error: null,
      }

    case 'ANALYSIS_COMPLETED':
      return {
        ...state,
        analysisResult: action.payload,
        isAnalyzing: false,
      }

    case 'SYNC_LOG_LOADED':
      return {
        ...state,
        log: action.payload,
        isLoading: false,
      }

    case 'CONFLICTS_LOADED':
      return {
        ...state,
        conflicts: action.payload,
        isLoading: false,
      }

    case 'CONFLICT_RESOLVED':
      return {
        ...state,
        conflicts: state.conflicts.filter(c => c.documentPath !== action.payload),
      }

    case 'SYNC_ERROR_OCCURRED':
      return {
        ...state,
        error: action.payload,
        isLoading: false,
        isSyncing: false,
        isAnalyzing: false,
      }

    case 'SYNC_CLEARED':
      return initialSyncState
  }
}
