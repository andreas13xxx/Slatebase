import crypto from 'node:crypto'
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
} from './types.js'
import {
  SyncAlreadyConfiguredError,
  SyncNotConfiguredError,
  SyncInProgressError,
  ConnectionTestFailedError,
  ConflictResolutionError,
} from './errors.js'
import type { ILogger } from '../logger/index.js'

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
  ) {}

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
    const mode = input.mode ?? 'bidirectional'
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

        return result
      }

      // Store conflicts from pull (only for documents without existing conflicts)
      let conflictsDetected = 0
      for (const conflict of pullResult.conflicts) {
        const alreadyExists = await this.conflictStore.exists(vaultId, conflict.documentPath)
        if (!alreadyExists) {
          await this.conflictStore.add(vaultId, conflict)
          conflictsDetected++
        }
      }

      // Execute push if bidirectional
      let pushedCount = 0
      const pushErrors: SyncErrorDetail[] = []

      if (config.mode === 'bidirectional') {
        const pushResult = await this.syncEngine.push({
          connection,
          vaultId,
          vaultPath,
          localMtimes,
          e2eEnabled: config.e2eEnabled,
          ...(e2ePassphrase !== undefined ? { e2ePassphrase } : {}),
        })

        pushedCount = pushResult.pushedCount
        pushErrors.push(...pushResult.errors)
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
        const newCheckpoint: SyncCheckpoint = {
          lastSeq: pullResult.newLastSeq,
          lastSyncAt: new Date().toISOString(),
          localMtimes: { ...localMtimes },
        }
        await this.checkpointStore.save(vaultId, newCheckpoint)
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

      // Reset scheduler timer (so next interval starts fresh after manual sync)
      this.scheduler.reset(vaultId)

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

      // Load checkpoint
      const checkpoint = await this.checkpointStore.load(vaultId)
      const since = checkpoint?.lastSeq ?? null
      const localMtimes = checkpoint?.localMtimes ?? {}

      // Call engine.analyze()
      return await this.syncEngine.analyze({
        connection,
        vaultId,
        vaultPath,
        since,
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
        await this.logStore.updateLast(vaultId, {
          status: pullResult.status,
          pulledCount: 0,
          pushedCount: 0,
          durationMs,
          ...(pullResult.errors.length > 0 ? { errors: pullResult.errors } : {}),
        })
        return
      }

      // Store conflicts from pull (only for documents without existing conflicts)
      for (const conflict of pullResult.conflicts) {
        const alreadyExists = await this.conflictStore.exists(vaultId, conflict.documentPath)
        if (!alreadyExists) {
          await this.conflictStore.add(vaultId, conflict)
        }
      }

      // Execute push if bidirectional
      let pushedCount = 0
      const pushErrors: SyncErrorDetail[] = []

      if (config.mode === 'bidirectional') {
        const pushResult = await this.syncEngine.push({
          connection,
          vaultId,
          vaultPath,
          localMtimes,
          e2eEnabled: config.e2eEnabled,
          ...(e2ePassphrase !== undefined ? { e2ePassphrase } : {}),
        })

        pushedCount = pushResult.pushedCount
        pushErrors.push(...pushResult.errors)
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
        const newCheckpoint: SyncCheckpoint = {
          lastSeq: pullResult.newLastSeq,
          lastSyncAt: new Date().toISOString(),
          localMtimes: { ...localMtimes },
        }
        await this.checkpointStore.save(vaultId, newCheckpoint)
      }

      // Update log entry
      await this.logStore.updateLast(vaultId, {
        status,
        pulledCount: pullResult.pulledCount,
        pushedCount,
        durationMs,
        ...(allErrors.length > 0 ? { errors: allErrors } : {}),
      })
    } finally {
      this.syncLock.release(vaultId)
    }
  }
}
