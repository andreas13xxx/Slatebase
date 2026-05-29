import { writeFile, mkdir, stat, unlink, readdir, readFile } from 'node:fs/promises'
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
  _deleted?: boolean
  path?: string
  data?: string
  type?: string
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
    const { regularDocs, headers, chunks } = categorizeDocuments(results)

    // Reassemble chunked documents
    const reassembled = reassembleChunkedDocuments(headers, chunks)

    // Merge regular docs and reassembled docs
    const allDocs = [...regularDocs, ...reassembled]

    let pulledCount = 0
    const errors: SyncErrorDetail[] = []
    const conflicts: ConflictEntry[] = []

    for (const doc of allDocs) {
      if (!doc.path) {
        continue
      }

      const relativePath = doc.path
      const localPath = join(vaultPath, relativePath)

      // Handle deleted documents
      if (doc.deleted) {
        try {
          await unlink(localPath)
          pulledCount++
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
                size: doc.content ? Buffer.byteLength(doc.content, 'utf8') : 0,
              },
              detectedAt: new Date().toISOString(),
            })
            continue
          }
        } catch {
          // File doesn't exist locally — no conflict, proceed with write
        }
      }

      // Decrypt content if E2E is enabled
      let content: Buffer
      try {
        if (e2eEnabled && e2ePassphrase && doc.content) {
          const encrypted = Buffer.from(doc.content, 'base64')
          content = this.cryptoService.decryptDocument(encrypted, e2ePassphrase)
        } else {
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

      // Write file atomically (temp → rename)
      try {
        await mkdir(dirname(localPath), { recursive: true })
        const tempPath = `${localPath}.${crypto.randomBytes(8).toString('hex')}.tmp`
        await writeFile(tempPath, content)
        const { rename } = await import('node:fs/promises')
        await rename(tempPath, localPath)
        pulledCount++
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

    // Determine changed files (mtime > checkpoint mtime)
    const changedFiles: string[] = []
    for (const [filePath, mtime] of currentFiles) {
      const checkpointMtime = localMtimes[filePath]
      if (checkpointMtime === undefined || mtime > checkpointMtime) {
        changedFiles.push(filePath)
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

    // Push changed files
    for (const filePath of changedFiles) {
      if (errors.length >= 100) break

      try {
        const absolutePath = join(vaultPath, filePath)
        let content: Buffer = await readFile(absolutePath)

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

        // First, get the current revision from CouchDB (if document exists)
        const rev = await this.getDocumentRevision(connection, filePath)

        // Push to CouchDB via PUT
        const pushResult = await this.putDocument(connection, filePath, content, rev, e2eEnabled)
        if (pushResult.success) {
          pushedCount++
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
        const rev = await this.getDocumentRevision(connection, filePath)
        if (rev) {
          // Document exists in CouchDB — mark as deleted
          const deleteResult = await this.deleteDocument(connection, filePath, rev)
          if (deleteResult.success) {
            pushedCount++
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

    const status = errors.length === 0
      ? 'success'
      : pushedCount > 0
        ? 'partial_success'
        : (changedFiles.length === 0 && deletedFiles.length === 0)
          ? 'success'
          : 'failed'

    return {
      status,
      pushedCount,
      errors: errors.slice(0, 100),
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
      const { regularDocs, headers, chunks } = categorizeDocuments(results)
      const reassembled = reassembleChunkedDocuments(headers, chunks)
      const allRemoteDocs = [...regularDocs, ...reassembled]

      // Build remote state: path → { rev, mtime, size, deleted }
      const remoteState = new Map<string, { rev: string; mtime: number; size: number; deleted: boolean }>()
      for (const doc of allRemoteDocs) {
        if (!doc.path) continue
        remoteState.set(doc.path, {
          rev: doc.rev,
          mtime: doc.mtime ?? 0,
          size: doc.content ? Buffer.byteLength(doc.content, 'utf8') : 0,
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
   */
  private async putDocument(
    connection: SyncConnectionParams,
    docId: string,
    content: Buffer,
    rev: string | null,
    e2eEnabled: boolean,
  ): Promise<{ success: boolean; error: string }> {
    const url = `${connection.endpoint}/${connection.database}/${encodeURIComponent(docId)}`
    const headers = buildAuthHeaders(connection.username, connection.password)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PUSH_REQUEST_TIMEOUT_MS)

    // Build the CouchDB document body
    const body: Record<string, unknown> = {
      _id: docId,
      path: docId,
      data: e2eEnabled ? content.toString('base64') : content.toString('utf8'),
      mtime: Date.now(),
      size: content.length,
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
   * Marks a document as deleted in CouchDB via PUT with _deleted: true.
   */
  private async deleteDocument(
    connection: SyncConnectionParams,
    docId: string,
    rev: string,
  ): Promise<{ success: boolean; error: string }> {
    const url = `${connection.endpoint}/${connection.database}/${encodeURIComponent(docId)}`
    const headers = buildAuthHeaders(connection.username, connection.password)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PUSH_REQUEST_TIMEOUT_MS)

    const body = {
      _id: docId,
      _rev: rev,
      _deleted: true,
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
      return { success: false, error: `CouchDB DELETE failed with status ${response.status}: ${responseText}`.slice(0, 500) }
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
  rev: string
  mtime?: number
  deleted: boolean
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
 * obsidian-livesync uses:
 * - `h:<path>` for document headers (contains metadata and chunk references)
 * - `chunk:<id>:<index>` for document chunks (contains data fragments)
 * - Regular document IDs for non-chunked documents
 */
function categorizeDocuments(results: CouchDBChange[]): {
  regularDocs: ProcessedDocument[]
  headers: Map<string, CouchDBDocument>
  chunks: Map<string, Map<number, string>>
} {
  const regularDocs: ProcessedDocument[] = []
  const headers = new Map<string, CouchDBDocument>()
  const chunks = new Map<string, Map<number, string>>()

  for (const change of results) {
    const doc = change.doc
    if (!doc) continue

    const id = doc._id

    if (id.startsWith('h:')) {
      // Header document for chunked content
      headers.set(id, doc)
    } else if (id.startsWith('chunk:')) {
      // Chunk document
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
      // Regular document
      const path = doc.path ?? derivePathFromId(id)
      if (path) {
        const docEntry: ProcessedDocument = {
          path,
          content: doc.data,
          rev: doc._rev,
          deleted: change.deleted ?? doc._deleted ?? false,
        }
        if (doc.mtime !== undefined) {
          docEntry.mtime = doc.mtime
        }
        regularDocs.push(docEntry)
      }
    }
  }

  return { regularDocs, headers, chunks }
}

/**
 * Reassembles chunked documents from headers and their chunks.
 * A header document (h:<path>) references chunks by ID.
 * Chunks are ordered by index and concatenated to form the full content.
 */
function reassembleChunkedDocuments(
  headers: Map<string, CouchDBDocument>,
  chunks: Map<string, Map<number, string>>,
): ProcessedDocument[] {
  const reassembled: ProcessedDocument[] = []

  for (const [headerId, headerDoc] of headers) {
    // Extract path from header ID: h:<path>
    const path = headerId.slice(2) // Remove 'h:' prefix
    if (!path) continue

    // Get the chunk ID — in obsidian-livesync, the chunk ID is typically the path
    const chunkId = path
    const docChunks = chunks.get(chunkId)

    if (docChunks && docChunks.size > 0) {
      // Sort chunks by index and concatenate
      const sortedIndices = [...docChunks.keys()].sort((a, b) => a - b)
      const content = sortedIndices.map(idx => docChunks.get(idx) ?? '').join('')

      const entry: ProcessedDocument = {
        path: headerDoc.path ?? path,
        content,
        rev: headerDoc._rev,
        deleted: headerDoc._deleted ?? false,
      }
      if (headerDoc.mtime !== undefined) {
        entry.mtime = headerDoc.mtime
      }
      reassembled.push(entry)
    } else {
      // Header without chunks — use header data directly
      const entry: ProcessedDocument = {
        path: headerDoc.path ?? path,
        content: headerDoc.data,
        rev: headerDoc._rev,
        deleted: headerDoc._deleted ?? false,
      }
      if (headerDoc.mtime !== undefined) {
        entry.mtime = headerDoc.mtime
      }
      reassembled.push(entry)
    }
  }

  return reassembled
}

/**
 * Derives a file path from a CouchDB document ID.
 * obsidian-livesync typically stores the path directly in the document,
 * but as a fallback, the document ID itself can be used as the path.
 */
function derivePathFromId(id: string): string | null {
  // Skip internal CouchDB documents
  if (id.startsWith('_')) return null
  // Use the ID as the path (obsidian-livesync convention)
  return id
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
 */
async function scanDirectory(basePath: string, currentPath: string, files: Map<string, number>): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name)
    if (entry.isDirectory()) {
      await scanDirectory(basePath, fullPath, files)
    } else if (entry.isFile()) {
      const relativePath = relative(basePath, fullPath).replace(/\\/g, '/')
      const fileStat = await stat(fullPath)
      files.set(relativePath, fileStat.mtimeMs)
    }
  }
}

/**
 * Recursively scans a directory, populating the files map with relative paths, mtimes, and sizes.
 */
async function scanDirectoryWithSize(basePath: string, currentPath: string, files: Map<string, { mtime: number; size: number }>): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name)
    if (entry.isDirectory()) {
      await scanDirectoryWithSize(basePath, fullPath, files)
    } else if (entry.isFile()) {
      const relativePath = relative(basePath, fullPath).replace(/\\/g, '/')
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

  // Remote deleted but local exists — treat as remote_only (remote wants deletion)
  if (remote?.deleted && local) {
    return {
      path,
      category: 'remote_newer',
      remoteRevision: remote.rev,
      localModifiedAt: new Date(local.mtime).toISOString(),
      localSize: local.size,
      remoteSize: 0,
    }
  }

  // Both exist — compare
  if (remote && !remote.deleted && local) {
    const localChanged = checkpointMtime !== undefined && local.mtime > checkpointMtime
    const remoteChanged = remote.mtime > 0

    // Both modified since checkpoint — conflict
    if (localChanged && remoteChanged && checkpointMtime !== undefined && remote.mtime > checkpointMtime) {
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

    // Remote is newer
    if (remote.mtime > local.mtime) {
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

    // Local is newer
    if (local.mtime > remote.mtime) {
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

    // Same mtime — identical
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
  scanVaultFiles,
  scanVaultFilesWithSize,
  categorizeDocument,
  buildAnalysisSummary,
  createEmptyAnalysisResult,
}
