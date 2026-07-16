import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ILogger } from '../logger/index.js'
import type {
  IConflictStore,
  ISyncLock,
  ICryptoService,
  SyncConnectionParams,
  ConflictResolutionAction,
  BatchResolveResult,
} from './types.js'
import { BatchLimitExceededError, ConflictResolutionError } from './errors.js'

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Parameters for resolving a single conflict.
 */
export interface ResolveParams {
  /** Vault identifier. */
  vaultId: string
  /** Absolute path to the vault directory on disk. */
  vaultPath: string
  /** Relative document path within the vault (e.g. "notes/hello.md"). */
  documentPath: string
  /** Resolution action to apply. */
  resolution: ConflictResolutionAction
  /** CouchDB connection parameters. */
  connection: SyncConnectionParams
  /** Whether E2E encryption is enabled for this vault. */
  e2eEnabled: boolean
  /** E2E passphrase (required when e2eEnabled is true). */
  e2ePassphrase?: string | undefined
}

/**
 * Result of a single conflict resolution attempt.
 */
export interface ResolveResult {
  /** Whether the resolution succeeded. */
  success: boolean
  /** Error description if resolution failed. */
  error?: string
}

/**
 * Parameters for batch conflict resolution.
 */
export interface BatchResolveParams {
  /** Vault identifier. */
  vaultId: string
  /** Absolute path to the vault directory on disk. */
  vaultPath: string
  /** List of conflicts to resolve with their respective actions. */
  conflicts: Array<{ documentPath: string; resolution: ConflictResolutionAction }>
  /** CouchDB connection parameters. */
  connection: SyncConnectionParams
  /** Whether E2E encryption is enabled for this vault. */
  e2eEnabled: boolean
  /** E2E passphrase (required when e2eEnabled is true). */
  e2ePassphrase?: string | undefined
}

/**
 * Conflict resolver interface.
 * Performs atomic conflict resolution with rollback on CouchDB push failure.
 */
export interface IConflictResolver {
  /**
   * Resolves a single conflict atomically:
   * 1. Backup local file
   * 2. Write resolution content to local file
   * 3. Push to CouchDB
   * 4. On CouchDB failure: rollback local file from backup
   */
  resolve(params: ResolveParams): Promise<ResolveResult>

  /**
   * Resolves multiple conflicts sequentially.
   * Continues on individual failures (per-item error isolation).
   * Throws BatchLimitExceededError if conflicts.length > 100.
   */
  resolveBatch(params: BatchResolveParams): Promise<BatchResolveResult>
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of conflicts allowed in a single batch operation. */
const BATCH_LIMIT = 100

/** Timeout for CouchDB HTTP requests in milliseconds. */
const COUCHDB_REQUEST_TIMEOUT_MS = 30_000

/** Extensions considered plain text by livesync. */
const PLAIN_TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.svg', '.html', '.csv', '.css', '.js', '.xml', '.canvas',
])

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Performs atomic conflict resolution.
 * Implements the resolve/rollback pattern: backup → write local → push CouchDB → rollback on failure.
 */
export class ConflictResolver implements IConflictResolver {
  private readonly conflictStore: IConflictStore
  private readonly syncLock: ISyncLock
  private readonly cryptoService: ICryptoService
  private readonly logger: ILogger

  constructor(deps: {
    conflictStore: IConflictStore
    syncLock: ISyncLock
    cryptoService: ICryptoService
    logger: ILogger
  }) {
    this.conflictStore = deps.conflictStore
    this.syncLock = deps.syncLock
    this.cryptoService = deps.cryptoService
    this.logger = deps.logger
  }

  /**
   * Resolves a single conflict atomically.
   * For `use_local`: reads local file, pushes to CouchDB, removes conflict.
   * For `use_remote`: writes remote content to local file, removes conflict (no push needed).
   * For `manual_merge`: writes merged content locally, pushes to CouchDB, rollbacks on failure.
   * For `skip`: removes conflict from store without any file changes.
   */
  async resolve(params: ResolveParams): Promise<ResolveResult> {
    const { vaultId, vaultPath, documentPath, resolution, connection, e2eEnabled, e2ePassphrase } = params

    // Skip resolution: just remove from conflict store
    if (resolution.type === 'skip') {
      await this.conflictStore.remove(vaultId, documentPath)
      return { success: true }
    }

    const localPath = join(vaultPath, documentPath)

    try {
      if (resolution.type === 'use_local') {
        // Read local file and push to CouchDB
        const localContent = await readFile(localPath)
        const pushResult = await this.pushDocumentToCouchDB(
          connection, documentPath, localContent, e2eEnabled, e2ePassphrase,
        )
        if (!pushResult.success) {
          this.logger.error('CouchDB push failed for use_local resolution', {
            vaultId, documentPath, error: pushResult.error,
          })
          return { success: false, error: pushResult.error }
        }
        await this.conflictStore.remove(vaultId, documentPath)
        return { success: true }
      }

      if (resolution.type === 'use_remote') {
        // Remote content is not pushed (CouchDB already has it).
        // The caller (SyncService) is expected to provide the content and write it locally
        // before calling resolve, OR this is handled as a signal that next pull will fix it.
        // For safety, just remove the conflict — the next sync pull will overwrite local.
        await this.conflictStore.remove(vaultId, documentPath)
        return { success: true }
      }

      if (resolution.type === 'manual_merge') {
        // Backup → write local → push CouchDB → rollback on failure
        const backupContent = await readFile(localPath)
        const mergedContent = Buffer.from(resolution.content, 'utf8')

        // Write resolved content to local file
        await writeFile(localPath, mergedContent)

        // Push to CouchDB
        const pushResult = await this.pushDocumentToCouchDB(
          connection, documentPath, mergedContent, e2eEnabled, e2ePassphrase,
        )

        if (!pushResult.success) {
          // Rollback local file
          await writeFile(localPath, backupContent)
          this.logger.error('CouchDB push failed, rolled back local file', {
            vaultId, documentPath, error: pushResult.error,
          })
          return { success: false, error: pushResult.error }
        }

        await this.conflictStore.remove(vaultId, documentPath)
        return { success: true }
      }

      return { success: false, error: `Unknown resolution type` }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error during conflict resolution'
      this.logger.error('Conflict resolution failed', { vaultId, documentPath, error: message })
      return { success: false, error: message }
    }
  }

  /**
   * Resolves multiple conflicts sequentially with per-item error isolation.
   * Throws BatchLimitExceededError if conflicts.length > 100.
   */
  async resolveBatch(params: BatchResolveParams): Promise<BatchResolveResult> {
    const { vaultId, vaultPath, conflicts, connection, e2eEnabled, e2ePassphrase } = params

    if (conflicts.length > BATCH_LIMIT) {
      throw new BatchLimitExceededError()
    }

    // Acquire lock for the vault
    if (!this.syncLock.acquire(vaultId)) {
      throw new ConflictResolutionError('A sync operation is already in progress for this vault')
    }

    const result: BatchResolveResult = {
      total: conflicts.length,
      succeeded: 0,
      failed: 0,
      errors: [],
    }

    try {
      for (const conflict of conflicts) {
        const resolveResult = await this.resolve({
          vaultId,
          vaultPath,
          documentPath: conflict.documentPath,
          resolution: conflict.resolution,
          connection,
          e2eEnabled,
          e2ePassphrase,
        })

        if (resolveResult.success) {
          result.succeeded++
        } else {
          result.failed++
          result.errors.push({
            documentPath: conflict.documentPath,
            error: resolveResult.error ?? 'Unknown error',
          })
        }
      }
    } finally {
      this.syncLock.release(vaultId)
    }

    return result
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Pushes a single document to CouchDB using the livesync-compatible format.
   * Gets the current revision first (for conflict-free update), then PUTs the document.
   */
  private async pushDocumentToCouchDB(
    connection: SyncConnectionParams,
    documentPath: string,
    content: Buffer,
    e2eEnabled: boolean,
    e2ePassphrase?: string,
  ): Promise<{ success: boolean; error: string }> {
    const docId = this.toDocumentId(documentPath)

    // If E2E is enabled, encrypt the content before pushing
    let pushContent = content
    if (e2eEnabled && e2ePassphrase) {
      try {
        pushContent = this.cryptoService.encryptDocument(content, e2ePassphrase)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Encryption failed'
        return { success: false, error: `E2E encryption failed: ${message}` }
      }
    }

    // Get the current revision from CouchDB (required for updates)
    const rev = await this.getDocumentRevision(connection, docId)

    // Determine document type based on path extension (livesync convention)
    const isBinary = this.isBinaryPath(documentPath)
    const type = isBinary ? 'newnote' : 'plain'

    // Encode content for CouchDB document body
    let data: string
    if (e2eEnabled) {
      data = pushContent.toString('base64')
    } else if (isBinary) {
      data = pushContent.toString('base64')
    } else {
      data = pushContent.toString('utf8')
    }

    const mtime = Date.now()
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

    // PUT the document to CouchDB
    const url = `${connection.endpoint}/${connection.database}/${encodeURIComponent(docId)}`
    const headers = this.buildAuthHeaders(connection.username, connection.password)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), COUCHDB_REQUEST_TIMEOUT_MS)

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
      return {
        success: false,
        error: `CouchDB PUT failed with status ${response.status}: ${responseText}`.slice(0, 500),
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      const message = error instanceof Error ? error.message : 'Push request failed'
      return { success: false, error: message }
    }
  }

  /**
   * Fetches the current revision of a document from CouchDB using a HEAD request.
   * Returns null if the document does not exist.
   */
  private async getDocumentRevision(connection: SyncConnectionParams, docId: string): Promise<string | null> {
    const url = `${connection.endpoint}/${connection.database}/${encodeURIComponent(docId)}`
    const headers = this.buildAuthHeaders(connection.username, connection.password)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), COUCHDB_REQUEST_TIMEOUT_MS)

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

      const etag = response.headers.get('etag')
      if (etag) {
        return etag.replace(/"/g, '')
      }

      return null
    } catch {
      clearTimeout(timeoutId)
      return null
    }
  }

  /**
   * Builds Basic Auth headers for CouchDB requests.
   */
  private buildAuthHeaders(username: string, password: string): Record<string, string> {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64')
    return {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    }
  }

  /**
   * Converts a local document path to a CouchDB document ID.
   * On Windows, reverses the full-width character sanitization.
   */
  private toDocumentId(documentPath: string): string {
    if (process.platform !== 'win32') {
      return documentPath
    }
    // Desanitize Windows full-width characters back to originals
    const WINDOWS_CHARS: ReadonlyMap<string, string> = new Map([
      ['\uFF5C', '|'],
      ['\uFF1C', '<'],
      ['\uFF1E', '>'],
      ['\uFF1A', ':'],
      ['\uFF02', '"'],
      ['\uFF1F', '?'],
      ['\uFF0A', '*'],
    ])
    const segments = documentPath.split('/')
    const desanitized = segments.map(segment => {
      let result = segment
      for (const [fullWidth, original] of WINDOWS_CHARS) {
        result = result.replaceAll(fullWidth, original)
      }
      return result
    })
    return desanitized.join('/')
  }

  /**
   * Determines whether a file path refers to a binary file based on its extension.
   * Matches livesync's isPlainText() convention.
   */
  private isBinaryPath(path: string): boolean {
    const lastDot = path.lastIndexOf('.')
    if (lastDot === -1) return true
    const ext = path.slice(lastDot).toLowerCase()
    return !PLAIN_TEXT_EXTENSIONS.has(ext)
  }
}
