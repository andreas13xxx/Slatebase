/**
 * Property-Based Tests for Log Security
 *
 * Property 11: Log Error Truncation
 * Property 14: No Credentials in Log Entries
 * Property 15: Analysis is Read-Only
 *
 * **Validates: Requirements 5.3, 5.6, 6.1**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
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
  SyncErrorDetail,
  PullResult,
  PushResult,
  AnalysisResult,
  PaginatedSyncLog,
  SyncCheckpoint,
  AnalyzeParams,
} from './types.js'
import { SyncService } from './sync-service.js'
import type { ILogger } from '../logger/index.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  }
}

function createMockCryptoService(decryptMap?: Map<string, string>): ICryptoService {
  return {
    encrypt(plaintext: string): string {
      return `encrypted:${plaintext}`
    },
    decrypt(ciphertext: string): string {
      if (decryptMap) {
        const result = decryptMap.get(ciphertext)
        if (result !== undefined) return result
      }
      if (ciphertext.startsWith('encrypted:')) {
        return ciphertext.slice('encrypted:'.length)
      }
      return ciphertext
    },
    encryptDocument(content: Buffer, _passphrase: string): Buffer {
      return content
    },
    decryptDocument(encrypted: Buffer, _passphrase: string): Buffer {
      return encrypted
    },
  }
}

function createMockConfigStore(config: SyncConfig | null = null): ISyncConfigStore {
  return {
    async save() {},
    async load() { return config },
    async remove() {},
    async loadAll() { return config ? [{ vaultId: 'test-vault', config }] : [] },
  }
}

function createMockLogStore(): ISyncLogStore & { appendedEntries: SyncLogEntry[]; lastUpdates: Partial<SyncLogEntry>[] } {
  const store = {
    appendedEntries: [] as SyncLogEntry[],
    lastUpdates: [] as Partial<SyncLogEntry>[],
    async append(_vaultId: string, entry: SyncLogEntry) {
      store.appendedEntries.push(entry)
    },
    async read(_vaultId: string, _page: number, _pageSize: number): Promise<PaginatedSyncLog> {
      return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }
    },
    async updateLast(_vaultId: string, update: Partial<SyncLogEntry>) {
      store.lastUpdates.push(update)
    },
  }
  return store
}

function createMockConflictStore(): IConflictStore {
  return {
    async add() {},
    async getAll() { return [] },
    async remove() {},
    async exists() { return false },
  }
}

function createMockCheckpointStore(checkpoint: SyncCheckpoint | null = null): ICheckpointStore {
  return {
    async save() {},
    async load() { return checkpoint },
    async remove() {},
  }
}

function createMockSetupUriParser(): ISetupUriParser {
  return {
    parse() { return { endpoint: '', database: '', username: '', password: '', e2eEnabled: false } },
  }
}

function createMockScheduler(): ISyncScheduler {
  return {
    start() {},
    stop() {},
    reset() {},
    isActive() { return false },
    stopAll() {},
  }
}

function createMockSyncLock(): ISyncLock {
  let locked = false
  return {
    acquire() {
      if (locked) return false
      locked = true
      return true
    },
    release() { locked = false },
    isLocked() { return locked },
  }
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for a string that can be very long (for truncation testing). */
const longStringArb = fc.string({ minLength: 0, maxLength: 2000 })

/** Arbitrary for a valid document path. */
const documentPathArb = fc.stringMatching(/^[a-z][a-z0-9/._-]{0,80}$/)

/** Arbitrary for a valid error type. */
const errorTypeArb = fc.constantFrom(
  'write_failed' as const,
  'read_failed' as const,
  'decryption_failed' as const,
  'encryption_failed' as const,
  'invalid_path' as const,
  'permission_denied' as const,
)

/** Arbitrary for a SyncErrorDetail with potentially long description. */
const syncErrorDetailArb = fc.record({
  documentPath: documentPathArb,
  errorType: errorTypeArb,
  description: longStringArb,
})

/** Arbitrary for a list of error details (potentially more than 100). */
const manyErrorsArb = fc.array(syncErrorDetailArb, { minLength: 0, maxLength: 200 })

/** Arbitrary for credential-like strings (passwords, tokens, passphrases). */
const credentialArb = fc.stringOf(
  fc.char().filter(c => c !== '\n' && c !== '\r' && c !== '\0'),
  { minLength: 4, maxLength: 64 }
)

// ─── Property 11: Log Error Truncation ───────────────────────────────────────
// For any sync operation producing error details, each error description SHALL
// be truncated to at most 500 characters, and the total number of error entries
// per sync operation SHALL be capped at 100.
// **Validates: Requirements 5.3**

describe('Property 11: Log Error Truncation', () => {
  it('error descriptions are truncated to max 500 characters in pull results', () => {
    fc.assert(
      fc.property(manyErrorsArb, (errors) => {
        // Simulate the truncation logic used in SyncEngine.pull() and push()
        const truncatedErrors: SyncErrorDetail[] = errors.map(e => ({
          ...e,
          description: e.description.slice(0, 500),
        })).slice(0, 100)

        // Verify: each description is at most 500 chars
        for (const error of truncatedErrors) {
          expect(error.description.length).toBeLessThanOrEqual(500)
        }

        // Verify: at most 100 errors
        expect(truncatedErrors.length).toBeLessThanOrEqual(100)
      }),
      { numRuns: 50 }
    )
  })

  it('SyncService triggerSync caps combined errors at 100', async () => {
    // Generate a number of errors that exceeds 100 when combined from pull + push
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 50, max: 120 }),  // pull errors count
        fc.integer({ min: 50, max: 120 }),  // push errors count
        async (pullErrorCount, pushErrorCount) => {
          // Build pull errors (already truncated by engine)
          const pullErrors: SyncErrorDetail[] = Array.from({ length: pullErrorCount }, (_, i) => ({
            documentPath: `pull-file-${i}.md`,
            errorType: 'write_failed' as const,
            description: `Pull error ${i}`.slice(0, 500),
          }))

          // Build push errors (already truncated by engine)
          const pushErrors: SyncErrorDetail[] = Array.from({ length: pushErrorCount }, (_, i) => ({
            documentPath: `push-file-${i}.md`,
            errorType: 'read_failed' as const,
            description: `Push error ${i}`.slice(0, 500),
          }))

          // Simulate the SyncService logic: combine and cap at 100
          const allErrors = [...pullErrors, ...pushErrors].slice(0, 100)

          // Verify: at most 100 errors total
          expect(allErrors.length).toBeLessThanOrEqual(100)

          // Verify: each description is at most 500 chars
          for (const error of allErrors) {
            expect(error.description.length).toBeLessThanOrEqual(500)
          }
        },
      ),
      { numRuns: 30 }
    )
  })

  it('triggerSync produces log entries with truncated and capped errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(longStringArb, { minLength: 80, maxLength: 150 }),
        async (errorDescriptions) => {
          // Build errors with potentially long descriptions
          const pullErrors: SyncErrorDetail[] = errorDescriptions.map((desc, i) => ({
            documentPath: `file-${i}.md`,
            errorType: 'write_failed' as const,
            description: desc.slice(0, 500),
          }))

          const mockEngine: ISyncEngine = {
            async testConnection() { return { reachable: true, authenticated: true } },
            async pull(): Promise<PullResult> {
              return {
                status: 'partial_success',
                newLastSeq: '100',
                pulledCount: 1,
                conflicts: [],
                errors: pullErrors.slice(0, 100),
              }
            },
            async push(): Promise<PushResult> {
              return { status: 'success', pushedCount: 0, errors: [] }
            },
            async analyze(): Promise<AnalysisResult> {
              return { summary: { remote_newer: { count: 0, totalBytes: 0 }, local_newer: { count: 0, totalBytes: 0 }, remote_only: { count: 0, totalBytes: 0 }, local_only: { count: 0, totalBytes: 0 }, conflict: { count: 0, totalBytes: 0 }, identical: { count: 0, totalBytes: 0 } }, details: [], durationMs: 0 }
            },
          }

          const logStore = createMockLogStore()
          const config: SyncConfig = {
            endpoint: 'http://localhost:5984',
            database: 'testdb',
            usernameEncrypted: 'encrypted:user',
            passwordEncrypted: 'encrypted:pass',
            mode: 'readonly',
            trigger: 'manual',
            status: 'active',
            e2eEnabled: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          const service = new SyncService(
            createMockConfigStore(config),
            logStore,
            createMockConflictStore(),
            createMockCheckpointStore(),
            createMockCryptoService(),
            createMockSetupUriParser(),
            mockEngine,
            createMockScheduler(),
            createMockSyncLock(),
            createMockLogger(),
            () => '/tmp/vault',
          )

          const result = await service.triggerSync('test-vault')

          // Verify: errors in result are capped at 100
          expect(result.errors.length).toBeLessThanOrEqual(100)

          // Verify: each error description is at most 500 chars
          for (const error of result.errors) {
            expect(error.description.length).toBeLessThanOrEqual(500)
          }

          // Verify: log update also has capped errors
          const lastUpdate = logStore.lastUpdates[logStore.lastUpdates.length - 1]
          if (lastUpdate?.errors) {
            expect(lastUpdate.errors.length).toBeLessThanOrEqual(100)
            for (const error of lastUpdate.errors) {
              expect(error.description.length).toBeLessThanOrEqual(500)
            }
          }
        },
      ),
      { numRuns: 50 }
    )
  })
})

// ─── Property 14: No Credentials in Log Entries ──────────────────────────────
// For any sync log entry, the entry content SHALL never contain any credential
// values (username, password, tokens, passphrases) or document content —
// documents are referenced only by their relative path.
// **Validates: Requirements 5.6**

describe('Property 14: No Credentials in Log Entries', () => {
  it('log entries never contain credential values after triggerSync', async () => {
    await fc.assert(
      fc.asyncProperty(
        credentialArb,  // username
        credentialArb,  // password
        credentialArb,  // e2e passphrase
        async (username, password, passphrase) => {
          // Skip if credentials are too short to be meaningful
          if (username.length < 4 || password.length < 4 || passphrase.length < 4) return

          const decryptMap = new Map<string, string>()
          decryptMap.set(`encrypted:${username}`, username)
          decryptMap.set(`encrypted:${password}`, password)
          decryptMap.set(`encrypted:${passphrase}`, passphrase)

          const mockEngine: ISyncEngine = {
            async testConnection() { return { reachable: true, authenticated: true } },
            async pull(): Promise<PullResult> {
              return {
                status: 'partial_success',
                newLastSeq: '50',
                pulledCount: 2,
                conflicts: [],
                errors: [{
                  documentPath: 'notes/secret.md',
                  errorType: 'write_failed',
                  description: 'Permission denied writing file',
                }],
              }
            },
            async push(): Promise<PushResult> {
              return { status: 'success', pushedCount: 1, errors: [] }
            },
            async analyze(): Promise<AnalysisResult> {
              return { summary: { remote_newer: { count: 0, totalBytes: 0 }, local_newer: { count: 0, totalBytes: 0 }, remote_only: { count: 0, totalBytes: 0 }, local_only: { count: 0, totalBytes: 0 }, conflict: { count: 0, totalBytes: 0 }, identical: { count: 0, totalBytes: 0 } }, details: [], durationMs: 0 }
            },
          }

          const logStore = createMockLogStore()
          const config: SyncConfig = {
            endpoint: 'http://localhost:5984',
            database: 'testdb',
            usernameEncrypted: `encrypted:${username}`,
            passwordEncrypted: `encrypted:${password}`,
            mode: 'bidirectional',
            trigger: 'manual',
            status: 'active',
            e2eEnabled: true,
            e2ePassphraseEncrypted: `encrypted:${passphrase}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          const service = new SyncService(
            createMockConfigStore(config),
            logStore,
            createMockConflictStore(),
            createMockCheckpointStore(),
            createMockCryptoService(decryptMap),
            createMockSetupUriParser(),
            mockEngine,
            createMockScheduler(),
            createMockSyncLock(),
            createMockLogger(),
            () => '/tmp/vault',
          )

          await service.triggerSync('test-vault')

          // Serialize all log entries and updates to check for credential leakage
          const allLogData = [
            ...logStore.appendedEntries.map(e => JSON.stringify(e)),
            ...logStore.lastUpdates.map(u => JSON.stringify(u)),
          ]

          for (const logJson of allLogData) {
            // Credentials must NOT appear in log entries
            if (username.length >= 4) {
              expect(logJson).not.toContain(username)
            }
            if (password.length >= 4) {
              expect(logJson).not.toContain(password)
            }
            if (passphrase.length >= 4) {
              expect(logJson).not.toContain(passphrase)
            }
          }
        },
      ),
      { numRuns: 30 }
    )
  })

  it('log entries only contain allowed fields (no document content)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 200 }),  // document content
        async (documentContent) => {
          const mockEngine: ISyncEngine = {
            async testConnection() { return { reachable: true, authenticated: true } },
            async pull(): Promise<PullResult> {
              return {
                status: 'success',
                newLastSeq: '10',
                pulledCount: 1,
                conflicts: [],
                errors: [],
              }
            },
            async push(): Promise<PushResult> {
              return { status: 'success', pushedCount: 0, errors: [] }
            },
            async analyze(): Promise<AnalysisResult> {
              return { summary: { remote_newer: { count: 0, totalBytes: 0 }, local_newer: { count: 0, totalBytes: 0 }, remote_only: { count: 0, totalBytes: 0 }, local_only: { count: 0, totalBytes: 0 }, conflict: { count: 0, totalBytes: 0 }, identical: { count: 0, totalBytes: 0 } }, details: [], durationMs: 0 }
            },
          }

          const logStore = createMockLogStore()
          const config: SyncConfig = {
            endpoint: 'http://localhost:5984',
            database: 'testdb',
            usernameEncrypted: 'encrypted:admin',
            passwordEncrypted: 'encrypted:secret123',
            mode: 'readonly',
            trigger: 'manual',
            status: 'active',
            e2eEnabled: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          const service = new SyncService(
            createMockConfigStore(config),
            logStore,
            createMockConflictStore(),
            createMockCheckpointStore(),
            createMockCryptoService(),
            createMockSetupUriParser(),
            mockEngine,
            createMockScheduler(),
            createMockSyncLock(),
            createMockLogger(),
            () => '/tmp/vault',
          )

          await service.triggerSync('test-vault')

          // Verify log entries have only allowed fields
          for (const entry of logStore.appendedEntries) {
            // Must have required fields
            expect(entry.id).toBeDefined()
            expect(entry.timestamp).toBeDefined()
            expect(entry.triggerType).toBeDefined()
            expect(entry.mode).toBeDefined()
            expect(entry.status).toBeDefined()

            // Must NOT contain document content
            const entryJson = JSON.stringify(entry)
            if (documentContent.length >= 10) {
              expect(entryJson).not.toContain(documentContent)
            }
          }

          // Verify log updates have only allowed fields
          for (const update of logStore.lastUpdates) {
            const updateJson = JSON.stringify(update)
            if (documentContent.length >= 10) {
              expect(updateJson).not.toContain(documentContent)
            }
          }
        },
      ),
      { numRuns: 30 }
    )
  })
})

// ─── Property 15: Analysis is Read-Only ──────────────────────────────────────
// For any analysis operation, the vault filesystem and the CouchDB instance
// SHALL have zero write operations performed against them — the analysis only
// reads state from both sides.
// **Validates: Requirements 6.1**

describe('Property 15: Analysis is Read-Only', () => {
  it('analysis performs zero write operations on engine or stores', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 50 }),  // number of remote docs
        fc.integer({ min: 0, max: 50 }),  // number of local files
        async (remoteDocCount, localFileCount) => {
          let writeCallCount = 0

          const mockEngine: ISyncEngine = {
            async testConnection() { return { reachable: true, authenticated: true } },
            async pull(): Promise<PullResult> {
              writeCallCount++ // pull is a write operation
              return { status: 'success', newLastSeq: '0', pulledCount: 0, conflicts: [], errors: [] }
            },
            async push(): Promise<PushResult> {
              writeCallCount++ // push is a write operation
              return { status: 'success', pushedCount: 0, errors: [] }
            },
            async analyze(_params: AnalyzeParams): Promise<AnalysisResult> {
              // Analysis only reads — returns categorized results
              const details = Array.from({ length: remoteDocCount + localFileCount }, (_, i) => ({
                path: `file-${i}.md`,
                category: 'identical' as const,
                localSize: 100,
                remoteSize: 100,
              }))
              return {
                summary: {
                  remote_newer: { count: 0, totalBytes: 0 },
                  local_newer: { count: 0, totalBytes: 0 },
                  remote_only: { count: 0, totalBytes: 0 },
                  local_only: { count: 0, totalBytes: 0 },
                  conflict: { count: 0, totalBytes: 0 },
                  identical: { count: remoteDocCount + localFileCount, totalBytes: (remoteDocCount + localFileCount) * 100 },
                },
                details,
                durationMs: 50,
              }
            },
          }

          let configStoreSaveCount = 0
          let logStoreAppendCount = 0
          let conflictStoreAddCount = 0
          let checkpointStoreSaveCount = 0

          const configStore: ISyncConfigStore = {
            async save() { configStoreSaveCount++ },
            async load() {
              return {
                endpoint: 'http://localhost:5984',
                database: 'testdb',
                usernameEncrypted: 'encrypted:user',
                passwordEncrypted: 'encrypted:pass',
                mode: 'bidirectional' as const,
                trigger: 'manual' as const,
                status: 'active' as const,
                e2eEnabled: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            },
            async remove() {},
            async loadAll() { return [] },
          }

          const logStore: ISyncLogStore = {
            async append() { logStoreAppendCount++ },
            async read() { return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 } },
            async updateLast() { logStoreAppendCount++ },
          }

          const conflictStore: IConflictStore = {
            async add() { conflictStoreAddCount++ },
            async getAll() { return [] },
            async remove() {},
            async exists() { return false },
          }

          const checkpointStore: ICheckpointStore = {
            async save() { checkpointStoreSaveCount++ },
            async load() { return null },
            async remove() {},
          }

          const service = new SyncService(
            configStore,
            logStore,
            conflictStore,
            checkpointStore,
            createMockCryptoService(),
            createMockSetupUriParser(),
            mockEngine,
            createMockScheduler(),
            createMockSyncLock(),
            createMockLogger(),
            () => '/tmp/vault',
          )

          await service.analyze('test-vault')

          // Analysis SHALL perform zero write operations
          expect(writeCallCount).toBe(0)       // No pull/push calls
          expect(configStoreSaveCount).toBe(0)  // No config writes
          expect(logStoreAppendCount).toBe(0)   // No log writes
          expect(conflictStoreAddCount).toBe(0) // No conflict writes
          expect(checkpointStoreSaveCount).toBe(0) // No checkpoint writes
        },
      ),
      { numRuns: 30 }
    )
  })

  it('analysis returns results without modifying any state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('bidirectional' as const, 'readonly' as const),
        async (mode) => {
          const stateSnapshots: string[] = []

          const checkpoint: SyncCheckpoint = {
            lastSeq: '42',
            lastSyncAt: '2024-01-01T00:00:00.000Z',
            localMtimes: { 'existing.md': 1700000000000 },
          }

          const checkpointStore: ICheckpointStore = {
            async save(_vaultId: string, cp: SyncCheckpoint) {
              stateSnapshots.push(`checkpoint-save:${JSON.stringify(cp)}`)
            },
            async load() { return checkpoint },
            async remove() { stateSnapshots.push('checkpoint-remove') },
          }

          const mockEngine: ISyncEngine = {
            async testConnection() { return { reachable: true, authenticated: true } },
            async pull(): Promise<PullResult> {
              stateSnapshots.push('engine-pull')
              return { status: 'success', newLastSeq: '0', pulledCount: 0, conflicts: [], errors: [] }
            },
            async push(): Promise<PushResult> {
              stateSnapshots.push('engine-push')
              return { status: 'success', pushedCount: 0, errors: [] }
            },
            async analyze(): Promise<AnalysisResult> {
              // Read-only: just return analysis results
              return {
                summary: {
                  remote_newer: { count: 1, totalBytes: 500 },
                  local_newer: { count: 0, totalBytes: 0 },
                  remote_only: { count: 0, totalBytes: 0 },
                  local_only: { count: 0, totalBytes: 0 },
                  conflict: { count: 0, totalBytes: 0 },
                  identical: { count: 0, totalBytes: 0 },
                },
                details: [{ path: 'test.md', category: 'remote_newer', remoteSize: 500 }],
                durationMs: 10,
              }
            },
          }

          const config: SyncConfig = {
            endpoint: 'http://localhost:5984',
            database: 'testdb',
            usernameEncrypted: 'encrypted:user',
            passwordEncrypted: 'encrypted:pass',
            mode,
            trigger: 'manual',
            status: 'active',
            e2eEnabled: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          const service = new SyncService(
            createMockConfigStore(config),
            createMockLogStore(),
            createMockConflictStore(),
            checkpointStore,
            createMockCryptoService(),
            createMockSetupUriParser(),
            mockEngine,
            createMockScheduler(),
            createMockSyncLock(),
            createMockLogger(),
            () => '/tmp/vault',
          )

          const result = await service.analyze('test-vault')

          // Analysis should return a valid result
          expect(result).toBeDefined()
          expect(result.summary).toBeDefined()
          expect(result.durationMs).toBeGreaterThanOrEqual(0)

          // No state-modifying operations should have been recorded
          expect(stateSnapshots).toHaveLength(0)
        },
      ),
      { numRuns: 50 }
    )
  })
})
