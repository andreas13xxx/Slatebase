// Sync Module — Barrel Export

// Types and interfaces
export type {
  ISyncService,
  ISyncEngine,
  ISyncConfigStore,
  ISyncLogStore,
  IConflictStore,
  ICheckpointStore,
  ICryptoService,
  ISetupUriParser,
  ISyncScheduler,
  ISyncLock,
  SyncConfig,
  SyncCheckpoint,
  SyncLogEntry,
  SyncErrorDetail,
  ConflictEntry,
  ConflictResolution,
  AnalysisResult,
  CategorySummary,
  AnalysisDetail,
  CreateSyncConfigInput,
  UpdateSyncConfigInput,
  SyncConfigResponse,
  SyncConfigResult,
  ConnectionTestResult,
  SyncResult,
  PaginatedSyncLog,
  SyncConnectionParams,
  PullParams,
  PullResult,
  PushParams,
  PushResult,
  AnalyzeParams,
  SetupUriParams,
  PulledFileDetail,
  PushedFileDetail,
  ConflictCategory,
  CategorizedConflictEntry,
  ConflictResolutionAction,
  AutoResolutionStrategy,
  AutoResolutionConfig,
  AutoResolvedLogDetail,
  BatchResolveResult,
} from './types.js'

// Protocol types
export type {
  ISyncProtocolStore,
  SyncProtocolEntry,
  SyncProtocolLevel,
  SyncProtocolEventType,
  SyncProtocolFilter,
  PaginatedSyncProtocol,
} from './protocol-types.js'

// Error classes
export {
  SyncNotConfiguredError,
  SyncAlreadyConfiguredError,
  SyncInProgressError,
  ConnectionTestFailedError,
  InvalidSetupUriError,
  InvalidSyncIntervalError,
  InvalidPassphraseError,
  ConflictResolutionError,
  ConflictNotFoundError,
  BatchLimitExceededError,
  FileContentUnavailableError,
  SchedulerAlreadyPausedError,
  AutoResolutionConfigError,
} from './errors.js'

// Validation schemas
export { autoResolutionConfigSchema } from './auto-resolution-config-store.js'
export {
  conflictResolutionActionSchema,
  resolveBatchSchema,
  resolveMergeSchema,
  fileContentQuerySchema,
} from './validation.js'
export type {
  ConflictResolutionActionInput,
  ResolveBatchInput,
  ResolveMergeInput,
  FileContentQueryInput,
} from './validation.js'

// Service implementations
export { CryptoService } from './crypto-service.js'
export { SetupUriParser } from './setup-uri-parser.js'
export { SyncLock } from './sync-lock.js'
export { SyncConfigStore } from './sync-config-store.js'
export { SyncLogStore } from './sync-log-store.js'
export { SyncProtocolStore } from './protocol-store.js'
export { SyncProtocolLogger, createProtocolEntry } from './protocol-logger.js'
export { ConflictStore } from './conflict-store.js'
export { CheckpointStore } from './checkpoint-store.js'
export { SyncEngine } from './sync-engine.js'
export { SyncScheduler } from './sync-scheduler.js'
export { SyncService, maskPassword } from './sync-service.js'
export type { VaultPathResolver } from './sync-service.js'
export { AutoResolutionConfigStore } from './auto-resolution-config-store.js'
export type { IAutoResolutionConfigStore } from './auto-resolution-config-store.js'

// Conflict categorization
export { categorizeConflict, categorizeConflicts, applyDefaultCategory } from './conflict-categorizer.js'
export type { LocalFileState, RemoteFileState, CategorizationInput } from './conflict-categorizer.js'

// Conflict resolver
export { ConflictResolver } from './conflict-resolver.js'
export type { IConflictResolver, ResolveParams, ResolveResult, BatchResolveParams } from './conflict-resolver.js'

// Auto-resolution engine
export { AutoResolutionEngine } from './auto-resolution-engine.js'
export type { IAutoResolutionEngine } from './auto-resolution-engine.js'
