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
} from './types.js'

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
} from './errors.js'

// Service implementations
export { CryptoService } from './crypto-service.js'
export { SetupUriParser } from './setup-uri-parser.js'
export { SyncLock } from './sync-lock.js'
export { SyncConfigStore } from './sync-config-store.js'
export { SyncLogStore } from './sync-log-store.js'
export { ConflictStore } from './conflict-store.js'
export { CheckpointStore } from './checkpoint-store.js'
export { SyncEngine } from './sync-engine.js'
export { SyncScheduler } from './sync-scheduler.js'
export { SyncService, maskPassword } from './sync-service.js'
export type { VaultPathResolver } from './sync-service.js'
