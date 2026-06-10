import { writeFile, mkdir, stat, unlink, readdir, readFile, utimes } from 'node:fs/promises'
import { join, dirname, relative } from 'node:path'
import crypto from 'node:crypto'
import type {
  ISyncEngine,
  ICryptoService,
  SyncConnectionParams,
  ConnectionTestResult,
  PullParams,
  PullResult,
  PushParams,
  PushResult,
  AnalyzeParams,
  AnalysisResult,
  AnalysisDetail,
  SyncErrorDetail,
  ConflictEntry,
  PulledFileDetail,
  PushedFileDetail,
} from './types.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Timeout for connection test requests (10 seconds). */
const CONNECTION_TEST_TIMEOUT_MS = 10_000

/** Timeout for Changes Feed requests (30 seconds). */
const CHANGES_FEED_TIMEOUT_MS = 30_000

/** Timeout for individual push requests (30 seconds). */
const PUSH_REQUEST_TIMEOUT_MS = 30_000

/** Timeout for analysis operations (120 seconds). */
const ANALYSIS_TIMEOUT_MS = 120_000

/**
 * Paths and patterns that should be excluded from sync.
 * These are directories that should not be written to the vault during pull operations.
 * Note: .obsidian/ is intentionally NOT excluded — Obsidian config files are synced
 * to maintain plugin settings, themes, and workspace configuration across devices.
 */
const EXCLUDED_PATH_PREFIXES = [
  '.trash/',
  '.mobile/',
] as const

/**
 * Exact file paths that indicate internal/metadata documents
 * which should not be synced as vault files.
 */
const EXCLUDED_EXACT_PATHS = [] as const

/**
 * obsidian-livesync internal document IDs that are NOT file paths.
 * These are metadata documents stored in CouchDB alongside vault content.
 * They must be skipped during sync to avoid creating spurious files.
 */
const LIVESYNC_INTERNAL_DOC_IDS = new Set([
  'obsydian_livesync_version',  // Chunk format version (note: original typo in livesync)
  'syncinfo',                    // Sync state metadata
  'client-config',              // Client configuration (sync settings shared between devices)
  'client-config.yml',          // P2P network configuration (peerId, networkId, addresses)
])

// ─── Helper Types ────────────────────────────────────────────────────────────

/** A CouchDB document from the Changes Feed. */
interface CouchDBChange {
  seq: string
  id: string
  changes: Array<{ rev: string }>
  deleted?: boolean
  doc?: CouchDBDocument
}

/** A CouchDB document with metadata. */
interface CouchDBDocument {
  _id: string
  _rev: string
  /** CouchDB-level deletion (tombstone). Set only when `deleteMetadataOfDeletedFiles` is enabled. */
  _deleted?: boolean
  /**
   * obsidian-livesync body-level deletion flag.
   * By default (deleteMetadataOfDeletedFiles=false), deleted/moved files keep a LIVE document
   * with `deleted: true` instead of using CouchDB's `_deleted`. Must be honored to avoid
   * resurrecting deleted files and origin paths of moved files.
   */
  deleted?: boolean
  path?: string
  data?: string
  /** Document type in obsidian-livesync: 'leaf' for chunk data, 'plain' or undefined for regular docs. */
  type?: string
  /** Array of chunk IDs referencing leaf documents that contain the actual content. */
  children?: string[]
  ctime?: number
  mtime?: number
  size?: number
  eden?: Record<string, unknown>
}

/** CouchDB Changes Feed response. */
interface ChangesResponse {
  results: CouchDBChange[]
  last_seq: string
}

// ─── SyncEngine ──────────────────────────────────────────────────────────────

/**
 * CouchDB communication engine.
 * Handles direct HTTP interaction with the CouchDB instance using native fetch().
 */
export class SyncEngine implements ISyncEngine {
  private readonly cryptoService: ICryptoService

  constructor(cryptoService: ICryptoService) {
    this.cryptoService = cryptoService
  }

  /**
   * Tests the connection to a CouchDB instance.
   * Performs a GET request to the database endpoint with a 10s timeout.
   * If the database does not exist (404), attempts to create it via PUT.
   * @param config - Connection parameters (endpoint, database, username, password).
   * @returns Connection test result indicating reachability and authentication status.
   */
  async testConnection(config: SyncConnectionParams): Promise<ConnectionTestResult> {
    const url = `${config.endpoint}/${config.database}`
    const headers = buildAuthHeaders(config.username, config.password)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.status === 401 || response.status === 403) {
        return { reachable: true, authenticated: false, error: 'Authentication failed' }
      }

      if (response.ok) {
        return { reachable: true, authenticated: true }
      }

      // Database does not exist — attempt to create it
      if (response.status === 404) {
        return this.createDatabase(config)
      }

      return {
        reachable: true,
        authenticated: false,
        error: `Unexpected status code: ${response.status}`,
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        return { reachable: false, authenticated: false, error: 'Connection timed out (10s)' }
      }

      const message = error instanceof Error ? error.message : 'Unknown connection error'
      return { reachable: false, authenticated: false, error: message }
    }
  }

  /**
   * Attempts to create a CouchDB database via PUT.
   * Called when testConnection receives a 404 (database does not exist).
   * @param config - Connection parameters.
   * @returns Connection test result — success if database was created, error otherwise.
   */
  private async createDatabase(config: SyncConnectionParams): Promise<ConnectionTestResult> {
    const url = `${config.endpoint}/${config.database}`
    const headers = buildAuthHeaders(config.username, config.password)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.status === 401 || response.status === 403) {
        return {
          reachable: true,
          authenticated: false,
          error: 'Database does not exist and user lacks permission to create it',
        }
      }

      if (response.ok || response.status === 201) {
        return { reachable: true, authenticated: true }
      }

      // 412 = database already exists (race condition — fine)
      if (response.status === 412) {
        return { reachable: true, authenticated: true }
      }

      return {
        reachable: true,
        authenticated: false,
        error: `Database does not exist and creation failed (status ${response.status})`,
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        return { reachable: false, authenticated: false, error: 'Connection timed out (10s)' }
      }

      const message = error instanceof Error ? error.message : 'Unknown connection error'
      return { reachable: false, authenticated: false, error: message }
    }
  }

  /**
   * Performs a pull from CouchDB using the Changes Feed API.
   * Fetches changed documents since the last checkpoint and writes them to the vault.
   * Handles chunk reassembly for obsidian-livesync fragmented documents.
   * @param params - Pull parameters including connection, vault path, and checkpoint.
   * @returns Pull result with status, new sequence, pulled count, conflicts, and errors.
   */
  async pull(params: PullParams): Promise<PullResult> {
    const { connection, vaultPath, since, localMtimes, e2eEnabled, e2ePassphrase } = params

    // Fetch changes from CouchDB
    const changesResult = await this.fetchChanges(connection, since)
    if (changesResult.error) {
      return {
        status: changesResult.error === 'auth_failed' ? 'auth_failed' : 'connection_failed',
        newLastSeq: since ?? '0',
        pulledCount: 0,
        conflicts: [],
        errors: [],
      }
    }

    const { results, lastSeq } = changesResult

    // Separate documents into regular docs, headers, and chunks
    // categorizeDocuments also resolves children→leaf references internally
    const { regularDocs, headers, chunks, leafDocs, missingLeafIds } = categorizeDocuments(results)

    // Fetch missing leaf documents from CouchDB (not in the changes feed but referenced by children)
    if (missingLeafIds.size > 0) {
      await this.fetchMissingLeaves(connection, missingLeafIds, leafDocs)
    }

    // Re-resolve content for documents that had missing children
    for (const doc of regularDocs) {
      if (doc.content === undefined && doc.contentChunks === undefined && !doc.deleted) {
        // Find the original CouchDB document to get children array
        const originalChange = results.find(c => c.doc && (c.doc.path === doc.path || stripLiveSyncPrefix(c.doc.path ?? '') === doc.path))
        const originalDoc = originalChange?.doc
        if (originalDoc?.children && originalDoc.children.length > 0) {
          const parts: string[] = []
          for (const childId of originalDoc.children) {
            const leafData = leafDocs.get(childId)
            if (leafData !== undefined) {
              parts.push(leafData)
            }
          }
          if (parts.length > 0) {
            if (doc.isBinary) {
              // Binary: keep chunks separate for correct per-chunk base64 decoding
              doc.contentChunks = parts
            } else {
              // Text: join chunks (raw UTF-8 text)
              doc.content = parts.join('')
            }
          }
        }
      }
    }

    // Reassemble chunked documents (headers with children or legacy chunks)
    const reassembled = reassembleChunkedDocuments(headers, chunks, leafDocs)

    // Merge regular docs and reassembled docs, deduplicating by path.
    // Use a Map so that each path appears only once.
    // Regular docs (from the main document ID) represent the canonical state.
    // If a regular doc is marked deleted, it overrides any reassembled version.
    const allDocsMap = new Map<string, ProcessedDocument>()
    // First add reassembled docs (from h: headers)
    for (const doc of reassembled) {
      if (doc.path) {
        allDocsMap.set(doc.path, doc)
      }
    }
    // Then regular docs overwrite — they represent the canonical document state.
    // A deleted regular doc means the file should be deleted, even if a header exists.
    for (const doc of regularDocs) {
      if (doc.path) {
        allDocsMap.set(doc.path, doc)
      }
    }
    const allDocs = [...allDocsMap.values()]

    let pulledCount = 0
    const errors: SyncErrorDetail[] = []
    const conflicts: ConflictEntry[] = []
    const pulledFiles: PulledFileDetail[] = []
    const deletedFilePaths: string[] = []

    for (const doc of allDocs) {
      if (!doc.path) {
        continue
      }

      const relativePath = sanitizePathForPlatform(doc.path)
      const localPath = join(vaultPath, relativePath)

      // Handle deleted documents
      if (doc.deleted) {
        try {
          await unlink(localPath)
          pulledCount++
          deletedFilePaths.push(relativePath)
        } catch {
          // File doesn't exist locally — not an error
        }
        continue
      }

      // Pre-write mtime check for conflict detection
      const checkpointMtime = localMtimes[relativePath]
      if (checkpointMtime !== undefined) {
        try {
          const fileStat = await stat(localPath)
          if (fileStat.mtimeMs > checkpointMtime) {
            // Local file was modified since last sync — conflict!
            conflicts.push({
              documentPath: relativePath,
              local: {
                modifiedAt: new Date(fileStat.mtimeMs).toISOString(),
                size: fileStat.size,
              },
              remote: {
                revision: doc.rev,
                modifiedAt: doc.mtime ? new Date(doc.mtime).toISOString() : new Date().toISOString(),
                size: estimateDocSize(doc),
              },
              detectedAt: new Date().toISOString(),
            })
            continue
          }
        } catch {
          // File doesn't exist locally — no conflict, proceed with write
        }
      }

      // Decrypt content if E2E is enabled, or decode binary from base64 chunks
      let content: Buffer
      try {
        if (e2eEnabled && e2ePassphrase && (doc.content || doc.contentChunks)) {
          // E2E: the entire content is a single base64-encoded encrypted blob
          const rawData = doc.content ?? (doc.contentChunks ? doc.contentChunks.join('') : '')
          const encrypted = Buffer.from(rawData, 'base64')
          content = this.cryptoService.decryptDocument(encrypted, e2ePassphrase)
        } else if (doc.isBinary && doc.contentChunks) {
          // Binary files: each chunk is independently base64-encoded by obsidian-livesync.
          // Decode each chunk separately and concatenate the resulting byte buffers.
          const buffers = doc.contentChunks.map(chunk => Buffer.from(chunk, 'base64'))
          content = Buffer.concat(buffers)
        } else if (doc.isBinary && doc.content) {
          // Binary file with single data field (non-chunked or legacy)
          content = Buffer.from(doc.content, 'base64')
        } else {
          // Text file: content is raw UTF-8 text
          content = Buffer.from(doc.content ?? '', 'utf8')
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Decryption failed'
        errors.push({
          documentPath: relativePath,
          errorType: 'decryption_failed',
          description: message.slice(0, 500),
        })
        continue
      }

      // Write file atomically (temp → rename), but skip if content is identical
      try {
        // Content comparison: skip writing if local file already has identical content
        // (matches livesync's isDocContentSame check in dbToStorage)
        let shouldWrite = true
        try {
          const existingContent = await readFile(localPath)
          if (existingContent.equals(content)) {
            shouldWrite = false
            // Content identical — only update mtime if CouchDB has a different one
            if (doc.mtime) {
              const mtimeSec = doc.mtime / 1000
              await utimes(localPath, mtimeSec, mtimeSec)
            }
          }
        } catch {
          // File doesn't exist locally — proceed with write
        }

        if (shouldWrite) {
          await mkdir(dirname(localPath), { recursive: true })
          const tempPath = `${localPath}.${crypto.randomBytes(8).toString('hex')}.tmp`
          await writeFile(tempPath, content)
          const { rename } = await import('node:fs/promises')
          await rename(tempPath, localPath)

          // Set file mtime to match the CouchDB document's mtime (like livesync does)
          if (doc.mtime) {
            const mtimeSec = doc.mtime / 1000
            await utimes(localPath, mtimeSec, mtimeSec)
          }

          pulledCount++
          pulledFiles.push({
            path: relativePath,
            size: content.length,
            isBinary: doc.isBinary ?? false,
            ...(doc.contentChunks && doc.contentChunks.length > 1 ? { chunkCount: doc.contentChunks.length } : {}),
          })
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Write failed'
        errors.push({
          documentPath: relativePath,
          errorType: 'write_failed',
          description: message.slice(0, 500),
        })
      }
    }

    const status = errors.length === 0
      ? 'success'
      : pulledCount > 0
        ? 'partial_success'
        : 'failed'

    return {
      status,
      newLastSeq: lastSeq,
      pulledCount,
      conflicts,
      errors: errors.slice(0, 100),
      pulledFiles,
      deletedFiles: deletedFilePaths,
      changeCount: results.length,
    }
  }

  /**
   * Performs a push of local changes to CouchDB.
   * Detects local changes via mtime comparison with checkpoint, sends to CouchDB.
   * Handles deleted local files by marking them as `_deleted: true` in CouchDB.
   * @param params - Push parameters including connection, vault path, and checkpoint mtimes.
   * @returns Push result with status, pushed count, and errors.
   */
  async push(params: PushParams): Promise<PushResult> {
    const { connection, vaultPath, localMtimes, e2eEnabled, e2ePassphrase } = params

    // Scan local vault directory recursively
    let currentFiles: Map<string, number>
    try {
      currentFiles = await scanVaultFiles(vaultPath)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to scan vault directory'
      return {
        status: 'failed',
        pushedCount: 0,
        errors: [{ documentPath: '', errorType: 'read_failed', description: message.slice(0, 500) }],
      }
    }

    // Determine changed files (mtime > checkpoint mtime) OR new files (not in checkpoint)
    const changedFiles: string[] = []
    // Also track files that are in checkpoint but may need verification against CouchDB.
    // These are files whose mtime matches the checkpoint (unchanged locally) but might
    // be missing from CouchDB (e.g. if a previous push was recorded in checkpoint but
    // the document was later deleted from CouchDB, or the database was recreated).
    const verifyFiles: string[] = []
    for (const [filePath, mtime] of currentFiles) {
      const checkpointMtime = localMtimes[filePath]
      if (checkpointMtime === undefined || mtime > checkpointMtime) {
        changedFiles.push(filePath)
      } else {
        // File exists locally and in checkpoint with matching mtime — verify it's actually in CouchDB
        verifyFiles.push(filePath)
      }
    }

    // Determine deleted files (in checkpoint but not on disk)
    const deletedFiles: string[] = []
    for (const filePath of Object.keys(localMtimes)) {
      if (!currentFiles.has(filePath)) {
        deletedFiles.push(filePath)
      }
    }

    let pushedCount = 0
    const errors: SyncErrorDetail[] = []
    const pushedFiles: PushedFileDetail[] = []
    const pushDeletedFiles: string[] = []

    // Push changed files
    for (const filePath of changedFiles) {
      if (errors.length >= 100) break

      try {
        const absolutePath = join(vaultPath, filePath)
        let content: Buffer = await readFile(absolutePath)
        const originalSize = content.length

        // Get the local file's mtime for the CouchDB document
        const fileMtime = currentFiles.get(filePath)

        // Encrypt content if E2E is enabled
        if (e2eEnabled && e2ePassphrase) {
          try {
            content = this.cryptoService.encryptDocument(content, e2ePassphrase)
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Encryption failed'
            errors.push({
              documentPath: filePath,
              errorType: 'encryption_failed',
              description: message.slice(0, 500),
            })
            continue
          }
        }

        // Convert local (possibly sanitized) path back to original CouchDB document ID
        const couchDbPath = desanitizePathForCouchDB(filePath)

        // First, get the current revision from CouchDB (if document exists)
        const rev = await this.getDocumentRevision(connection, couchDbPath)

        // Push to CouchDB via PUT (using local file's mtime, not Date.now())
        const pushResult = await this.putDocument(connection, couchDbPath, content, rev, e2eEnabled, fileMtime)
        if (pushResult.success) {
          pushedCount++
          pushedFiles.push({ path: filePath, size: originalSize })
        } else {
          errors.push({
            documentPath: filePath,
            errorType: 'write_failed',
            description: pushResult.error.slice(0, 500),
          })
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Read failed'
        errors.push({
          documentPath: filePath,
          errorType: 'read_failed',
          description: message.slice(0, 500),
        })
      }
    }

    // Push deletions
    for (const filePath of deletedFiles) {
      if (errors.length >= 100) break

      try {
        // Convert local (possibly sanitized) path back to original CouchDB document ID
        const couchDbPath = desanitizePathForCouchDB(filePath)
        const rev = await this.getDocumentRevision(connection, couchDbPath)
        if (rev) {
          // Document exists in CouchDB — mark as deleted
          const deleteResult = await this.deleteDocument(connection, couchDbPath, rev)
          if (deleteResult.success) {
            pushedCount++
            pushDeletedFiles.push(filePath)
          } else {
            errors.push({
              documentPath: filePath,
              errorType: 'write_failed',
              description: deleteResult.error.slice(0, 500),
            })
          }
        }
        // If no rev, document doesn't exist in CouchDB — nothing to delete
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Delete failed'
        errors.push({
          documentPath: filePath,
          errorType: 'write_failed',
          description: message.slice(0, 500),
        })
      }
    }

    // Verify files that are in checkpoint (mtime unchanged) but might be missing from CouchDB.
    // This handles the case where a file was previously synced (checkpoint has it) but CouchDB
    // lost the document (database recreated, compaction issue, or previous push not actually committed).
    for (const filePath of verifyFiles) {
      if (errors.length >= 100) break

      try {
        const couchDbPath = desanitizePathForCouchDB(filePath)
        const rev = await this.getDocumentRevision(connection, couchDbPath)
        if (rev === null) {
          // File is in checkpoint but NOT in CouchDB — push it
          const absolutePath = join(vaultPath, filePath)
          let content: Buffer = await readFile(absolutePath)
          const originalSize = content.length
          const fileMtime = currentFiles.get(filePath)

          if (e2eEnabled && e2ePassphrase) {
            try {
              content = this.cryptoService.encryptDocument(content, e2ePassphrase)
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Encryption failed'
              errors.push({
                documentPath: filePath,
                errorType: 'encryption_failed',
                description: message.slice(0, 500),
              })
              continue
            }
          }

          const pushResult = await this.putDocument(connection, couchDbPath, content, null, e2eEnabled, fileMtime)
          if (pushResult.success) {
            pushedCount++
            pushedFiles.push({ path: filePath, size: originalSize })
          } else {
            errors.push({
              documentPath: filePath,
              errorType: 'write_failed',
              description: pushResult.error.slice(0, 500),
            })
          }
        }
        // If rev exists, file is in CouchDB and mtime is unchanged — nothing to do
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Verify failed'
        errors.push({
          documentPath: filePath,
          errorType: 'read_failed',
          description: message.slice(0, 500),
        })
      }
    }

    const status = errors.length === 0
      ? 'success'
      : pushedCount > 0
        ? 'partial_success'
        : (changedFiles.length === 0 && deletedFiles.length === 0 && verifyFiles.length === 0)
          ? 'success'
          : 'failed'

    return {
      status,
      pushedCount,
      errors: errors.slice(0, 100),
      pushedFiles,
      deletedFiles: pushDeletedFiles,
      changedFileCount: changedFiles.length,
      deletedFileCount: deletedFiles.length,
    }
  }

  /**
   * Determines differences between vault and CouchDB (analysis mode).
   * Queries the Changes Feed and compares with local state without writing.
   * Categorizes documents into: remote_newer, local_newer, remote_only, local_only, conflict, identical.
   * @param params - Analysis parameters including connection, vault path, and checkpoint.
   * @returns Analysis result with summary and details.
   */
  async analyze(params: AnalyzeParams): Promise<AnalysisResult> {
    const startTime = Date.now()
    const { connection, vaultPath, since, localMtimes } = params

    // Set up analysis timeout (120s)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS)

    try {
      // Fetch changes from CouchDB
      const changesResult = await this.fetchChanges(connection, since)
      if (changesResult.error) {
        clearTimeout(timeoutId)
        return createEmptyAnalysisResult(Date.now() - startTime)
      }

      const { results, lastSeq: _lastSeq } = changesResult

      // Check timeout
      if (controller.signal.aborted) {
        return createEmptyAnalysisResult(Date.now() - startTime)
      }

      // Build remote state map from changes feed
      const { regularDocs, headers, chunks, leafDocs, missingLeafIds } = categorizeDocuments(results)

      // Fetch missing leaf documents for complete content resolution
      if (missingLeafIds.size > 0) {
        await this.fetchMissingLeaves(connection, missingLeafIds, leafDocs)
      }

      const reassembled = reassembleChunkedDocuments(headers, chunks, leafDocs)
      const allRemoteDocs = [...regularDocs, ...reassembled]

      // Build remote state: path → { rev, mtime, size, deleted }
      // Paths are sanitized for the current platform so they match local filesystem paths.
      const remoteState = new Map<string, { rev: string; mtime: number; size: number; deleted: boolean }>()
      for (const doc of allRemoteDocs) {
        if (!doc.path) continue
        const sanitizedPath = sanitizePathForPlatform(doc.path)
        remoteState.set(sanitizedPath, {
          rev: doc.rev,
          mtime: doc.mtime ?? 0,
          size: estimateDocSize(doc),
          deleted: doc.deleted,
        })
      }

      // Scan local vault files
      let localFiles: Map<string, { mtime: number; size: number }>
      try {
        localFiles = await scanVaultFilesWithSize(vaultPath)
      } catch {
        localFiles = new Map()
      }

      // Check timeout
      if (controller.signal.aborted) {
        return createEmptyAnalysisResult(Date.now() - startTime)
      }

      // Categorize all documents
      const details: AnalysisDetail[] = []
      const allPaths = new Set<string>([...remoteState.keys(), ...localFiles.keys()])

      for (const path of allPaths) {
        const remote = remoteState.get(path)
        const local = localFiles.get(path)
        const checkpointMtime = localMtimes[path]

        // Skip deleted remote documents that don't exist locally
        if (remote?.deleted && !local) continue

        const detail = categorizeDocument(path, local, remote, checkpointMtime)
        details.push(detail)
      }

      // Build summary
      const summary = buildAnalysisSummary(details)

      clearTimeout(timeoutId)
      return {
        summary,
        details,
        durationMs: Date.now() - startTime,
      }
    } catch {
      clearTimeout(timeoutId)
      return createEmptyAnalysisResult(Date.now() - startTime)
    }
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  /**
   * Fetches the CouchDB Changes Feed.
   * If the database does not exist (404), attempts to create it and retries.
   */
  private async fetchChanges(
    connection: SyncConnectionParams,
    since: string | null,
  ): Promise<{ results: CouchDBChange[]; lastSeq: string; error?: undefined } | { results?: undefined; lastSeq?: undefined; error: 'connection_failed' | 'auth_failed' }> {
    const sinceParam = since ?? '0'
    const url = `${connection.endpoint}/${connection.database}/_changes?since=${encodeURIComponent(sinceParam)}&include_docs=true`
    const headers = buildAuthHeaders(connection.username, connection.password)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CHANGES_FEED_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.status === 401 || response.status === 403) {
        return { error: 'auth_failed' }
      }

      // Database does not exist — attempt to create it, then retry
      if (response.status === 404) {
        const createResult = await this.createDatabase(connection)
        if (!createResult.reachable || !createResult.authenticated) {
          return { error: 'connection_failed' }
        }
        // After creation, the database is empty — return empty results
        return { results: [], lastSeq: '0' }
      }

      if (!response.ok) {
        return { error: 'connection_failed' }
      }

      const data = await response.json() as ChangesResponse
      return { results: data.results, lastSeq: data.last_seq }
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        return { error: 'connection_failed' }
      }
      return { error: 'connection_failed' }
    }
  }

  /**
   * Fetches missing leaf documents from CouchDB using _all_docs with keys.
   * Leaf documents contain chunk data referenced by the `children` array of parent documents.
   * Uses POST _all_docs?include_docs=true with a keys array for efficient bulk retrieval.
   */
  private async fetchMissingLeaves(
    connection: SyncConnectionParams,
    missingIds: Set<string>,
    leafDocs: Map<string, string>,
  ): Promise<void> {
    if (missingIds.size === 0) return

    const url = `${connection.endpoint}/${connection.database}/_all_docs?include_docs=true`
    const headers = buildAuthHeaders(connection.username, connection.password)
    const keys = [...missingIds]

    // Batch in groups of 200 to avoid overly large requests
    const BATCH_SIZE = 200
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), CHANGES_FEED_TIMEOUT_MS)

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ keys: batch }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) continue

        const data = await response.json() as {
          rows: Array<{
            id: string
            doc?: { _id: string; data?: string; type?: string }
            error?: string
          }>
        }

        for (const row of data.rows) {
          if (row.doc && row.doc.data !== undefined) {
            leafDocs.set(row.doc._id, row.doc.data)
          }
        }
      } catch {
        clearTimeout(timeoutId)
        // Continue with partial data — some leaves may still be missing
      }
    }
  }

  /**
   * Gets the current revision of a document from CouchDB.
   * Returns null if the document doesn't exist.
   */
  private async getDocumentRevision(connection: SyncConnectionParams, docId: string): Promise<string | null> {
    const url = `${connection.endpoint}/${connection.database}/${encodeURIComponent(docId)}`
    const headers = buildAuthHeaders(connection.username, connection.password)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PUSH_REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        return null
      }

      // CouchDB returns the revision in the ETag header
      const etag = response.headers.get('etag')
      if (etag) {
        // ETag is quoted: "1-abc123"
        return etag.replace(/"/g, '')
      }

      return null
    } catch {
      clearTimeout(timeoutId)
      return null
    }
  }

  /**
   * Pushes a document to CouchDB via PUT.
   * Produces a livesync-compatible document with correct type, encoding, and metadata.
   */
  private async putDocument(
    connection: SyncConnectionParams,
    docId: string,
    content: Buffer,
    rev: string | null,
    e2eEnabled: boolean,
    fileMtime?: number,
  ): Promise<{ success: boolean; error: string }> {
    const url = `${connection.endpoint}/${connection.database}/${encodeURIComponent(docId)}`
    const headers = buildAuthHeaders(connection.username, connection.password)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PUSH_REQUEST_TIMEOUT_MS)

    // Determine document type based on file extension (matching livesync's isPlainText)
    const isBinary = isBinaryPath(docId)
    const type = isBinary ? 'newnote' : 'plain'

    // Encode content:
    // - E2E enabled: always base64 (encrypted blob)
    // - Binary: base64 (livesync stores binary data as base64 in the data field)
    // - Text: raw UTF-8 string
    let data: string
    if (e2eEnabled) {
      data = content.toString('base64')
    } else if (isBinary) {
      data = content.toString('base64')
    } else {
      data = content.toString('utf8')
    }

    // Use the local file's mtime (like livesync does) instead of Date.now()
    // This ensures the CouchDB document reflects the actual file modification time,
    // preventing the analysis from incorrectly flagging it as "remote_newer" after push.
    const mtime = fileMtime ?? Date.now()

    // Build the CouchDB document body (livesync-compatible format)
    const body: Record<string, unknown> = {
      _id: docId,
      path: docId,
      type,
      data,
      children: [],
      ctime: mtime,
      mtime,
      size: content.length,
      eden: {},
    }

    if (rev) {
      body['_rev'] = rev
    }

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok || response.status === 201) {
        return { success: true, error: '' }
      }

      const responseText = await response.text().catch(() => '')
      return { success: false, error: `CouchDB PUT failed with status ${response.status}: ${responseText}`.slice(0, 500) }
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      const message = error instanceof Error ? error.message : 'Push request failed'
      return { success: false, error: message }
    }
  }

  /**
   * Marks a document as deleted in CouchDB using livesync-compatible body-level deletion.
   * Sets `deleted: true` in the document body (livesync default behavior).
   * The document remains alive in CouchDB (no `_deleted` tombstone) so it survives compaction
   * and is properly recognized by obsidian-livesync clients.
   */
  private async deleteDocument(
    connection: SyncConnectionParams,
    docId: string,
    rev: string,
  ): Promise<{ success: boolean; error: string }> {
    // First, fetch the existing document to preserve its fields
    const getUrl = `${connection.endpoint}/${connection.database}/${encodeURIComponent(docId)}`
    const headers = buildAuthHeaders(connection.username, connection.password)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PUSH_REQUEST_TIMEOUT_MS)

    try {
      // Fetch existing document to get its type and other metadata
      const getResponse = await fetch(getUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      let existingDoc: Record<string, unknown> = {}
      if (getResponse.ok) {
        existingDoc = await getResponse.json() as Record<string, unknown>
      }

      // Build the deletion document: keep metadata, set deleted flag, clear content
      const body: Record<string, unknown> = {
        _id: docId,
        _rev: rev,
        path: existingDoc['path'] ?? docId,
        type: existingDoc['type'] ?? 'plain',
        deleted: true,
        mtime: Date.now(),
        size: 0,
        ctime: existingDoc['ctime'] ?? Date.now(),
        children: [],
        eden: {},
      }

      const putResponse = await fetch(getUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (putResponse.ok || putResponse.status === 201) {
        return { success: true, error: '' }
      }

      const responseText = await putResponse.text().catch(() => '')
      return { success: false, error: `CouchDB DELETE failed with status ${putResponse.status}: ${responseText}`.slice(0, 500) }
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      const message = error instanceof Error ? error.message : 'Delete request failed'
      return { success: false, error: message }
    }
  }
}

// ─── Pure Helper Functions ───────────────────────────────────────────────────

/** Processed document ready for writing to the vault. */
interface ProcessedDocument {
  path: string
  content: string | undefined
  /**
   * Individual chunk strings for binary files.
   * Each chunk is independently base64-encoded by obsidian-livesync.
   * Must be decoded per-chunk and then concatenated as bytes.
   * Only populated for binary documents (type "newnote").
   */
  contentChunks: string[] | undefined
  rev: string
  mtime?: number
  deleted: boolean
  /** Whether the content is base64-encoded binary data (determined by document type field). */
  isBinary: boolean
}

/**
 * Estimates the decoded byte size of a processed document.
 * For binary documents with chunks, estimates from base64 length.
 * For text documents, uses UTF-8 byte length.
 */
function estimateDocSize(doc: ProcessedDocument): number {
  if (doc.contentChunks) {
    // Each chunk is base64: decoded size ≈ base64Length * 3/4
    return doc.contentChunks.reduce((sum, chunk) => sum + Math.floor(chunk.length * 3 / 4), 0)
  }
  if (doc.content) {
    return Buffer.byteLength(doc.content, 'utf8')
  }
  return 0
}

/**
 * Builds HTTP Basic Auth headers for CouchDB requests.
 */
function buildAuthHeaders(username: string, password: string): Record<string, string> {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64')
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Categorizes CouchDB changes into regular documents, headers, and chunks.
 * obsidian-livesync uses several document formats:
 * - Regular documents: contain `data` field directly with file content
 * - Documents with `children`: reference leaf documents that hold the actual content chunks
 * - `h:<path>` for document headers (contains metadata and chunk references)
 * - Leaf documents (`type: "leaf"`): contain chunk data, referenced by `children` arrays
 * - `_local/*` and `_design/*`: CouchDB internal documents (skipped)
 * - Documents with `i:`, `ps:`, `ix:` prefixes: Obsidian internal files
 */
function categorizeDocuments(results: CouchDBChange[]): {
  regularDocs: ProcessedDocument[]
  headers: Map<string, CouchDBDocument>
  chunks: Map<string, Map<number, string>>
  /** Leaf documents found in the changes feed (id → data). */
  leafDocs: Map<string, string>
  /** Leaf IDs referenced by documents but not found in the changes feed. */
  missingLeafIds: Set<string>
} {
  // Use a Map to deduplicate: if a document appears multiple times in the feed
  // (e.g. created then deleted), only the LAST version wins.
  const regularDocsMap = new Map<string, ProcessedDocument>()
  const headers = new Map<string, CouchDBDocument>()
  const chunks = new Map<string, Map<number, string>>()

  // First pass: collect all leaf documents (type: "leaf") into a lookup map
  const leafDocs = new Map<string, string>()
  for (const change of results) {
    const doc = change.doc
    if (!doc) continue
    if (doc.type === 'leaf' && doc.data !== undefined) {
      leafDocs.set(doc._id, doc.data)
    }
  }

  // Track all referenced leaf IDs to identify missing ones
  const allReferencedLeafIds = new Set<string>()

  // Second pass: categorize documents
  for (const change of results) {
    const doc = change.doc

    // Handle deleted changes that may not have a full doc object
    if (!doc) {
      if (change.deleted && change.id) {
        // Deleted document without doc body — derive path from change ID
        const id = change.id
        if (id.startsWith('_') || id.startsWith('chunk:') || id.startsWith('h:')) continue
        const rawPath = derivePathFromId(id)
        const path = rawPath ? stripLiveSyncPrefix(rawPath) : null
        if (path && !isExcludedPath(path)) {
          regularDocsMap.set(path, {
            path,
            content: undefined,
            contentChunks: undefined,
            rev: change.changes[0]?.rev ?? '',
            deleted: true,
            isBinary: isBinaryPath(path),
          })
        }
      }
      continue
    }

    const id = doc._id

    // Skip leaf documents — they are chunk data, not files
    if (doc.type === 'leaf') {
      continue
    }

    // Skip CouchDB internal documents
    if (id.startsWith('_')) {
      continue
    }

    if (id.startsWith('h:')) {
      // Header document for chunked content (last version wins via Map)
      // Preserve the deletion status from the change entry.
      // obsidian-livesync marks deleted/moved files with body-level `deleted: true`
      // (default), or CouchDB `_deleted` when deleteMetadataOfDeletedFiles is enabled.
      if (change.deleted || doc._deleted || doc.deleted) {
        doc._deleted = true
      }
      headers.set(id, doc)
      // Track children references from headers (only if not deleted)
      if (doc.children && !doc._deleted) {
        for (const childId of doc.children) {
          allReferencedLeafIds.add(childId)
        }
      }
    } else if (id.startsWith('chunk:')) {
      // Legacy chunk document format (chunk:<id>:<index>)
      const parts = id.split(':')
      if (parts.length >= 3) {
        const chunkId = parts[1]!
        const index = parseInt(parts[2]!, 10)
        if (!isNaN(index) && chunkId) {
          if (!chunks.has(chunkId)) {
            chunks.set(chunkId, new Map())
          }
          chunks.get(chunkId)!.set(index, doc.data ?? '')
        }
      }
    } else {
      // Regular document — may have content in `data` or in `children` (leaf references)
      const rawPath = doc.path ?? derivePathFromId(id)
      const path = rawPath ? stripLiveSyncPrefix(rawPath) : null
      if (!path) continue

      // Skip excluded paths (Obsidian config, trash, etc.)
      if (isExcludedPath(path)) continue

      // Track children references
      if (doc.children) {
        for (const childId of doc.children) {
          allReferencedLeafIds.add(childId)
        }
      }

      // Determine binary/text from document type field (obsidian-livesync convention):
      // "newnote" = binary, "plain" = text, undefined/other = fallback to path-based detection
      const isBinary = doc.type === 'newnote' ? true : doc.type === 'plain' ? false : isBinaryPath(path)

      // Resolve content: either direct `data` field or reassemble from `children` leaf references
      let content: string | undefined = undefined
      let contentChunks: string[] | undefined = undefined
      if (doc.children && doc.children.length > 0) {
        // Content is split across leaf documents referenced by `children` array
        const parts: string[] = []
        let allChunksFound = true
        for (const childId of doc.children) {
          const leafData = leafDocs.get(childId)
          if (leafData !== undefined) {
            parts.push(leafData)
          } else {
            allChunksFound = false
          }
        }
        if (allChunksFound && parts.length > 0) {
          if (isBinary) {
            // Binary: keep chunks separate — each is independently base64-encoded
            contentChunks = parts
          } else {
            // Text: join chunks (they are raw UTF-8 text strings)
            content = parts.join('')
          }
        }
        // If not all chunks found, leave content/contentChunks undefined — will be resolved after fetching missing leaves
      } else {
        content = doc.data
      }

      const docEntry: ProcessedDocument = {
        path,
        content,
        contentChunks,
        rev: doc._rev,
        // Honor all three deletion signals:
        // - change.deleted / doc._deleted: CouchDB tombstone (deleteMetadataOfDeletedFiles=true)
        // - doc.deleted: obsidian-livesync body-level deletion (default for deleted/moved files)
        deleted: change.deleted ?? doc._deleted ?? doc.deleted ?? false,
        isBinary,
      }
      if (doc.mtime !== undefined) {
        docEntry.mtime = doc.mtime
      }
      // Map keyed by path — later entries overwrite earlier ones (last version wins)
      regularDocsMap.set(path, docEntry)
    }
  }

  // Determine which leaf IDs are missing from the changes feed
  const missingLeafIds = new Set<string>()
  for (const leafId of allReferencedLeafIds) {
    if (!leafDocs.has(leafId)) {
      missingLeafIds.add(leafId)
    }
  }

  return { regularDocs: [...regularDocsMap.values()], headers, chunks, leafDocs, missingLeafIds }
}

/**
 * Reassembles chunked documents from headers and their chunks.
 * A header document (h:<path>) references chunks by ID.
 * Chunks are ordered by index and concatenated to form the full content.
 * Also handles the `children` field which references leaf documents.
 * Binary documents (type "newnote") keep chunks separate for correct base64 decoding.
 */
function reassembleChunkedDocuments(
  headers: Map<string, CouchDBDocument>,
  chunks: Map<string, Map<number, string>>,
  leafDocs?: Map<string, string>,
): ProcessedDocument[] {
  const reassembled: ProcessedDocument[] = []

  for (const [headerId, headerDoc] of headers) {
    // Extract path from header ID: h:<path>
    const rawPath = headerId.slice(2) // Remove 'h:' prefix
    if (!rawPath) continue

    // Strip livesync prefixes from the path
    const path = headerDoc.path ? stripLiveSyncPrefix(headerDoc.path) : stripLiveSyncPrefix(rawPath)

    // Skip excluded paths (Obsidian config, trash, etc.)
    if (isExcludedPath(path)) continue

    // Determine binary/text from document type field (obsidian-livesync convention):
    // "newnote" = binary, "plain" = text, undefined/other = fallback to path-based detection
    const isBinary = headerDoc.type === 'newnote' ? true : headerDoc.type === 'plain' ? false : isBinaryPath(path)

    // Try to resolve content from multiple sources:
    // 1. `children` array referencing leaf documents
    // 2. Legacy `chunk:<id>:<index>` documents
    // 3. Direct `data` field on the header
    let content: string | undefined = undefined
    let contentChunks: string[] | undefined = undefined

    if (headerDoc.children && headerDoc.children.length > 0 && leafDocs && leafDocs.size > 0) {
      // Resolve content from children (leaf document references)
      const parts: string[] = []
      for (const childId of headerDoc.children) {
        const leafData = leafDocs.get(childId)
        if (leafData !== undefined) {
          parts.push(leafData)
        }
      }
      if (parts.length > 0) {
        if (isBinary) {
          // Binary: keep chunks separate — each is independently base64-encoded
          contentChunks = parts
        } else {
          // Text: join chunks (they are raw UTF-8 text strings)
          content = parts.join('')
        }
      }
    }

    if (content === undefined && contentChunks === undefined) {
      // Try legacy chunk format
      const chunkId = rawPath
      const docChunks = chunks.get(chunkId)

      if (docChunks && docChunks.size > 0) {
        // Sort chunks by index and concatenate
        const sortedIndices = [...docChunks.keys()].sort((a, b) => a - b)
        const parts = sortedIndices.map(idx => docChunks.get(idx) ?? '')
        if (isBinary) {
          contentChunks = parts
        } else {
          content = parts.join('')
        }
      }
    }

    if (content === undefined && contentChunks === undefined) {
      // Fallback: use header data directly
      content = headerDoc.data
    }

    const entry: ProcessedDocument = {
      path,
      content,
      contentChunks,
      rev: headerDoc._rev,
      // headerDoc._deleted is normalized in categorizeDocuments to cover body-level `deleted` too
      deleted: headerDoc._deleted ?? headerDoc.deleted ?? false,
      isBinary,
    }
    if (headerDoc.mtime !== undefined) {
      entry.mtime = headerDoc.mtime
    }
    reassembled.push(entry)
  }

  return reassembled
}

/**
 * Known obsidian-livesync document ID prefixes.
 * These prefixes categorize documents in CouchDB but are NOT part of the file path.
 * - `i:` — internal files (.obsidian/ directory, plugin configs)
 * - `ps:` — plugin settings
 * - `ix:` — index files
 */
const LIVESYNC_PATH_PREFIXES = ['i:', 'ps:', 'ix:'] as const

/**
 * Strips obsidian-livesync prefixes from a document ID or path to get the actual file path.
 * These prefixes are metadata markers in CouchDB and must not appear in filesystem paths
 * (especially on Windows where ':' is illegal in file/directory names).
 */
function stripLiveSyncPrefix(idOrPath: string): string {
  for (const prefix of LIVESYNC_PATH_PREFIXES) {
    if (idOrPath.startsWith(prefix)) {
      return idOrPath.slice(prefix.length)
    }
  }
  return idOrPath
}

/**
 * Derives a file path from a CouchDB document ID.
 * obsidian-livesync typically stores the path directly in the document,
 * but as a fallback, the document ID itself can be used as the path.
 * Strips known livesync prefixes (i:, ps:, ix:) that are not part of the actual file path.
 */
function derivePathFromId(id: string): string | null {
  // Skip internal CouchDB documents
  if (id.startsWith('_')) return null
  // Skip obsidian-livesync internal metadata documents (not file paths)
  if (LIVESYNC_INTERNAL_DOC_IDS.has(id)) return null
  // Skip documents that look like leaf/chunk hashes (no file extension, hex-like)
  if (isLikelyLeafId(id)) return null
  // Strip obsidian-livesync prefixes and use as path
  return stripLiveSyncPrefix(id)
}

/**
 * Checks whether a document ID looks like an obsidian-livesync leaf/chunk hash.
 * Leaf documents have IDs that are hex strings or hash-like identifiers
 * without any file extension or path separator.
 * Examples: "a1b2c3d4e5f6", "h:+abc123def456"
 */
function isLikelyLeafId(id: string): boolean {
  // If it contains a path separator or file extension, it's likely a real file path
  if (id.includes('/') || id.includes('.')) return false
  // If it starts with a known prefix that indicates a file, it's not a leaf
  if (id.startsWith('i:') || id.startsWith('ps:') || id.startsWith('ix:')) return false
  // Pure hex strings of 16+ characters are likely leaf/chunk hashes
  if (/^[0-9a-f]{16,}$/i.test(id)) return true
  // IDs starting with + followed by hex are livesync internal
  if (/^\+[0-9a-f]+$/i.test(id)) return true
  return false
}

/**
 * Checks whether a file path should be excluded from sync.
 * Excludes Obsidian configuration directories, trash, and other internal paths.
 */
function isExcludedPath(path: string): boolean {
  // Check exact matches
  for (const exact of EXCLUDED_EXACT_PATHS) {
    if (path === exact) return true
  }
  // Check prefix matches (directories)
  for (const prefix of EXCLUDED_PATH_PREFIXES) {
    if (path.startsWith(prefix)) return true
  }
  // Exclude internal Slatebase files (underscore-prefixed filenames).
  // These are derived indexes (e.g. _link-index.json) that should not be synced.
  // CouchDB also rejects document IDs starting with underscore (reserved for _design, _local, etc.)
  const fileName = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
  if (fileName.startsWith('_')) return true
  return false
}

/**
 * File extensions that obsidian-livesync treats as plain text (type "plain").
 * Matches the `isPlainText()` function in livesync-commonlib/src/string_and_binary/path.ts.
 * Everything NOT in this set is treated as binary (type "newnote") and stored as base64 chunks.
 */
const PLAIN_TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.svg', '.html', '.csv', '.css', '.js', '.xml', '.canvas',
])

/**
 * Determines whether a file path refers to a binary file based on its extension.
 * This is a fallback used only when the document's `type` field is not available.
 * Matches obsidian-livesync's convention: files with known text extensions are plain,
 * everything else is binary.
 */
function isBinaryPath(path: string): boolean {
  const lastDot = path.lastIndexOf('.')
  if (lastDot === -1) return true // No extension → assume binary
  const ext = path.slice(lastDot).toLowerCase()
  return !PLAIN_TEXT_EXTENSIONS.has(ext)
}

/**
 * Characters that are illegal in Windows file/directory names.
 * On Linux/macOS only `/` and null are illegal, but since Slatebase may run on Windows,
 * we sanitize these characters when detected in paths coming from CouchDB.
 *
 * The replacement uses Unicode full-width equivalents (like Obsidian does on Windows):
 * `|` → `｜` (U+FF5C), `<` → `＜` (U+FF1C), `>` → `＞` (U+FF1E),
 * `:` → `：` (U+FF1A), `"` → `＂` (U+FF02), `?` → `？` (U+FF1F), `*` → `＊` (U+FF0A)
 *
 * Note: `/` and `\` are path separators and handled by `join()`.
 * Colon `:` is only illegal in the filename portion (not as drive letter prefix),
 * so we only sanitize it within individual path segments.
 */
const WINDOWS_ILLEGAL_CHARS: ReadonlyMap<string, string> = new Map([
  ['|', '\uFF5C'],  // ｜
  ['<', '\uFF1C'],  // ＜
  ['>', '\uFF1E'],  // ＞
  [':', '\uFF1A'],  // ：
  ['"', '\uFF02'],  // ＂
  ['?', '\uFF1F'],  // ？
  ['*', '\uFF0A'],  // ＊
])

/**
 * Sanitizes a relative file path for the current platform.
 * On Windows, replaces illegal characters in each path segment with Unicode full-width equivalents.
 * On Linux/macOS, returns the path unchanged.
 */
function sanitizePathForPlatform(relativePath: string): string {
  if (process.platform !== 'win32') {
    return relativePath
  }
  // Split by forward slash (CouchDB paths always use forward slash)
  const segments = relativePath.split('/')
  const sanitized = segments.map(segment => {
    let result = segment
    for (const [illegal, replacement] of WINDOWS_ILLEGAL_CHARS) {
      result = result.replaceAll(illegal, replacement)
    }
    return result
  })
  return sanitized.join('/')
}

/**
 * Reverses sanitizePathForPlatform: converts full-width Unicode replacements back to
 * their ASCII originals for use as CouchDB document IDs when pushing.
 * On Linux/macOS, returns the path unchanged.
 */
function desanitizePathForCouchDB(localRelativePath: string): string {
  if (process.platform !== 'win32') {
    return localRelativePath
  }
  const segments = localRelativePath.split('/')
  const desanitized = segments.map(segment => {
    let result = segment
    for (const [original, fullWidth] of WINDOWS_ILLEGAL_CHARS) {
      result = result.replaceAll(fullWidth, original)
    }
    return result
  })
  return desanitized.join('/')
}

/**
 * Recursively scans a vault directory and returns a map of relative paths to mtimes.
 */
async function scanVaultFiles(vaultPath: string): Promise<Map<string, number>> {
  const files = new Map<string, number>()
  await scanDirectory(vaultPath, vaultPath, files)
  return files
}

/**
 * Recursively scans a vault directory and returns a map of relative paths to { mtime, size }.
 */
async function scanVaultFilesWithSize(vaultPath: string): Promise<Map<string, { mtime: number; size: number }>> {
  const files = new Map<string, { mtime: number; size: number }>()
  await scanDirectoryWithSize(vaultPath, vaultPath, files)
  return files
}

/**
 * Recursively scans a directory, populating the files map with relative paths and mtimes.
 * Skips excluded directories (.trash, .mobile).
 */
async function scanDirectory(basePath: string, currentPath: string, files: Map<string, number>): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name)
    if (entry.isDirectory()) {
      // Skip excluded directories
      const relativeDirPath = relative(basePath, fullPath).replace(/\\/g, '/') + '/'
      if (isExcludedPath(relativeDirPath)) continue
      await scanDirectory(basePath, fullPath, files)
    } else if (entry.isFile()) {
      const relativePath = relative(basePath, fullPath).replace(/\\/g, '/')
      if (isExcludedPath(relativePath)) continue
      const fileStat = await stat(fullPath)
      files.set(relativePath, fileStat.mtimeMs)
    }
  }
}

/**
 * Recursively scans a directory, populating the files map with relative paths, mtimes, and sizes.
 * Skips excluded directories (.trash, .mobile).
 */
async function scanDirectoryWithSize(basePath: string, currentPath: string, files: Map<string, { mtime: number; size: number }>): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name)
    if (entry.isDirectory()) {
      // Skip excluded directories
      const relativeDirPath = relative(basePath, fullPath).replace(/\\/g, '/') + '/'
      if (isExcludedPath(relativeDirPath)) continue
      await scanDirectoryWithSize(basePath, fullPath, files)
    } else if (entry.isFile()) {
      const relativePath = relative(basePath, fullPath).replace(/\\/g, '/')
      if (isExcludedPath(relativePath)) continue
      const fileStat = await stat(fullPath)
      files.set(relativePath, { mtime: fileStat.mtimeMs, size: fileStat.size })
    }
  }
}

/**
 * Categorizes a single document based on local and remote state.
 */
function categorizeDocument(
  path: string,
  local: { mtime: number; size: number } | undefined,
  remote: { rev: string; mtime: number; size: number; deleted: boolean } | undefined,
  checkpointMtime: number | undefined,
): AnalysisDetail {
  // Remote only (exists in CouchDB but not locally)
  if (remote && !remote.deleted && !local) {
    const detail: AnalysisDetail = {
      path,
      category: 'remote_only',
      remoteRevision: remote.rev,
      remoteSize: remote.size,
    }
    if (remote.mtime) {
      detail.remoteModifiedAt = new Date(remote.mtime).toISOString()
    }
    return detail
  }

  // Local only (exists locally but not in CouchDB)
  if (!remote && local) {
    return {
      path,
      category: 'local_only',
      localModifiedAt: new Date(local.mtime).toISOString(),
      localSize: local.size,
    }
  }

  // Remote deleted but local exists
  if (remote?.deleted && local) {
    // If there's no checkpoint entry for this file, it was created locally after the last sync.
    // In that case, it's effectively "local only" — not "remote deleted".
    if (checkpointMtime === undefined) {
      return {
        path,
        category: 'local_only',
        localModifiedAt: new Date(local.mtime).toISOString(),
        localSize: local.size,
      }
    }
    // File existed at last checkpoint and was deleted remotely — should be removed on next sync
    return {
      path,
      category: 'remote_deleted',
      remoteRevision: remote.rev,
      localModifiedAt: new Date(local.mtime).toISOString(),
      localSize: local.size,
      remoteSize: 0,
    }
  }

  // Both exist — compare
  if (remote && !remote.deleted && local) {
    // Determine if local was modified since the last sync checkpoint.
    // If checkpointMtime is undefined (first sync), we can't determine local changes.
    const localChangedSinceCheckpoint = checkpointMtime !== undefined && local.mtime > checkpointMtime

    // For remote changes: if we have a checkpoint, check if remote.mtime is newer than checkpoint.
    // If no checkpoint exists, any remote document with mtime > 0 is considered "existing".
    const remoteChangedSinceCheckpoint = checkpointMtime !== undefined && remote.mtime > checkpointMtime

    // Both modified since checkpoint — conflict
    if (localChangedSinceCheckpoint && remoteChangedSinceCheckpoint) {
      return {
        path,
        category: 'conflict',
        remoteRevision: remote.rev,
        localModifiedAt: new Date(local.mtime).toISOString(),
        remoteModifiedAt: new Date(remote.mtime).toISOString(),
        localSize: local.size,
        remoteSize: remote.size,
      }
    }

    // Local changed since checkpoint but remote did not — local is newer
    if (localChangedSinceCheckpoint && !remoteChangedSinceCheckpoint) {
      return {
        path,
        category: 'local_newer',
        remoteRevision: remote.rev,
        localModifiedAt: new Date(local.mtime).toISOString(),
        remoteModifiedAt: new Date(remote.mtime).toISOString(),
        localSize: local.size,
        remoteSize: remote.size,
      }
    }

    // Remote changed since checkpoint but local did not — remote is newer
    if (!localChangedSinceCheckpoint && remoteChangedSinceCheckpoint) {
      return {
        path,
        category: 'remote_newer',
        remoteRevision: remote.rev,
        localModifiedAt: new Date(local.mtime).toISOString(),
        remoteModifiedAt: new Date(remote.mtime).toISOString(),
        localSize: local.size,
        remoteSize: remote.size,
      }
    }

    // Neither changed since checkpoint (or no checkpoint) — identical
    // This covers the common case after a successful sync: local mtime may differ
    // from remote mtime (local = write time, remote = original edit time in Obsidian),
    // but since neither changed since the checkpoint, they are in sync.
    return {
      path,
      category: 'identical',
      remoteRevision: remote.rev,
      localModifiedAt: new Date(local.mtime).toISOString(),
      remoteModifiedAt: new Date(remote.mtime).toISOString(),
      localSize: local.size,
      remoteSize: remote.size,
    }
  }

  // Fallback — shouldn't happen but handle gracefully
  return {
    path,
    category: 'identical',
  }
}

/**
 * Builds the analysis summary from the detail list.
 */
function buildAnalysisSummary(details: AnalysisDetail[]): AnalysisResult['summary'] {
  const summary: AnalysisResult['summary'] = {
    remote_newer: { count: 0, totalBytes: 0 },
    local_newer: { count: 0, totalBytes: 0 },
    remote_only: { count: 0, totalBytes: 0 },
    local_only: { count: 0, totalBytes: 0 },
    remote_deleted: { count: 0, totalBytes: 0 },
    conflict: { count: 0, totalBytes: 0 },
    identical: { count: 0, totalBytes: 0 },
  }

  for (const detail of details) {
    const cat = summary[detail.category]
    cat.count++
    // Use the larger of local/remote size for the category total
    const size = Math.max(detail.localSize ?? 0, detail.remoteSize ?? 0)
    cat.totalBytes += size
  }

  return summary
}

/**
 * Creates an empty analysis result (used for error/timeout cases).
 */
function createEmptyAnalysisResult(durationMs: number): AnalysisResult {
  return {
    summary: {
      remote_newer: { count: 0, totalBytes: 0 },
      local_newer: { count: 0, totalBytes: 0 },
      remote_only: { count: 0, totalBytes: 0 },
      local_only: { count: 0, totalBytes: 0 },
      remote_deleted: { count: 0, totalBytes: 0 },
      conflict: { count: 0, totalBytes: 0 },
      identical: { count: 0, totalBytes: 0 },
    },
    details: [],
    durationMs,
  }
}

// Export pure functions for testing
export {
  buildAuthHeaders,
  categorizeDocuments,
  reassembleChunkedDocuments,
  derivePathFromId,
  stripLiveSyncPrefix,
  isLikelyLeafId,
  isExcludedPath,
  isBinaryPath,
  scanVaultFiles,
  scanVaultFilesWithSize,
  categorizeDocument,
  buildAnalysisSummary,
  createEmptyAnalysisResult,
}
