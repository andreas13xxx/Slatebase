import { describe, it, expect } from 'vitest'
import { SyncService, type VaultPathResolver } from './sync-service.js'
import type {
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
  SyncLogEntry,
  PullResult,
  PushResult,
  AnalysisResult,
  PaginatedSyncLog,
  ConflictEntry,
  SyncCheckpoint,
} from './types.js'
import type { ILogger } from '../logger/index.js'
import { SyncInProgressError, SyncNotConfiguredError } from './errors.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as ILogger
}

function createActiveConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    endpoint: 'https://couch.example.com',
    database: 'mydb',
    usernameEncrypted: 'enc_user',
    passwordEncrypted: 'enc_pass',
    mode: 'bidirectional',
    trigger: 'manual',
    status: 'active',
    e2eEnabled: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createMockConfigStore(config: SyncConfig | null = null): ISyncConfigStore & { savedConfigs: Array<{ vaultId: string; config: SyncConfig }> } {
  const savedConfigs: Array<{ vaultId: string; config: SyncConfig }> = []
  return {
    savedConfigs,
    save: async (vaultId: string, c: SyncConfig) => { savedConfigs.push({ vaultId, config: c }) },
    load: async () => config,
    remove: async () => {},
    loadAll: async () => config ? [{ vaultId: 'vault1', config }] : [],
  }
}

function createMockLogStore(): ISyncLogStore & { appendedEntries: SyncLogEntry[]; lastUpdate: Partial<SyncLogEntry> | null } {
  const appendedEntries: SyncLogEntry[] = []
  let lastUpdate: Partial<SyncLogEntry> | null = null
  return {
    appendedEntries,
    get lastUpdate() { return lastUpdate },
    append: async (_vaultId: string, entry: SyncLogEntry) => { appendedEntries.push(entry) },
    read: async (_vaultId: string, page: number, pageSize: number): Promise<PaginatedSyncLog> => ({
      items: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
    }),
    updateLast: async (_vaultId: string, update: Partial<SyncLogEntry>) => { lastUpdate = update },
  }
}

function createMockConflictStore(): IConflictStore & { addedConflicts: ConflictEntry[] } {
  const addedConflicts: ConflictEntry[] = []
  return {
    addedConflicts,
    add: async (_vaultId: string, conflict: ConflictEntry) => { addedConflicts.push(conflict) },
    getAll: async () => [],
    remove: async () => {},
    exists: async () => false,
  }
}

function createMockCheckpointStore(checkpoint: SyncCheckpoint | null = null): ICheckpointStore & { savedCheckpoints: Array<{ vaultId: string; checkpoint: SyncCheckpoint }> } {
  const savedCheckpoints: Array<{ vaultId: string; checkpoint: SyncCheckpoint }> = []
  return {
    savedCheckpoints,
    save: async (vaultId: string, cp: SyncCheckpoint) => { savedCheckpoints.push({ vaultId, checkpoint: cp }) },
    load: async () => checkpoint,
    remove: async () => {},
  }
}

function createMockCryptoService(): ICryptoService {
  return {
    encrypt: (plaintext: string) => `enc_${plaintext}`,
    decrypt: (ciphertext: string) => ciphertext.replace('enc_', ''),
    encryptDocument: (content: Buffer) => content,
    decryptDocument: (encrypted: Buffer) => encrypted,
  }
}

function createMockSetupUriParser(): ISetupUriParser {
  return {
    parse: () => ({
      endpoint: 'https://couch.example.com',
      database: 'mydb',
      username: 'user',
      password: 'pass',
      e2eEnabled: false,
    }),
  }
}

function createMockScheduler(): ISyncScheduler & { startedVaults: string[]; stoppedVaults: string[]; resetVaults: string[] } {
  const startedVaults: string[] = []
  const stoppedVaults: string[] = []
  const resetVaults: string[] = []
  return {
    startedVaults,
    stoppedVaults,
    resetVaults,
    start: (vaultId: string) => { startedVaults.push(vaultId) },
    stop: (vaultId: string) => { stoppedVaults.push(vaultId) },
    reset: (vaultId: string) => { resetVaults.push(vaultId) },
    isActive: () => false,
    stopAll: () => {},
  }
}

function createMockSyncLock(locked = false): ISyncLock & { isCurrentlyLocked(): boolean } {
  let isLockedState = locked
  return {
    acquire: (_vaultId: string) => {
      if (isLockedState) return false
      isLockedState = true
      return true
    },
    release: (_vaultId: string) => { isLockedState = false },
    isLocked: (_vaultId: string) => isLockedState,
    isCurrentlyLocked: () => isLockedState,
  }
}

function createSuccessPullResult(overrides: Partial<PullResult> = {}): PullResult {
  return {
    status: 'success',
    newLastSeq: '100',
    pulledCount: 5,
    conflicts: [],
    errors: [],
    ...overrides,
  }
}

function createSuccessPushResult(overrides: Partial<PushResult> = {}): PushResult {
  return {
    status: 'success',
    pushedCount: 3,
    errors: [],
    ...overrides,
  }
}

function createMockSyncEngine(pullResult?: PullResult, pushResult?: PushResult, analyzeResult?: AnalysisResult): ISyncEngine {
  return {
    testConnection: async () => ({ reachable: true, authenticated: true }),
    pull: async () => pullResult ?? createSuccessPullResult(),
    push: async () => pushResult ?? createSuccessPushResult(),
    analyze: async () => analyzeResult ?? createEmptyAnalysisResult(),
  }
}

function createEmptyAnalysisResult(): AnalysisResult {
  return {
    summary: {
      remote_newer: { count: 0, totalBytes: 0 },
      local_newer: { count: 0, totalBytes: 0 },
      remote_only: { count: 0, totalBytes: 0 },
      local_only: { count: 0, totalBytes: 0 },
      conflict: { count: 0, totalBytes: 0 },
      identical: { count: 0, totalBytes: 0 },
    },
    details: [],
    durationMs: 50,
  }
}

function createVaultPathResolver(path: string | null = '/data/vaults/vault1'): VaultPathResolver {
  return () => path
}

function createService(overrides: {
  configStore?: ISyncConfigStore,
  logStore?: ISyncLogStore & { appendedEntries: SyncLogEntry[]; lastUpdate: Partial<SyncLogEntry> | null },
  conflictStore?: IConflictStore & { addedConflicts: ConflictEntry[] },
  checkpointStore?: ICheckpointStore & { savedCheckpoints: Array<{ vaultId: string; checkpoint: SyncCheckpoint }> },
  cryptoService?: ICryptoService,
  setupUriParser?: ISetupUriParser,
  syncEngine?: ISyncEngine,
  scheduler?: ISyncScheduler & { startedVaults: string[]; stoppedVaults: string[]; resetVaults: string[] },
  syncLock?: ISyncLock,
  logger?: ILogger,
  vaultPathResolver?: VaultPathResolver,
} = {}) {
  const configStore = overrides.configStore ?? createMockConfigStore(createActiveConfig())
  const logStore = overrides.logStore ?? createMockLogStore()
  const conflictStore = overrides.conflictStore ?? createMockConflictStore()
  const checkpointStore = overrides.checkpointStore ?? createMockCheckpointStore()
  const cryptoService = overrides.cryptoService ?? createMockCryptoService()
  const setupUriParser = overrides.setupUriParser ?? createMockSetupUriParser()
  const syncEngine = overrides.syncEngine ?? createMockSyncEngine()
  const scheduler = overrides.scheduler ?? createMockScheduler()
  const syncLock = overrides.syncLock ?? createMockSyncLock()
  const logger = overrides.logger ?? createMockLogger()
  const vaultPathResolver = overrides.vaultPathResolver ?? createVaultPathResolver()

  const service = new SyncService(
    configStore, logStore, conflictStore, checkpointStore,
    cryptoService, setupUriParser, syncEngine, scheduler,
    syncLock, logger, vaultPathResolver,
  )

  return { service, configStore, logStore, conflictStore, checkpointStore, scheduler, syncEngine }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SyncService — triggerSync', () => {
  it('throws SyncInProgressError when lock cannot be acquired', async () => {
    const { service } = createService({ syncLock: createMockSyncLock(true) })
    await expect(service.triggerSync('vault1')).rejects.toThrow(SyncInProgressError)
  })

  it('throws SyncNotConfiguredError when no config exists', async () => {
    const { service } = createService({ configStore: createMockConfigStore(null) })
    await expect(service.triggerSync('vault1')).rejects.toThrow(SyncNotConfiguredError)
  })

  it('throws SyncNotConfiguredError when config is disabled', async () => {
    const { service } = createService({
      configStore: createMockConfigStore(createActiveConfig({ status: 'disabled' })),
    })
    await expect(service.triggerSync('vault1')).rejects.toThrow(SyncNotConfiguredError)
  })

  it('throws SyncNotConfiguredError when vault path cannot be resolved', async () => {
    const { service } = createService({ vaultPathResolver: createVaultPathResolver(null) })
    await expect(service.triggerSync('vault1')).rejects.toThrow(SyncNotConfiguredError)
  })

  it('returns success result on successful pull and push', async () => {
    const { service } = createService()
    const result = await service.triggerSync('vault1')

    expect(result.status).toBe('success')
    expect(result.pulledCount).toBe(5)
    expect(result.pushedCount).toBe(3)
    expect(result.conflictsDetected).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('creates a log entry with status started', async () => {
    const logStore = createMockLogStore()
    const { service } = createService({ logStore })
    await service.triggerSync('vault1')

    expect(logStore.appendedEntries).toHaveLength(1)
    expect(logStore.appendedEntries[0]!.status).toBe('started')
    expect(logStore.appendedEntries[0]!.triggerType).toBe('manual')
  })

  it('updates log entry with final status on success', async () => {
    const logStore = createMockLogStore()
    const { service } = createService({ logStore })
    await service.triggerSync('vault1')

    expect(logStore.lastUpdate).not.toBeNull()
    expect(logStore.lastUpdate!.status).toBe('success')
    expect(logStore.lastUpdate!.pulledCount).toBe(5)
    expect(logStore.lastUpdate!.pushedCount).toBe(3)
  })

  it('saves checkpoint on success', async () => {
    const checkpointStore = createMockCheckpointStore()
    const { service } = createService({ checkpointStore })
    await service.triggerSync('vault1')

    expect(checkpointStore.savedCheckpoints).toHaveLength(1)
    expect(checkpointStore.savedCheckpoints[0]!.checkpoint.lastSeq).toBe('100')
  })

  it('does NOT save checkpoint on failed status', async () => {
    const checkpointStore = createMockCheckpointStore()
    const pullResult = createSuccessPullResult({
      status: 'connection_failed',
      pulledCount: 0,
    })
    const { service } = createService({
      checkpointStore,
      syncEngine: createMockSyncEngine(pullResult),
    })
    await service.triggerSync('vault1')

    expect(checkpointStore.savedCheckpoints).toHaveLength(0)
  })

  it('resets scheduler timer after sync', async () => {
    const scheduler = createMockScheduler()
    const { service } = createService({ scheduler })
    await service.triggerSync('vault1')

    expect(scheduler.resetVaults).toContain('vault1')
  })

  it('releases lock even on error', async () => {
    const syncLock = createMockSyncLock()
    const { service } = createService({
      syncLock,
      configStore: createMockConfigStore(null),
    })

    await expect(service.triggerSync('vault1')).rejects.toThrow()
    expect(syncLock.isCurrentlyLocked()).toBe(false)
  })

  it('stores conflicts from pull result', async () => {
    const conflictStore = createMockConflictStore()
    const pullResult = createSuccessPullResult({
      conflicts: [{
        documentPath: 'notes/test.md',
        local: { modifiedAt: '2024-01-02T00:00:00.000Z', size: 100 },
        remote: { revision: '2-abc', modifiedAt: '2024-01-03T00:00:00.000Z', size: 120 },
        detectedAt: '2024-01-03T00:00:00.000Z',
      }],
    })
    const { service } = createService({ conflictStore, syncEngine: createMockSyncEngine(pullResult) })
    const result = await service.triggerSync('vault1')

    expect(result.conflictsDetected).toBe(1)
    expect(conflictStore.addedConflicts).toHaveLength(1)
    expect(conflictStore.addedConflicts[0]!.documentPath).toBe('notes/test.md')
  })

  it('skips push in readonly mode', async () => {
    let pushCalled = false
    const engine: ISyncEngine = {
      testConnection: async () => ({ reachable: true, authenticated: true }),
      pull: async () => createSuccessPullResult(),
      push: async () => { pushCalled = true; return createSuccessPushResult() },
      analyze: async () => createEmptyAnalysisResult(),
    }
    const { service } = createService({
      configStore: createMockConfigStore(createActiveConfig({ mode: 'readonly' })),
      syncEngine: engine,
    })
    const result = await service.triggerSync('vault1')

    expect(pushCalled).toBe(false)
    expect(result.pushedCount).toBe(0)
  })

  it('returns partial_success when some errors occur but docs were pulled', async () => {
    const pullResult = createSuccessPullResult({
      status: 'partial_success',
      pulledCount: 3,
      errors: [{ documentPath: 'bad.md', errorType: 'write_failed', description: 'Permission denied' }],
    })
    const { service } = createService({ syncEngine: createMockSyncEngine(pullResult) })
    const result = await service.triggerSync('vault1')

    expect(result.status).toBe('partial_success')
    expect(result.errors).toHaveLength(1)
  })

  it('returns connection_failed when pull fails with connection error', async () => {
    const pullResult = createSuccessPullResult({ status: 'connection_failed', pulledCount: 0 })
    const { service } = createService({ syncEngine: createMockSyncEngine(pullResult) })
    const result = await service.triggerSync('vault1')

    expect(result.status).toBe('connection_failed')
  })
})

describe('SyncService — analyze', () => {
  it('throws SyncInProgressError when lock cannot be acquired', async () => {
    const { service } = createService({ syncLock: createMockSyncLock(true) })
    await expect(service.analyze('vault1')).rejects.toThrow(SyncInProgressError)
  })

  it('throws SyncNotConfiguredError when no config exists', async () => {
    const { service } = createService({ configStore: createMockConfigStore(null) })
    await expect(service.analyze('vault1')).rejects.toThrow(SyncNotConfiguredError)
  })

  it('throws SyncNotConfiguredError when config is disabled', async () => {
    const { service } = createService({
      configStore: createMockConfigStore(createActiveConfig({ status: 'disabled' })),
    })
    await expect(service.analyze('vault1')).rejects.toThrow(SyncNotConfiguredError)
  })

  it('returns analysis result from engine', async () => {
    const analysisResult: AnalysisResult = {
      summary: {
        remote_newer: { count: 2, totalBytes: 200 },
        local_newer: { count: 1, totalBytes: 100 },
        remote_only: { count: 0, totalBytes: 0 },
        local_only: { count: 0, totalBytes: 0 },
        conflict: { count: 0, totalBytes: 0 },
        identical: { count: 5, totalBytes: 500 },
      },
      details: [],
      durationMs: 120,
    }
    const { service } = createService({
      syncEngine: createMockSyncEngine(undefined, undefined, analysisResult),
    })
    const result = await service.analyze('vault1')

    expect(result).toEqual(analysisResult)
  })

  it('releases lock after analysis completes', async () => {
    const syncLock = createMockSyncLock()
    const { service } = createService({ syncLock })
    await service.analyze('vault1')

    expect(syncLock.isCurrentlyLocked()).toBe(false)
  })

  it('releases lock even on error', async () => {
    const syncLock = createMockSyncLock()
    const { service } = createService({
      syncLock,
      configStore: createMockConfigStore(null),
    })

    await expect(service.analyze('vault1')).rejects.toThrow()
    expect(syncLock.isCurrentlyLocked()).toBe(false)
  })
})

describe('SyncService — getLog', () => {
  it('delegates to logStore.read with correct parameters', async () => {
    let capturedPage = 0
    let capturedPageSize = 0
    const logStore = createMockLogStore()
    logStore.read = async (_vaultId: string, page: number, pageSize: number) => {
      capturedPage = page
      capturedPageSize = pageSize
      return { items: [], total: 0, page, pageSize, totalPages: 0 }
    }
    const { service } = createService({ logStore })

    const result = await service.getLog('vault1', 2, 25)

    expect(capturedPage).toBe(2)
    expect(capturedPageSize).toBe(25)
    expect(result.page).toBe(2)
    expect(result.pageSize).toBe(25)
  })
})

describe('SyncService — initializeSchedulers', () => {
  it('starts schedulers for active interval configs', async () => {
    const config = createActiveConfig({ trigger: 'interval', intervalMinutes: 30 })
    const configStore = createMockConfigStore(config)
    const scheduler = createMockScheduler()
    const { service } = createService({ configStore, scheduler })

    await service.initializeSchedulers()

    expect(scheduler.startedVaults).toContain('vault1')
  })

  it('does not start scheduler for manual trigger configs', async () => {
    const config = createActiveConfig({ trigger: 'manual' })
    const configStore = createMockConfigStore(config)
    const scheduler = createMockScheduler()
    const { service } = createService({ configStore, scheduler })

    await service.initializeSchedulers()

    expect(scheduler.startedVaults).toHaveLength(0)
  })

  it('does not start scheduler for disabled configs', async () => {
    const config = createActiveConfig({ trigger: 'interval', intervalMinutes: 30, status: 'disabled' })
    const configStore = createMockConfigStore(config)
    configStore.loadAll = async () => [{ vaultId: 'vault1', config }]
    const scheduler = createMockScheduler()
    const { service } = createService({ configStore, scheduler })

    await service.initializeSchedulers()

    expect(scheduler.startedVaults).toHaveLength(0)
  })
})


// ─── Conflict Management Tests ───────────────────────────────────────────────

describe('SyncService — getConflicts', () => {
  it('delegates to conflictStore.getAll and returns conflicts', async () => {
    const conflicts: ConflictEntry[] = [
      {
        documentPath: 'notes/test.md',
        local: { modifiedAt: '2024-01-02T00:00:00.000Z', size: 100 },
        remote: { revision: '2-abc', modifiedAt: '2024-01-03T00:00:00.000Z', size: 120 },
        detectedAt: '2024-01-03T00:00:00.000Z',
      },
      {
        documentPath: 'notes/other.md',
        local: { modifiedAt: '2024-01-04T00:00:00.000Z', size: 200 },
        remote: { revision: '3-def', modifiedAt: '2024-01-05T00:00:00.000Z', size: 250 },
        detectedAt: '2024-01-05T00:00:00.000Z',
      },
    ]
    const conflictStore = createMockConflictStore()
    conflictStore.getAll = async () => conflicts
    const { service } = createService({ conflictStore })

    const result = await service.getConflicts('vault1')

    expect(result).toEqual(conflicts)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when no conflicts exist', async () => {
    const conflictStore = createMockConflictStore()
    conflictStore.getAll = async () => []
    const { service } = createService({ conflictStore })

    const result = await service.getConflicts('vault1')

    expect(result).toEqual([])
  })
})

describe('SyncService — resolveConflict', () => {
  it('throws SyncInProgressError when lock cannot be acquired', async () => {
    const { service } = createService({ syncLock: createMockSyncLock(true) })
    await expect(service.resolveConflict('vault1', 'notes/test.md', 'use_remote'))
      .rejects.toThrow(SyncInProgressError)
  })

  it('throws SyncNotConfiguredError when no config exists', async () => {
    const { service } = createService({ configStore: createMockConfigStore(null) })
    await expect(service.resolveConflict('vault1', 'notes/test.md', 'use_remote'))
      .rejects.toThrow(SyncNotConfiguredError)
  })

  it('throws ConflictResolutionError when use_local in readonly mode', async () => {
    const { service } = createService({
      configStore: createMockConfigStore(createActiveConfig({ mode: 'readonly' })),
    })
    await expect(service.resolveConflict('vault1', 'notes/test.md', 'use_local'))
      .rejects.toThrow('Cannot push local version in readonly mode')
  })

  it('removes conflict from store on use_remote resolution', async () => {
    let removedPath: string | null = null
    const conflictStore = createMockConflictStore()
    conflictStore.remove = async (_vaultId: string, docPath: string) => { removedPath = docPath }
    const { service } = createService({ conflictStore })

    await service.resolveConflict('vault1', 'notes/test.md', 'use_remote')

    expect(removedPath).toBe('notes/test.md')
  })

  it('removes conflict from store on use_local resolution in bidirectional mode', async () => {
    let removedPath: string | null = null
    const conflictStore = createMockConflictStore()
    conflictStore.remove = async (_vaultId: string, docPath: string) => { removedPath = docPath }
    const { service } = createService({
      conflictStore,
      configStore: createMockConfigStore(createActiveConfig({ mode: 'bidirectional' })),
    })

    await service.resolveConflict('vault1', 'notes/test.md', 'use_local')

    expect(removedPath).toBe('notes/test.md')
  })

  it('removes conflict from store on skip resolution', async () => {
    let removedPath: string | null = null
    const conflictStore = createMockConflictStore()
    conflictStore.remove = async (_vaultId: string, docPath: string) => { removedPath = docPath }
    const { service } = createService({ conflictStore })

    await service.resolveConflict('vault1', 'notes/test.md', 'skip')

    expect(removedPath).toBe('notes/test.md')
  })

  it('releases lock after successful resolution', async () => {
    const syncLock = createMockSyncLock()
    const { service } = createService({ syncLock })

    await service.resolveConflict('vault1', 'notes/test.md', 'skip')

    expect(syncLock.isCurrentlyLocked()).toBe(false)
  })

  it('releases lock even when error is thrown', async () => {
    const syncLock = createMockSyncLock()
    const { service } = createService({
      syncLock,
      configStore: createMockConfigStore(null),
    })

    await expect(service.resolveConflict('vault1', 'notes/test.md', 'use_remote'))
      .rejects.toThrow()
    expect(syncLock.isCurrentlyLocked()).toBe(false)
  })

  it('wraps unexpected errors in ConflictResolutionError', async () => {
    const conflictStore = createMockConflictStore()
    conflictStore.remove = async () => { throw new Error('Disk full') }
    const { service } = createService({ conflictStore })

    await expect(service.resolveConflict('vault1', 'notes/test.md', 'skip'))
      .rejects.toThrow('Conflict resolution failed: Disk full')
  })

  it('allows use_local in bidirectional mode', async () => {
    const { service } = createService({
      configStore: createMockConfigStore(createActiveConfig({ mode: 'bidirectional' })),
    })

    // Should not throw
    await service.resolveConflict('vault1', 'notes/test.md', 'use_local')
  })
})
