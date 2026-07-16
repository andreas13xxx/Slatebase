import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
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
  SyncConfigResponse,
  SyncConfigResult,
  CreateSyncConfigInput,
  UpdateSyncConfigInput,
  SyncResult,
  SyncLogEntry,
  AnalysisResult,
  PaginatedSyncLog,
  ConflictEntry,
  ConflictResolution,
  SyncConnectionParams,
  SyncCheckpoint,
  SyncErrorDetail,
  CategorizedConflictEntry,
  ConflictResolutionAction,
  AutoResolutionConfig,
  BatchResolveResult,
  AutoResolvedLogDetail,
} from './types.js'
import type { ISyncProtocolStore, PaginatedSyncProtocol, SyncProtocolFilter } from './protocol-types.js'
import { SyncProtocolLogger } from './protocol-logger.js'
import {
  SyncAlreadyConfiguredError,
  SyncNotConfiguredError,
  SyncInProgressError,
  ConnectionTestFailedError,
  ConflictResolutionError,
  FileContentUnavailableError,
} from './errors.js'
import { scanVaultFiles } from './sync-engine.js'
import type { ILogger } from '../logger/index.js'
import type { IConflictResolver } from './conflict-resolver.js'
import type { IAutoResolutionEngine } from './auto-resolution-engine.js'
import type { IAutoResolutionConfigStore } from './auto-resolution-config-store.js'
import { applyDefaultCategory } from './conflict-categorizer.js'
import type { IEventBus } from '../realtime/types.js'

/**
 * Function type for resolving a vault ID to its filesystem storage path.
 * Returns null if the vault does not exist.
 */
export type VaultPathResolver = (vaultId: string) => string | null

// ─── Exported Utilities ───────────────────────────────────────────────────────

/**
 * Masks a password: all characters replaced with `*` except the last 4.
 * If the password has fewer than 4 characters, it is fully masked.
 * The masked string always has the same length as the original.
 */
export function maskPassword(password: string): string {
  if (password.length <= 4) {
    return '*'.repeat(password.length)
  }
  const visiblePart = password.slice(-4)
  const maskedPart = '*'.repeat(password.length - 4)
  return maskedPart + visiblePart
}

// ─── SyncService ─────────────────────────────────────────────────────────────

/**
 * Business logic orchestrator for vault synchronization.
 * Coordinates all sync operations, manages configuration, and handles conflicts.
 */
export class SyncService implements ISyncService {
  /**
   * Optional callback invoked after a successful pull that modified files.
   * Used to trigger link-index rebuild without coupling SyncService to LinkIndexService.
   */
  private onPullComplete?: (vaultId: string) => void

  /** Optional EventBus for publishing sync:conflict events via SSE. */
  private eventBus?: IEventBus

  /** Optional function to resolve vault ID to owner user ID. */
  private readonly vaultOwnerResolver: ((vaultId: string) => string | undefined) | undefined

  private readonly conflictResolver: IConflictResolver | undefined
  private readonly autoResolutionEngine: IAutoResolutionEngine | undefined
  private readonly autoResolutionConfigStore: IAutoResolutionConfigStore | undefined

  constructor(
    private readonly configStore: ISyncConfigStore,
    private readonly logStore: ISyncLogStore,
    private readonly conflictStore: IConflictStore,
    private readonly checkpointStore: ICheckpointStore,
    private readonly cryptoService: ICryptoService,
    private readonly setupUriParser: ISetupUriParser,
    private readonly syncEngine: ISyncEngine,
    private readonly scheduler: ISyncScheduler,
    private readonly syncLock: ISyncLock,
    private readonly logger: ILogger,
    private readonly vaultPathResolver: VaultPathResolver,
    private readonly protocolStore?: ISyncProtocolStore,
    options?: {
      conflictResolver?: IConflictResolver
      autoResolutionEngine?: IAutoResolutionEngine
      autoResolutionConfigStore?: IAutoResolutionConfigStore
      vaultOwnerResolver?: (vaultId: string) => string | undefined
    },
  ) {
    this.conflictResolver = options?.conflictResolver
    this.autoResolutionEngine = options?.autoResolutionEngine
    this.autoResolutionConfigStore = options?.autoResolutionConfigStore
    this.vaultOwnerResolver = options?.vaultOwnerResolver
  }

  /**
   * Registers a callback to be invoked after a successful pull that wrote files to disk.
   * Typically used to rebuild the link index after sync.
   */
  setOnPullComplete(callback: (vaultId: string) => void): void {
    this.onPullComplete = callback
  }

  /** Set the optional EventBus for realtime sync:conflict event publishing. */
  setEventBus(eventBus: IEventBus): void {
    this.eventBus = eventBus
  }

  // ─── Configuration Management ────────────────────────────────────────────

  /**
   * Creates a new sync configuration for a vault.
   * Validates input, parses Setup-URI if provided, encrypts credentials,
   * saves config, runs connection test, and starts scheduler if interval configured.
   */
  async createConfig(vaultId: string, _ownerId: string, input: CreateSyncConfigInput): Promise<SyncConfigResult> {
    // Check if config already exists
    const existing = await this.configStore.load(vaultId)
    if (existing) {
      throw new SyncAlreadyConfiguredError()
    }

    // Resolve connection parameters from Setup-URI or manual input
    let endpoint: string
    let database: string
    let username: string
    let password: string
    let e2eEnabled = input.e2eEnabled ?? false
    let e2ePassphrase = input.e2ePassphrase

    if (input.setupUri && input.setupUriPassphrase) {
      const parsed = this.setupUriParser.parse(input.setupUri, input.setupUriPassphrase)
      endpoint = parsed.endpoint
      database = parsed.database
      username = parsed.username
      password = parsed.password
      if (parsed.e2eEnabled) {
        e2eEnabled = true
        e2ePassphrase = parsed.e2ePassphrase
      }
    } else {
      endpoint = input.endpoint ?? ''
      database = input.database ?? ''
      username = input.username ?? ''
      password = input.password ?? ''
    }

    // Encrypt credentials
    const usernameEncrypted = this.cryptoService.encrypt(username)
    const passwordEncrypted = this.cryptoService.encrypt(password)

    const now = new Date().toISOString()
    const mode = input.mode ?? 'readonly'
    const trigger = input.trigger ?? 'manual'
    const intervalMinutes = trigger === 'interval' ? input.intervalMinutes : undefined

    const config: SyncConfig = {
      endpoint,
      database,
      usernameEncrypted,
      passwordEncrypted,
      mode,
      trigger,
      ...(intervalMinutes !== undefined ? { intervalMinutes } : {}),
      status: 'active',
      e2eEnabled,
      ...(e2eEnabled && e2ePassphrase
        ? { e2ePassphraseEncrypted: this.cryptoService.encrypt(e2ePassphrase) }
        : {}),
      createdAt: now,
      updatedAt: now,
    }

    // Save config
    await this.configStore.save(vaultId, config)

    // Run connection test
    const connectionParams: SyncConnectionParams = {
      endpoint,
      database,
      username,
      password,
    }
    const connectionTest = await this.syncEngine.testConnection(connectionParams)

    // Start scheduler if interval configured
    if (trigger === 'interval' && intervalMinutes) {
      this.startScheduler(vaultId, intervalMinutes)
    }

    // Build response
    const configResponse = this.buildConfigResponse(config, username, password)

    return { config: configResponse, connectionTest }
  }

  /**
   * Returns the sync configuration for a vault (password masked).
   * Returns null if no configuration exists.
   */
  async getConfig(vaultId: string): Promise<SyncConfigResponse | null> {
    const config = await this.configStore.load(vaultId)
    if (!config) {
      return null
    }

    const username = this.cryptoService.decrypt(config.usernameEncrypted)
    const password = this.cryptoService.decrypt(config.passwordEncrypted)

    return this.buildConfigResponse(config, username, password)
  }

  /**
   * Updates an existing sync configuration.
   * Checks lock, validates, runs connection test (rejects with 422 on failure),
   * merges updates, re-encrypts credentials if changed, saves atomically.
   */
  async updateConfig(vaultId: string, input: UpdateSyncConfigInput): Promise<SyncConfigResult> {
    // Check if sync is in progress
    if (this.syncLock.isLocked(vaultId)) {
      throw new SyncInProgressError()
    }

    // Load existing config
    const existing = await this.configStore.load(vaultId)
    if (!existing) {
      throw new SyncNotConfiguredError()
    }

    // Decrypt existing credentials
    const existingUsername = this.cryptoService.decrypt(existing.usernameEncrypted)
    const existingPassword = this.cryptoService.decrypt(existing.passwordEncrypted)

    // Determine updated values
    const username = input.username ?? existingUsername
    const password = input.password ?? existingPassword
    const endpoint = input.endpoint ?? existing.endpoint
    const database = input.database ?? existing.database

    // Run connection test — reject with 422 on failure
    const connectionParams: SyncConnectionParams = {
      endpoint,
      database,
      username,
      password,
    }
    const connectionTest = await this.syncEngine.testConnection(connectionParams)
    if (!connectionTest.reachable || !connectionTest.authenticated) {
      throw new ConnectionTestFailedError(connectionTest.error ?? 'Connection test failed')
    }

    // Merge updates
    const mode = input.mode ?? existing.mode
    const trigger = input.trigger ?? existing.trigger
    const intervalMinutes = input.intervalMinutes ?? existing.intervalMinutes
    const e2eEnabled = input.e2eEnabled ?? existing.e2eEnabled
    const e2ePassphrase = input.e2ePassphrase

    const now = new Date().toISOString()

    const updatedConfig: SyncConfig = {
      endpoint,
      database,
      usernameEncrypted: (input.username !== undefined)
        ? this.cryptoService.encrypt(username)
        : existing.usernameEncrypted,
      passwordEncrypted: (input.password !== undefined)
        ? this.cryptoService.encrypt(password)
        : existing.passwordEncrypted,
      mode,
      trigger,
      ...(trigger === 'interval' && intervalMinutes !== undefined ? { intervalMinutes } : {}),
      status: existing.status,
      e2eEnabled,
      ...(e2eEnabled && e2ePassphrase
        ? { e2ePassphraseEncrypted: this.cryptoService.encrypt(e2ePassphrase) }
        : e2eEnabled && existing.e2ePassphraseEncrypted
          ? { e2ePassphraseEncrypted: existing.e2ePassphraseEncrypted }
          : {}),
      createdAt: existing.createdAt,
      updatedAt: now,
    }

    // Save atomically
    await this.configStore.save(vaultId, updatedConfig)

    // Restart scheduler if interval changed
    const intervalChanged = trigger !== existing.trigger ||
      intervalMinutes !== existing.intervalMinutes
    if (intervalChanged) {
      this.scheduler.stop(vaultId)
      if (trigger === 'interval' && intervalMinutes) {
        this.startScheduler(vaultId, intervalMinutes)
      }
    }

    // Build response
    const configResponse = this.buildConfigResponse(updatedConfig, username, password)

    return { config: configResponse, connectionTest }
  }

  /**
   * Disables the sync configuration.
   * Sets status to 'disabled', lets running sync finish, stops scheduler.
   */
  async disableConfig(vaultId: string): Promise<void> {
    const config = await this.configStore.load(vaultId)
    if (!config) {
      throw new SyncNotConfiguredError()
    }

    const updatedConfig: SyncConfig = {
      ...config,
      status: 'disabled',
      updatedAt: new Date().toISOString(),
    }

    await this.configStore.save(vaultId, updatedConfig)
    this.scheduler.stop(vaultId)
  }

  /**
   * Re-enables a disabled sync configuration.
   * Sets status to 'active', restarts scheduler if interval configured.
   */
  async enableConfig(vaultId: string): Promise<void> {
    const config = await this.configStore.load(vaultId)
    if (!config) {
      throw new SyncNotConfiguredError()
    }

    const updatedConfig: SyncConfig = {
      ...config,
      status: 'active',
      updatedAt: new Date().toISOString(),
    }

    await this.configStore.save(vaultId, updatedConfig)

    // Restart scheduler if interval configured
    if (updatedConfig.trigger === 'interval' && updatedConfig.intervalMinutes) {
      this.startScheduler(vaultId, updatedConfig.intervalMinutes)
    }
  }

  /**
   * Removes the sync configuration completely.
   * Deletes config + checkpoint + credentials, stops scheduler, keeps sync log.
   */
  async removeConfig(vaultId: string): Promise<void> {
    const config = await this.configStore.load(vaultId)
    if (!config) {
      throw new SyncNotConfiguredError()
    }

    // Stop scheduler
    this.scheduler.stop(vaultId)

    // Remove config and checkpoint (keep sync log)
    await this.configStore.remove(vaultId)
    await this.checkpointStore.remove(vaultId)
  }

  // ─── Sync Execution ───────────────────────────────────────────────────────

  /**
   * Triggers a manual synchronization.
   * Acquires lock, loads config, creates log entry, executes pull (and push if bidirectional),
   * handles conflicts, updates checkpoint on success/partial_success, updates log, releases lock.
   */
  async triggerSync(vaultId: string): Promise<SyncResult> {
    const startTime = Date.now()

    // Acquire lock
    if (!this.syncLock.acquire(vaultId)) {
      throw new SyncInProgressError()
    }

    // Create protocol logger for this run
    const protocol = this.protocolStore ? new SyncProtocolLogger(this.protocolStore, vaultId) : undefined

    try {
      // Load config
      const config = await this.configStore.load(vaultId)
      if (!config || config.status === 'disabled') {
        throw new SyncNotConfiguredError()
      }

      // Resolve vault path
      const vaultPath = this.vaultPathResolver(vaultId)
      if (!vaultPath) {
        throw new SyncNotConfiguredError()
      }

      // Protocol: sync start
      protocol?.syncStart('manual', config.mode)

      // Decrypt credentials
      const username = this.cryptoService.decrypt(config.usernameEncrypted)
      const password = this.cryptoService.decrypt(config.passwordEncrypted)
      const e2ePassphrase = config.e2eEnabled && config.e2ePassphraseEncrypted
        ? this.cryptoService.decrypt(config.e2ePassphraseEncrypted)
        : undefined

      const connection: SyncConnectionParams = {
        endpoint: config.endpoint,
        database: config.database,
        username,
        password,
      }

      // Load checkpoint
      const checkpoint = await this.checkpointStore.load(vaultId)
      const since = checkpoint?.lastSeq ?? null
      const localMtimes = checkpoint?.localMtimes ?? {}

      // Create log entry (started)
      const logEntryId = crypto.randomUUID()
      const logEntry: SyncLogEntry = {
        id: logEntryId,
        timestamp: new Date().toISOString(),
        triggerType: 'manual',
        mode: config.mode,
        status: 'started',
      }
      await this.logStore.append(vaultId, logEntry)

      // Protocol: connecting
      protocol?.connecting(config.endpoint, config.database)

      // Execute pull
      const pullResult = await this.syncEngine.pull({
        connection,
        vaultId,
        vaultPath,
        since,
        localMtimes,
        e2eEnabled: config.e2eEnabled,
        ...(e2ePassphrase !== undefined ? { e2ePassphrase } : {}),
      })

      // Handle connection/auth failures
      if (pullResult.status === 'connection_failed' || pullResult.status === 'auth_failed') {
        const durationMs = Date.now() - startTime

        // Protocol: connection/auth failure
        if (pullResult.status === 'connection_failed') {
          protocol?.connectionFailed(pullResult.errors[0]?.description ?? 'Unbekannter Fehler')
        } else {
          protocol?.authFailed()
        }
        protocol?.syncComplete(durationMs, 0, 0, 0, pullResult.errors.length)

        const result: SyncResult = {
          status: pullResult.status,
          pulledCount: 0,
          pushedCount: 0,
          conflictsDetected: 0,
          durationMs,
          errors: pullResult.errors,
        }

        await this.logStore.updateLast(vaultId, {
          status: pullResult.status,
          pulledCount: 0,
          pushedCount: 0,
          durationMs,
          ...(pullResult.errors.length > 0 ? { errors: pullResult.errors } : {}),
        })

        // Flush protocol before returning
        await protocol?.flush()
        return result
      }

      // Protocol: connected + pull start
      protocol?.connected(since)
      protocol?.pullStart(pullResult.changeCount ?? 0, since)

      // Protocol: log individual pulled files
      if (pullResult.pulledFiles) {
        for (const file of pullResult.pulledFiles) {
          protocol?.filePulled(file.path, file.size, file.isBinary, file.chunkCount)
        }
      }
      // Protocol: log deleted files
      if (pullResult.deletedFiles) {
        for (const filePath of pullResult.deletedFiles) {
          protocol?.fileDeleted(filePath)
        }
      }
      // Protocol: log conflicts
      for (const conflict of pullResult.conflicts) {
        protocol?.conflict(conflict.documentPath)
      }
      // Protocol: log file errors
      for (const error of pullResult.errors) {
        protocol?.fileFailed(error.documentPath, error.errorType, error.description)
      }

      protocol?.pullComplete(pullResult.pulledCount, pullResult.conflicts.length, pullResult.errors.length)

      // Store conflicts from pull (only for documents without existing conflicts)
      let conflictsDetected = 0
      const newConflicts: ConflictEntry[] = []
      for (const conflict of pullResult.conflicts) {
        const alreadyExists = await this.conflictStore.exists(vaultId, conflict.documentPath)
        if (!alreadyExists) {
          await this.conflictStore.add(vaultId, conflict)
          conflictsDetected++
          newConflicts.push(conflict)
        }
      }

      // Publish sync:conflict SSE events for newly detected conflicts
      if (newConflicts.length > 0 && this.eventBus) {
        const ownerId = this.vaultOwnerResolver?.(vaultId)
        if (ownerId) {
          for (const conflict of newConflicts) {
            const categorized = conflict as Partial<CategorizedConflictEntry>
            this.eventBus.publish({
              type: 'sync:conflict',
              payload: {
                vaultId,
                path: conflict.documentPath,
                category: categorized.category ?? 'content_conflict',
              },
              target: { kind: 'user', userId: ownerId },
            })
          }
        }
      }

      // Evaluate auto-resolution for newly detected conflicts
      if (newConflicts.length > 0) {
        await this.evaluateAutoResolution(
          vaultId, newConflicts, vaultPath, connection, config.e2eEnabled, e2ePassphrase,
        )
      }

      // Execute push if bidirectional
      let pushedCount = 0
      const pushErrors: SyncErrorDetail[] = []

      if (config.mode === 'bidirectional') {
        // Update localMtimes with fresh mtimes ONLY for files that were written by the pull.
        // This prevents re-pushing pulled files (they have new mtimes from utimes/write),
        // while still detecting genuinely new local files (not in checkpoint = not in localMtimes).
        const pushMtimes: Record<string, number> = { ...localMtimes }
        if (pullResult.pulledFiles && pullResult.pulledFiles.length > 0) {
          try {
            const freshScan = await scanVaultFiles(vaultPath)
            for (const pulled of pullResult.pulledFiles) {
              const freshMtime = freshScan.get(pulled.path)
              if (freshMtime !== undefined) {
                pushMtimes[pulled.path] = freshMtime
              }
            }
          } catch {
            this.logger.warn('Failed to scan vault files for push mtime update', { vaultId })
          }
        }

        const pushResult = await this.syncEngine.push({
          connection,
          vaultId,
          vaultPath,
          localMtimes: pushMtimes,
          e2eEnabled: config.e2eEnabled,
          ...(e2ePassphrase !== undefined ? { e2ePassphrase } : {}),
        })

        pushedCount = pushResult.pushedCount
        pushErrors.push(...pushResult.errors)

        // Protocol: push events
        protocol?.pushStart(pushResult.changedFileCount ?? 0, pushResult.deletedFileCount ?? 0)
        if (pushResult.pushedFiles) {
          for (const file of pushResult.pushedFiles) {
            protocol?.filePushed(file.path, file.size)
          }
        }
        if (pushResult.deletedFiles) {
          for (const filePath of pushResult.deletedFiles) {
            protocol?.filePushDeleted(filePath)
          }
        }
        for (const error of pushResult.errors) {
          protocol?.fileFailed(error.documentPath, error.errorType, error.description)
        }
        protocol?.pushComplete(pushedCount, pushResult.errors.length)
      }

      // Combine errors
      const allErrors = [...pullResult.errors, ...pushErrors].slice(0, 100)

      // Determine overall status
      let status: SyncResult['status']
      if (allErrors.length === 0) {
        status = 'success'
      } else if (pullResult.pulledCount > 0 || pushedCount > 0) {
        status = 'partial_success'
      } else {
        status = 'failed'
      }

      const durationMs = Date.now() - startTime

      // Update checkpoint on success/partial_success (NOT on failed)
      if (status === 'success' || status === 'partial_success') {
        // Scan current vault file mtimes AFTER pull+push to capture the actual state.
        // This ensures the next sync correctly detects only truly new local changes,
        // not files that were just written by the pull.
        let currentMtimes: Record<string, number> = { ...localMtimes }
        try {
          const scanned = await scanVaultFiles(vaultPath)
          currentMtimes = Object.fromEntries(scanned)
        } catch {
          // If scan fails, fall back to old mtimes — next sync may re-push some files
          this.logger.warn('Failed to scan vault files for checkpoint update', { vaultId })
        }

        const newCheckpoint: SyncCheckpoint = {
          lastSeq: pullResult.newLastSeq,
          lastSyncAt: new Date().toISOString(),
          localMtimes: currentMtimes,
        }
        await this.checkpointStore.save(vaultId, newCheckpoint)

        // Protocol: checkpoint
        protocol?.checkpoint(pullResult.newLastSeq)
      }

      // Update log entry
      await this.logStore.updateLast(vaultId, {
        status,
        pulledCount: pullResult.pulledCount,
        pushedCount,
        durationMs,
        ...(allErrors.length > 0 ? { errors: allErrors } : {}),
      })

      const result: SyncResult = {
        status,
        pulledCount: pullResult.pulledCount,
        pushedCount,
        conflictsDetected,
        durationMs,
        errors: allErrors,
      }

      // Protocol: sync complete
      protocol?.syncComplete(durationMs, pullResult.pulledCount, pushedCount, conflictsDetected, allErrors.length)

      // Flush protocol
      await protocol?.flush()

      // Reset scheduler timer (so next interval starts fresh after manual sync)
      this.scheduler.reset(vaultId)

      // Trigger link index rebuild if files were pulled
      if (pullResult.pulledCount > 0 && this.onPullComplete) {
        try {
          this.onPullComplete(vaultId)
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          this.logger.error('onPullComplete hook failed', { vaultId, error: message })
        }
      }

      return result
    } finally {
      this.syncLock.release(vaultId)
    }
  }

  /**
   * Starts the analysis mode.
   * Acquires lock, loads config, calls engine.analyze(), releases lock.
   */
  async analyze(vaultId: string): Promise<AnalysisResult> {
    // Acquire lock
    if (!this.syncLock.acquire(vaultId)) {
      throw new SyncInProgressError()
    }

    try {
      // Load config
      const config = await this.configStore.load(vaultId)
      if (!config || config.status === 'disabled') {
        throw new SyncNotConfiguredError()
      }

      // Resolve vault path
      const vaultPath = this.vaultPathResolver(vaultId)
      if (!vaultPath) {
        throw new SyncNotConfiguredError()
      }

      // Decrypt credentials
      const username = this.cryptoService.decrypt(config.usernameEncrypted)
      const password = this.cryptoService.decrypt(config.passwordEncrypted)

      const connection: SyncConnectionParams = {
        endpoint: config.endpoint,
        database: config.database,
        username,
        password,
      }

      // Load checkpoint for localMtimes (used for conflict detection)
      const checkpoint = await this.checkpointStore.load(vaultId)
      const localMtimes = checkpoint?.localMtimes ?? {}

      // Analysis always uses since=null (fetches ALL documents from CouchDB)
      // to build the complete remote state for comparison.
      // Using the checkpoint's lastSeq would only show changes SINCE the last sync,
      // which after a successful sync is empty → everything appears "local_only".
      return await this.syncEngine.analyze({
        connection,
        vaultId,
        vaultPath,
        since: null,
        localMtimes,
      })
    } finally {
      this.syncLock.release(vaultId)
    }
  }

  /**
   * Returns the sync log paginated.
   * Delegates to SyncLogStore.
   */
  async getLog(vaultId: string, page: number, pageSize: number): Promise<PaginatedSyncLog> {
    return this.logStore.read(vaultId, page, pageSize)
  }

  /**
   * Returns the sync protocol (event log) paginated with optional filters.
   * Returns empty result if no protocol store is configured.
   */
  async getProtocol(vaultId: string, page: number, pageSize: number, filter?: SyncProtocolFilter): Promise<PaginatedSyncProtocol> {
    if (!this.protocolStore) {
      return { items: [], total: 0, page: 1, pageSize, totalPages: 0 }
    }
    return this.protocolStore.read(vaultId, page, pageSize, filter)
  }

  /**
   * Resets the sync checkpoint for a vault.
   * Removes the stored checkpoint so the next sync performs a full pull (since=0),
   * re-processing all documents including tombstones for deleted/moved files.
   * Requires that no sync is currently in progress.
   */
  async resetCheckpoint(vaultId: string): Promise<void> {
    // Verify config exists
    const config = await this.configStore.load(vaultId)
    if (!config) {
      throw new SyncNotConfiguredError()
    }

    // Ensure no sync is running
    if (!this.syncLock.acquire(vaultId)) {
      throw new SyncInProgressError()
    }

    try {
      await this.checkpointStore.remove(vaultId)
      this.logger.info('Sync checkpoint reset — next sync will be a full pull', { vaultId })
    } finally {
      this.syncLock.release(vaultId)
    }
  }

  /**
   * Initializes sync intervals after server restart.
   * Loads all active configs with interval triggers and starts schedulers.
   */
  async initializeSchedulers(): Promise<void> {
    const allConfigs = await this.configStore.loadAll()

    for (const { vaultId, config } of allConfigs) {
      if (config.trigger === 'interval' && config.status === 'active' && config.intervalMinutes) {
        this.startScheduler(vaultId, config.intervalMinutes)
        this.logger.info('Scheduler initialized for vault', { vaultId, intervalMinutes: config.intervalMinutes })
      }
    }
  }

  // ─── Conflict Management ────────────────────────────────────────────────

  /**
   * Returns all open conflicts for a vault.
   * Delegates to ConflictStore.getAll().
   */
  async getConflicts(vaultId: string): Promise<ConflictEntry[]> {
    return this.conflictStore.getAll(vaultId)
  }

  /**
   * Resolves a conflict for a specific document.
   * Acquires lock, validates config and resolution strategy, executes resolution,
   * removes conflict from store on success, releases lock in finally block.
   */
  async resolveConflict(vaultId: string, documentPath: string, resolution: ConflictResolution): Promise<void> {
    // Acquire lock
    if (!this.syncLock.acquire(vaultId)) {
      throw new SyncInProgressError()
    }

    try {
      // Load config
      const config = await this.configStore.load(vaultId)
      if (!config) {
        throw new SyncNotConfiguredError()
      }

      // Reject use_local in readonly mode
      if (resolution === 'use_local' && config.mode === 'readonly') {
        throw new ConflictResolutionError('Cannot push local version in readonly mode')
      }

      // Execute resolution
      if (resolution === 'use_remote' || resolution === 'use_local') {
        // MVP implementation: remove the conflict entry and let the next sync handle
        // the actual data transfer. The conflict won't block the document anymore.
        // For use_remote: next pull will overwrite the local file since no conflict entry exists.
        // For use_local: next push will send the local file since no conflict entry exists.
      }
      // 'skip' is a no-op — just remove from conflict store

      // Remove conflict from store on success
      await this.conflictStore.remove(vaultId, documentPath)
    } catch (error: unknown) {
      // Re-throw known errors
      if (error instanceof SyncInProgressError ||
          error instanceof SyncNotConfiguredError ||
          error instanceof ConflictResolutionError) {
        throw error
      }
      // Wrap unexpected errors in ConflictResolutionError
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Conflict resolution failed', { vaultId, documentPath, resolution, error: message })
      throw new ConflictResolutionError(`Conflict resolution failed: ${message}`)
    } finally {
      this.syncLock.release(vaultId)
    }
  }

  // ─── Conflict Resolution (Extended) ─────────────────────────────────────────

  /**
   * Returns categorized conflicts with enriched metadata.
   * Loads conflicts from the store and assigns a default category (content_conflict)
   * to legacy entries that lack one.
   */
  async getCategorizedConflicts(vaultId: string): Promise<CategorizedConflictEntry[]> {
    const conflicts = await this.conflictStore.getAll(vaultId)
    const categorized: CategorizedConflictEntry[] = []

    for (const conflict of conflicts) {
      // Check if the conflict already has a category (newer entries from categorizer)
      const existing = conflict as Partial<CategorizedConflictEntry>
      if (existing.category) {
        categorized.push(existing as CategorizedConflictEntry)
      } else {
        // Legacy entries without category — apply default
        categorized.push(applyDefaultCategory(conflict))
      }
    }

    return categorized
  }

  /**
   * Resolves a conflict with full content (manual merge).
   * Delegates to ConflictResolver with a `manual_merge` resolution action.
   * @throws ConflictResolutionError if resolution fails or conflictResolver is not configured.
   */
  async resolveConflictWithContent(vaultId: string, documentPath: string, content: string): Promise<void> {
    if (!this.conflictResolver) {
      throw new ConflictResolutionError('Conflict resolver not configured')
    }

    const config = await this.configStore.load(vaultId)
    if (!config) {
      throw new SyncNotConfiguredError()
    }

    const vaultPath = this.vaultPathResolver(vaultId)
    if (!vaultPath) {
      throw new SyncNotConfiguredError()
    }

    const username = this.cryptoService.decrypt(config.usernameEncrypted)
    const password = this.cryptoService.decrypt(config.passwordEncrypted)
    const e2ePassphrase = config.e2eEnabled && config.e2ePassphraseEncrypted
      ? this.cryptoService.decrypt(config.e2ePassphraseEncrypted)
      : undefined

    const connection: SyncConnectionParams = {
      endpoint: config.endpoint,
      database: config.database,
      username,
      password,
    }

    const result = await this.conflictResolver.resolve({
      vaultId,
      vaultPath,
      documentPath,
      resolution: { type: 'manual_merge', content },
      connection,
      e2eEnabled: config.e2eEnabled,
      e2ePassphrase,
    })

    if (!result.success) {
      throw new ConflictResolutionError(result.error ?? 'Manual merge resolution failed')
    }
  }

  /**
   * Resolves multiple conflicts in batch.
   * Delegates to ConflictResolver.resolveBatch() with per-item error isolation.
   * @throws ConflictResolutionError if conflictResolver is not configured.
   */
  async resolveConflictBatch(
    vaultId: string,
    resolutions: Array<{ documentPath: string; resolution: ConflictResolutionAction }>,
  ): Promise<BatchResolveResult> {
    if (!this.conflictResolver) {
      throw new ConflictResolutionError('Conflict resolver not configured')
    }

    const config = await this.configStore.load(vaultId)
    if (!config) {
      throw new SyncNotConfiguredError()
    }

    const vaultPath = this.vaultPathResolver(vaultId)
    if (!vaultPath) {
      throw new SyncNotConfiguredError()
    }

    const username = this.cryptoService.decrypt(config.usernameEncrypted)
    const password = this.cryptoService.decrypt(config.passwordEncrypted)
    const e2ePassphrase = config.e2eEnabled && config.e2ePassphraseEncrypted
      ? this.cryptoService.decrypt(config.e2ePassphraseEncrypted)
      : undefined

    const connection: SyncConnectionParams = {
      endpoint: config.endpoint,
      database: config.database,
      username,
      password,
    }

    return this.conflictResolver.resolveBatch({
      vaultId,
      vaultPath,
      conflicts: resolutions,
      connection,
      e2eEnabled: config.e2eEnabled,
      e2ePassphrase,
    })
  }

  /**
   * Gets file content for diff view (local or remote).
   * - local: reads from the vault filesystem
   * - remote: fetches from CouchDB and decodes content
   * @throws FileContentUnavailableError if content cannot be retrieved.
   */
  async getFileContent(vaultId: string, documentPath: string, source: 'local' | 'remote'): Promise<string | null> {
    const vaultPath = this.vaultPathResolver(vaultId)
    if (!vaultPath) {
      throw new FileContentUnavailableError('Vault path not found')
    }

    if (source === 'local') {
      return this.readLocalFileContent(vaultPath, documentPath)
    }

    return this.fetchRemoteFileContent(vaultId, documentPath)
  }

  /**
   * Gets the auto-resolution configuration for a vault.
   * Returns default config if the store is not configured.
   */
  async getAutoResolutionConfig(vaultId: string): Promise<AutoResolutionConfig> {
    if (!this.autoResolutionConfigStore) {
      return { enabled: false, strategies: {} }
    }
    return this.autoResolutionConfigStore.load(vaultId)
  }

  /**
   * Sets the auto-resolution configuration for a vault.
   * @throws ConflictResolutionError if the config store is not configured.
   */
  async setAutoResolutionConfig(vaultId: string, config: AutoResolutionConfig): Promise<void> {
    if (!this.autoResolutionConfigStore) {
      throw new ConflictResolutionError('Auto-resolution config store not configured')
    }
    await this.autoResolutionConfigStore.save(vaultId, config)
  }

  /**
   * Pauses the sync scheduler for a vault (e.g. when the Conflict Wizard is open).
   * While paused, scheduled sync callbacks are skipped.
   */
  pauseScheduler(vaultId: string): void {
    this.scheduler.pause(vaultId)
  }

  /**
   * Resumes the sync scheduler for a vault (e.g. when the Conflict Wizard is closed).
   */
  resumeScheduler(vaultId: string): void {
    this.scheduler.resume(vaultId)
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Masks a password using the module-level maskPassword utility.
   */
  private maskPassword(password: string): string {
    return maskPassword(password)
  }

  /**
   * Builds a SyncConfigResponse from a stored config and decrypted credentials.
   */
  private buildConfigResponse(config: SyncConfig, username: string, password: string): SyncConfigResponse {
    const response: SyncConfigResponse = {
      endpoint: config.endpoint,
      database: config.database,
      username,
      passwordMasked: this.maskPassword(password),
      mode: config.mode,
      trigger: config.trigger,
      status: config.status,
      e2eEnabled: config.e2eEnabled,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }

    if (config.trigger === 'interval' && config.intervalMinutes !== undefined) {
      response.intervalMinutes = config.intervalMinutes
    }

    return response
  }

  /**
   * Reads local file content as UTF-8 string.
   * Returns null if the file does not exist.
   * @throws FileContentUnavailableError on read errors other than ENOENT.
   */
  private async readLocalFileContent(vaultPath: string, documentPath: string): Promise<string | null> {
    const filePath = join(vaultPath, documentPath)
    try {
      const content = await readFile(filePath, 'utf-8')
      return content
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      const message = error instanceof Error ? error.message : 'Unknown read error'
      throw new FileContentUnavailableError(`Failed to read local file: ${message}`)
    }
  }

  /**
   * Fetches file content from CouchDB for the remote version.
   * Loads config, fetches the document, and decodes text content.
   * Returns null if the document does not exist remotely.
   * @throws FileContentUnavailableError on fetch errors.
   */
  private async fetchRemoteFileContent(vaultId: string, documentPath: string): Promise<string | null> {
    const config = await this.configStore.load(vaultId)
    if (!config) {
      throw new FileContentUnavailableError('Sync not configured')
    }

    const username = this.cryptoService.decrypt(config.usernameEncrypted)
    const password = this.cryptoService.decrypt(config.passwordEncrypted)
    const e2ePassphrase = config.e2eEnabled && config.e2ePassphraseEncrypted
      ? this.cryptoService.decrypt(config.e2ePassphraseEncrypted)
      : undefined

    const docId = documentPath
    const url = `${config.endpoint}/${config.database}/${encodeURIComponent(docId)}`
    const credentials = Buffer.from(`${username}:${password}`).toString('base64')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30_000)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new FileContentUnavailableError(`CouchDB GET failed with status ${response.status}`)
      }

      const doc = await response.json() as Record<string, unknown>

      // Check if document is deleted
      if (doc['deleted'] === true || doc['_deleted'] === true) {
        return null
      }

      // Decode content from CouchDB document
      const data = doc['data'] as string | string[] | undefined
      if (data === undefined) {
        return null
      }

      let rawContent: string
      if (Array.isArray(data)) {
        rawContent = data.join('')
      } else {
        rawContent = data
      }

      // If E2E enabled, decrypt content
      if (config.e2eEnabled && e2ePassphrase) {
        try {
          const encrypted = Buffer.from(rawContent, 'base64')
          const decrypted = this.cryptoService.decryptDocument(encrypted, e2ePassphrase)
          return decrypted.toString('utf-8')
        } catch {
          throw new FileContentUnavailableError('Failed to decrypt remote file content')
        }
      }

      // For binary documents (type "newnote"), decode from base64
      const docType = doc['type'] as string | undefined
      if (docType === 'newnote') {
        const decoded = Buffer.from(rawContent, 'base64')
        return decoded.toString('utf-8')
      }

      // For plain text documents, content is already UTF-8
      return rawContent
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      if (error instanceof FileContentUnavailableError) {
        throw error
      }
      const message = error instanceof Error ? error.message : 'Unknown fetch error'
      throw new FileContentUnavailableError(`Failed to fetch remote file: ${message}`)
    }
  }

  /**
   * Evaluates auto-resolution for newly detected conflicts during a sync run.
   * If auto-resolution is configured and enabled, resolves conflicts automatically
   * and logs each resolution with the `auto_resolved` marker.
   */
  private async evaluateAutoResolution(
    vaultId: string,
    conflicts: ConflictEntry[],
    vaultPath: string,
    connection: SyncConnectionParams,
    e2eEnabled: boolean,
    e2ePassphrase?: string,
  ): Promise<AutoResolvedLogDetail[]> {
    if (!this.autoResolutionEngine || !this.autoResolutionConfigStore || !this.conflictResolver) {
      return []
    }

    const config = await this.autoResolutionConfigStore.load(vaultId)
    if (!config.enabled) {
      return []
    }

    const results: AutoResolvedLogDetail[] = []

    for (const conflict of conflicts) {
      // Categorize the conflict for strategy evaluation
      const categorized = applyDefaultCategory(conflict)

      // Evaluate the strategy
      const action = this.autoResolutionEngine.evaluate(categorized, config)
      if (!action) {
        continue
      }

      const strategy = config.strategies[categorized.category]
      if (!strategy) {
        continue
      }

      // Attempt resolution
      const resolveResult = await this.conflictResolver.resolve({
        vaultId,
        vaultPath,
        documentPath: conflict.documentPath,
        resolution: action,
        connection,
        e2eEnabled,
        e2ePassphrase,
      })

      const detail: AutoResolvedLogDetail = {
        documentPath: conflict.documentPath,
        category: categorized.category,
        strategy,
        resolution: action.type === 'use_remote' ? 'use_remote'
          : action.type === 'use_local' ? 'use_local'
          : 'skip',
        success: resolveResult.success,
        ...(resolveResult.error !== undefined ? { error: resolveResult.error } : {}),
      }

      results.push(detail)

      if (resolveResult.success) {
        this.logger.info('Conflict auto-resolved', {
          vaultId,
          documentPath: conflict.documentPath,
          strategy,
          resolution: detail.resolution,
          marker: 'auto_resolved',
        })
      } else {
        this.logger.warn('Auto-resolution failed, conflict remains unresolved', {
          vaultId,
          documentPath: conflict.documentPath,
          strategy,
          error: resolveResult.error,
          marker: 'auto_resolved',
        })
      }
    }

    return results
  }

  /**
   * Starts the scheduler for a vault with a sync callback.
   * The callback checks the sync lock before executing and triggers a sync.
   */
  private startScheduler(vaultId: string, intervalMinutes: number): void {
    this.scheduler.start(vaultId, intervalMinutes, async () => {
      if (this.syncLock.isLocked(vaultId)) {
        this.logger.info('Skipping scheduled sync — already in progress', { vaultId })
        return
      }
      try {
        await this.triggerScheduledSync(vaultId)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        this.logger.error('Scheduled sync failed', { vaultId, error: message })
      }
    })
  }

  /**
   * Executes a scheduled sync (interval-triggered).
   * Similar to triggerSync but with triggerType 'interval' in the log entry.
   */
  private async triggerScheduledSync(vaultId: string): Promise<void> {
    const startTime = Date.now()

    // Acquire lock
    if (!this.syncLock.acquire(vaultId)) {
      return // Already in progress — skip silently
    }

    // Create protocol logger for this run
    const protocol = this.protocolStore ? new SyncProtocolLogger(this.protocolStore, vaultId) : undefined

    try {
      // Load config
      const config = await this.configStore.load(vaultId)
      if (!config || config.status === 'disabled') {
        return
      }

      // Resolve vault path
      const vaultPath = this.vaultPathResolver(vaultId)
      if (!vaultPath) {
        return
      }

      // Protocol: sync start
      protocol?.syncStart('interval', config.mode)

      // Decrypt credentials
      const username = this.cryptoService.decrypt(config.usernameEncrypted)
      const password = this.cryptoService.decrypt(config.passwordEncrypted)
      const e2ePassphrase = config.e2eEnabled && config.e2ePassphraseEncrypted
        ? this.cryptoService.decrypt(config.e2ePassphraseEncrypted)
        : undefined

      const connection: SyncConnectionParams = {
        endpoint: config.endpoint,
        database: config.database,
        username,
        password,
      }

      // Load checkpoint
      const checkpoint = await this.checkpointStore.load(vaultId)
      const since = checkpoint?.lastSeq ?? null
      const localMtimes = checkpoint?.localMtimes ?? {}

      // Create log entry (started)
      const logEntryId = crypto.randomUUID()
      const logEntry: SyncLogEntry = {
        id: logEntryId,
        timestamp: new Date().toISOString(),
        triggerType: 'interval',
        mode: config.mode,
        status: 'started',
      }
      await this.logStore.append(vaultId, logEntry)

      // Protocol: connecting
      protocol?.connecting(config.endpoint, config.database)

      // Execute pull
      const pullResult = await this.syncEngine.pull({
        connection,
        vaultId,
        vaultPath,
        since,
        localMtimes,
        e2eEnabled: config.e2eEnabled,
        ...(e2ePassphrase !== undefined ? { e2ePassphrase } : {}),
      })

      // Handle connection/auth failures
      if (pullResult.status === 'connection_failed' || pullResult.status === 'auth_failed') {
        const durationMs = Date.now() - startTime

        if (pullResult.status === 'connection_failed') {
          protocol?.connectionFailed(pullResult.errors[0]?.description ?? 'Unbekannter Fehler')
        } else {
          protocol?.authFailed()
        }
        protocol?.syncComplete(durationMs, 0, 0, 0, pullResult.errors.length)
        await protocol?.flush()

        await this.logStore.updateLast(vaultId, {
          status: pullResult.status,
          pulledCount: 0,
          pushedCount: 0,
          durationMs,
          ...(pullResult.errors.length > 0 ? { errors: pullResult.errors } : {}),
        })
        return
      }

      // Protocol: connected + pull
      protocol?.connected(since)
      protocol?.pullStart(pullResult.changeCount ?? 0, since)
      if (pullResult.pulledFiles) {
        for (const file of pullResult.pulledFiles) {
          protocol?.filePulled(file.path, file.size, file.isBinary, file.chunkCount)
        }
      }
      if (pullResult.deletedFiles) {
        for (const filePath of pullResult.deletedFiles) {
          protocol?.fileDeleted(filePath)
        }
      }
      for (const conflict of pullResult.conflicts) {
        protocol?.conflict(conflict.documentPath)
      }
      for (const error of pullResult.errors) {
        protocol?.fileFailed(error.documentPath, error.errorType, error.description)
      }
      protocol?.pullComplete(pullResult.pulledCount, pullResult.conflicts.length, pullResult.errors.length)

      // Store conflicts from pull (only for documents without existing conflicts)
      const newScheduledConflicts: ConflictEntry[] = []
      for (const conflict of pullResult.conflicts) {
        const alreadyExists = await this.conflictStore.exists(vaultId, conflict.documentPath)
        if (!alreadyExists) {
          await this.conflictStore.add(vaultId, conflict)
          newScheduledConflicts.push(conflict)
        }
      }

      // Evaluate auto-resolution for newly detected conflicts
      if (newScheduledConflicts.length > 0) {
        await this.evaluateAutoResolution(
          vaultId, newScheduledConflicts, vaultPath, connection, config.e2eEnabled, e2ePassphrase,
        )
      }

      // Execute push if bidirectional
      let pushedCount = 0
      const pushErrors: SyncErrorDetail[] = []

      if (config.mode === 'bidirectional') {
        // Update localMtimes with fresh mtimes ONLY for files that were written by the pull.
        const scheduledPushMtimes: Record<string, number> = { ...localMtimes }
        if (pullResult.pulledFiles && pullResult.pulledFiles.length > 0) {
          try {
            const freshScan = await scanVaultFiles(vaultPath)
            for (const pulled of pullResult.pulledFiles) {
              const freshMtime = freshScan.get(pulled.path)
              if (freshMtime !== undefined) {
                scheduledPushMtimes[pulled.path] = freshMtime
              }
            }
          } catch {
            this.logger.warn('Failed to scan vault files for scheduled push mtime update', { vaultId })
          }
        }

        const pushResult = await this.syncEngine.push({
          connection,
          vaultId,
          vaultPath,
          localMtimes: scheduledPushMtimes,
          e2eEnabled: config.e2eEnabled,
          ...(e2ePassphrase !== undefined ? { e2ePassphrase } : {}),
        })

        pushedCount = pushResult.pushedCount
        pushErrors.push(...pushResult.errors)

        protocol?.pushStart(pushResult.changedFileCount ?? 0, pushResult.deletedFileCount ?? 0)
        if (pushResult.pushedFiles) {
          for (const file of pushResult.pushedFiles) {
            protocol?.filePushed(file.path, file.size)
          }
        }
        if (pushResult.deletedFiles) {
          for (const filePath of pushResult.deletedFiles) {
            protocol?.filePushDeleted(filePath)
          }
        }
        for (const error of pushResult.errors) {
          protocol?.fileFailed(error.documentPath, error.errorType, error.description)
        }
        protocol?.pushComplete(pushedCount, pushResult.errors.length)
      }

      // Combine errors
      const allErrors = [...pullResult.errors, ...pushErrors].slice(0, 100)

      // Determine overall status
      let status: SyncResult['status']
      if (allErrors.length === 0) {
        status = 'success'
      } else if (pullResult.pulledCount > 0 || pushedCount > 0) {
        status = 'partial_success'
      } else {
        status = 'failed'
      }

      const durationMs = Date.now() - startTime

      // Update checkpoint on success/partial_success (NOT on failed)
      if (status === 'success' || status === 'partial_success') {
        // Scan current vault file mtimes AFTER pull+push to capture the actual state.
        let currentMtimes: Record<string, number> = { ...localMtimes }
        try {
          const scanned = await scanVaultFiles(vaultPath)
          currentMtimes = Object.fromEntries(scanned)
        } catch {
          this.logger.warn('Failed to scan vault files for checkpoint update (scheduled)', { vaultId })
        }

        const newCheckpoint: SyncCheckpoint = {
          lastSeq: pullResult.newLastSeq,
          lastSyncAt: new Date().toISOString(),
          localMtimes: currentMtimes,
        }
        await this.checkpointStore.save(vaultId, newCheckpoint)

        protocol?.checkpoint(pullResult.newLastSeq)
      }

      // Update log entry
      await this.logStore.updateLast(vaultId, {
        status,
        pulledCount: pullResult.pulledCount,
        pushedCount,
        durationMs,
        ...(allErrors.length > 0 ? { errors: allErrors } : {}),
      })

      // Protocol: sync complete + flush
      protocol?.syncComplete(durationMs, pullResult.pulledCount, pushedCount, pullResult.conflicts.length, allErrors.length)
      await protocol?.flush()

      // Trigger link index rebuild if files were pulled
      if (pullResult.pulledCount > 0 && this.onPullComplete) {
        try {
          this.onPullComplete(vaultId)
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          this.logger.error('onPullComplete hook failed (scheduled)', { vaultId, error: message })
        }
      }
    } finally {
      this.syncLock.release(vaultId)
    }
  }
}
