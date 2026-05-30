// API Router Layer — Route modules and controllers

import fs from 'node:fs/promises'
import path from 'node:path'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'

export { UserController, UserRouteModule } from './userRoutes.js'
import type { IVaultService } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import {
  VaultNotFoundError,
  VaultValidationError,
  StorageError,
  FileTooLargeError as BusinessFileTooLargeError,
  ConflictError,
  InvalidMoveError,
  FileConflictError as BusinessFileConflictError,
  InvalidNameError,
  VaultAccessDeniedError,
  VaultHasActiveSharesError,
} from '../business/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { PathTraversalError } from '../vault/index.js'
import type { IVaultShareRegistry } from '../vault/registry.js'
import type { IImportService, UploadedFile } from '../import/index.js'
import type { IUserRepository } from '../user/index.js'
import type { ISyncConfigStore } from '../sync/index.js'
import {
  InvalidFilenameError,
  FileTooLargeError,
  FileConflictError,
  DepthExceededError,
  FileCountExceededError,
} from '../import/index.js'

// --- ApiError Response Format ---

interface ApiError {
  code: string
  message: string
  timestamp: string
}

function createApiError(code: string, message: string): ApiError {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
  }
}

// --- Zod Schemas for Request Validation ---

/**
 * Schema for move request body.
 * Both sourcePath and destinationPath must be non-empty strings.
 */
export const moveRequestSchema = z.object({
  sourcePath: z.string().min(1, 'sourcePath must not be empty'),
  destinationPath: z.string().min(1, 'destinationPath must not be empty'),
})

/**
 * Schema for rename request body.
 * path must be a non-empty string, newName must be non-empty and at most 255 characters.
 */
export const renameRequestSchema = z.object({
  path: z.string().min(1, 'path must not be empty'),
  newName: z.string().min(1, 'newName must not be empty').max(255, 'newName must be at most 255 characters'),
})

// --- Link Index Hook Interface ---

/**
 * Callback interface for notifying the link index about file operations.
 * Used by VaultController to trigger incremental index updates after successful file ops.
 */
export interface LinkIndexHook {
  /** Called after a markdown file is saved (created or updated). */
  onFileSaved(vaultId: string, filePath: string, content: string): void
  /** Called after a file or folder is deleted. */
  onFileDeleted(vaultId: string, filePath: string): void
  /** Called after a file is renamed/moved (content may not be available). */
  onFileRenamed(vaultId: string, oldPath: string, newPath: string): void
}

// --- IVaultController Interface ---

export interface IVaultController {
  listVaults(c: Context): Promise<Response>
  getVaultTree(c: Context): Promise<Response>
  getFileContent(c: Context): Response | Promise<Response>
  saveFile(c: Context): Promise<Response>
  createVault(c: Context): Promise<Response>
  deleteVault(c: Context): Promise<Response>
  importFile(c: Context): Promise<Response>
  importFolder(c: Context): Promise<Response>
  deleteContent(c: Context): Promise<Response>
  moveContent(c: Context): Promise<Response>
  renameContent(c: Context): Promise<Response>
}

// --- VaultController Implementation ---

export class VaultController implements IVaultController {
  private linkIndexHook?: LinkIndexHook

  constructor(
    private readonly vaultService: IVaultService,
    private readonly logger: ILogger,
    private readonly importService?: IImportService,
    private readonly userRepository?: IUserRepository,
    private readonly accessControl?: IVaultAccessControl,
    private readonly syncConfigStore?: ISyncConfigStore,
    private readonly shareRegistry?: IVaultShareRegistry,
  ) {}

  /**
   * Sets the link index hook for incremental index updates.
   * Called from the composition root after LinkIndexService is initialized.
   */
  setLinkIndexHook(hook: LinkIndexHook): void {
    this.linkIndexHook = hook
  }

  /**
   * GET /vaults — Returns 200 with VaultInfo[] JSON.
   * Strips the internal `path` field from each VaultInfo before responding.
   * Filters vaults by the authenticated user's access (ownership or shares).
   * Admins can pass ?all=true to get all vaults unfiltered.
   */
  async listVaults(c: Context): Promise<Response> {
    const session = c.get('session') as SessionContext
    const showAll = c.req.query('all') === 'true' && session.role === 'admin'
    const vaults = await this.vaultService.getVaultList(showAll ? undefined : session.userId)

    // Load sync configs to determine which vaults have sync enabled
    const syncConfigs = this.syncConfigStore
      ? await this.syncConfigStore.loadAll()
      : []
    const syncEnabledSet = new Set(
      syncConfigs
        .filter((sc) => sc.config.status === 'active')
        .map((sc) => sc.vaultId),
    )

    // Strip internal `path` field and resolve ownerName
    const publicVaults = await Promise.all(
      vaults.map(async ({ path, ...rest }) => {
        let ownerName: string | undefined
        if (rest.ownerId && this.userRepository) {
          const owner = await this.userRepository.findById(rest.ownerId)
          if (owner) ownerName = owner.username
        }
        const syncEnabled = syncEnabledSet.has(rest.id)

        // Include share count for owned vaults
        let shareCount = 0
        if (rest.permission === 'owner' && this.shareRegistry) {
          const shares = await this.shareRegistry.getSharesForVault(rest.id)
          shareCount = shares.length
        }

        return { ...rest, ownerName, syncEnabled, shareCount }
      }),
    )
    return c.json(publicVaults, 200)
  }

  /**
   * GET /vaults/:vaultId/tree — Returns 200 with DirectoryTree JSON
   * or structured ApiError on failure.
   */
  async getVaultTree(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    try {
      const tree = await this.vaultService.getVaultTree(vaultId)
      return c.json(tree, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * GET /vaults/:vaultId/files?path=...&raw=true — Returns raw file bytes with Content-Type header
   * GET /vaults/:vaultId/files?path=... — Returns 200 with FileContent JSON
   * or structured ApiError on failure.
   * URL-decodes the `path` query parameter before passing to VaultService.
   */
  async getFileContent(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string
    const rawPath = c.req.query('path')
    const rawParam = c.req.query('raw')

    if (!rawPath) {
      const error = createApiError('PATH_TRAVERSAL', 'Missing required query parameter: path')
      return c.json(error, 400)
    }

    // URL-decode the path parameter
    const decodedPath = decodeURIComponent(rawPath)

    // When raw=true, serve the file as binary with appropriate Content-Type
    if (rawParam === 'true') {
      try {
        const resolvedPath = this.vaultService.resolveFilePath(vaultId, decodedPath)
        const buffer = await fs.readFile(resolvedPath)
        const contentType = getContentTypeFromExtension(decodedPath)
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': 'inline',
            'Content-Length': buffer.length.toString(),
          },
        })
      } catch (error) {
        return this.handleError(c, error)
      }
    }

    try {
      const fileContent = await this.vaultService.getFileContent(vaultId, decodedPath)
      return c.json(fileContent, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * PUT /vaults/:vaultId/files — Saves file content.
   * Parses JSON body { path, content }, validates required fields,
   * extracts optional If-Match header for ETag-based conflict detection,
   * calls vaultService.saveFile(vaultId, path, content, ifMatch), returns 200 with { path, name, size, etag }.
   */
  async saveFile(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    try {
      const body = await c.req.json()
      const filePath = body?.path
      const content = body?.content

      if (!filePath || typeof filePath !== 'string') {
        const apiError = createApiError('VALIDATION_ERROR', 'Missing required field: path')
        return c.json(apiError, 400)
      }

      if (content === undefined || content === null || typeof content !== 'string') {
        const apiError = createApiError('VALIDATION_ERROR', 'Missing required field: content')
        return c.json(apiError, 400)
      }

      // Extract optional If-Match header for ETag conflict detection
      const ifMatch = c.req.header('If-Match')

      const result = await this.vaultService.saveFile(vaultId, filePath, content, ifMatch)

      // Notify link index hook for markdown files (fire-and-forget)
      if (this.linkIndexHook && filePath.endsWith('.md')) {
        this.linkIndexHook.onFileSaved(vaultId, filePath, content)
      }

      return c.json(result, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * POST /vaults — Creates a new vault.
   * Parses JSON body { name }, calls vaultService.createVault(name),
   * returns 201 with vault metadata (strips `path` field).
   * Sets ownerId from the authenticated session.
   */
  async createVault(c: Context): Promise<Response> {
    try {
      const body = await c.req.json()
      const name = body?.name

      if (!name || typeof name !== 'string') {
        const apiError = createApiError('VALIDATION_ERROR', 'Missing required field: name')
        return c.json(apiError, 400)
      }

      // Auth middleware guarantees session is set for authenticated routes
      const session = c.get('session') as SessionContext
      const ownerId = session.userId

      const vaultInfo = await this.vaultService.createVault(name, ownerId)

      // Strip internal `path` field from response
      const { path, ...publicVault } = vaultInfo
      return c.json(publicVault, 201)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * DELETE /vaults/:vaultId — Deletes a vault.
   * Validates ownership and checks for active shares before deletion.
   * Returns 409 if the vault has active shares (use force deletion workflow).
   */
  async deleteVault(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string
    const session = c.get('session') as SessionContext

    try {
      await this.vaultService.deleteVaultWithChecks(vaultId, session.userId)
      return c.body(null, 204)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * POST /vaults/:vaultId/import/file — Imports a single file into a vault.
   * Parses multipart form data, extracts file, converts to UploadedFile format,
   * calls importService.importFile(vaultId, file), returns 201.
   */
  async importFile(c: Context): Promise<Response> {
    if (!this.importService) {
      const apiError = createApiError('INTERNAL_ERROR', 'Import service not configured')
      return c.json(apiError, 500)
    }

    const vaultId = c.req.param('vaultId') as string

    try {
      const body = await c.req.parseBody()
      const file = body['file']

      if (!file || !(file instanceof File)) {
        const apiError = createApiError('VALIDATION_ERROR', 'Missing required file field')
        return c.json(apiError, 400)
      }

      const uploadedFile: UploadedFile = {
        name: file.name,
        relativePath: file.name,
        size: file.size,
        stream: file.stream(),
      }

      await this.importService.importFile(vaultId, uploadedFile)

      return c.json({ path: file.name, name: file.name, size: file.size }, 201)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * POST /vaults/:vaultId/import/folder — Imports a folder (multiple files) into a vault.
   * Parses multipart form data with multiple files (including relative paths),
   * calls importService.importFolder(vaultId, files), returns 201.
   */
  async importFolder(c: Context): Promise<Response> {
    if (!this.importService) {
      const apiError = createApiError('INTERNAL_ERROR', 'Import service not configured')
      return c.json(apiError, 500)
    }

    const vaultId = c.req.param('vaultId') as string

    try {
      const body = await c.req.parseBody({ all: true })

      // Files can come as 'files' (array) or 'files[]'
      const rawFiles = body['files'] || body['files[]']
      const relativePaths = body['relativePaths'] || body['relativePaths[]']

      if (!rawFiles) {
        const apiError = createApiError('VALIDATION_ERROR', 'Missing required files field')
        return c.json(apiError, 400)
      }

      // Normalize to array
      const fileArray = Array.isArray(rawFiles) ? rawFiles : [rawFiles]
      const pathArray = Array.isArray(relativePaths) ? relativePaths : relativePaths ? [relativePaths] : []

      const uploadedFiles: UploadedFile[] = []
      let dirCount = 0
      const createdDirs = new Set<string>()

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        if (!(file instanceof File)) continue

        // Use the relativePath from form data if available, otherwise use file name
        const relPath = (pathArray[i] as string) || file.name

        uploadedFiles.push({
          name: file.name,
          relativePath: relPath,
          size: file.size,
          stream: file.stream(),
        })

        // Count unique directories
        const segments = relPath.split('/').filter((s: string) => s.length > 0)
        for (let j = 1; j < segments.length; j++) {
          createdDirs.add(segments.slice(0, j).join('/'))
        }
      }

      if (uploadedFiles.length === 0) {
        const apiError = createApiError('VALIDATION_ERROR', 'No valid files provided')
        return c.json(apiError, 400)
      }

      dirCount = createdDirs.size

      await this.importService.importFolder(vaultId, uploadedFiles)

      return c.json({ importedFiles: uploadedFiles.length, importedFolders: dirCount }, 201)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * DELETE /vaults/:vaultId/content?path=... — Deletes content within a vault.
   * Extracts vaultId and `path` query param, calls vaultService.deleteContent(vaultId, path),
   * returns 204.
   */
  async deleteContent(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string
    const rawPath = c.req.query('path')

    if (!rawPath) {
      const apiError = createApiError('PATH_TRAVERSAL', 'Missing required query parameter: path')
      return c.json(apiError, 400)
    }

    const decodedPath = decodeURIComponent(rawPath)

    try {
      await this.vaultService.deleteContent(vaultId, decodedPath)

      // Notify link index hook for markdown files (fire-and-forget)
      if (this.linkIndexHook && decodedPath.endsWith('.md')) {
        this.linkIndexHook.onFileDeleted(vaultId, decodedPath)
      }

      return c.body(null, 204)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * PUT /vaults/:vaultId/move — Moves a file or folder within a vault.
   * Parses JSON body { sourcePath, destinationPath }, validates with Zod,
   * checks write access via VaultAccessControlService,
   * calls vaultService.moveContent(vaultId, sourcePath, destinationPath),
   * returns 200 with { newPath }.
   */
  async moveContent(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    try {
      // Check write access before executing the operation
      if (this.accessControl) {
        const session = c.get('session') as SessionContext
        await this.accessControl.checkWriteAccess(vaultId, session.userId)
      }

      const body = await c.req.json()
      const parsed = moveRequestSchema.safeParse(body)

      if (!parsed.success) {
        const firstError = parsed.error.errors[0]
        const message = firstError ? firstError.message : 'Invalid request body'
        const apiError = createApiError('VALIDATION_ERROR', message)
        return c.json(apiError, 400)
      }

      const { sourcePath, destinationPath } = parsed.data
      const result = await this.vaultService.moveContent(vaultId, sourcePath, destinationPath)

      // Notify link index hook for markdown file moves (fire-and-forget)
      if (this.linkIndexHook && sourcePath.endsWith('.md')) {
        this.linkIndexHook.onFileRenamed(vaultId, sourcePath, result.newPath)
      }

      return c.json(result, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * PUT /vaults/:vaultId/rename — Renames a file or folder within a vault.
   * Parses JSON body { path, newName }, validates with Zod,
   * checks write access via VaultAccessControlService,
   * calls vaultService.renameContent(vaultId, path, newName),
   * returns 200 with { newPath }.
   */
  async renameContent(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    try {
      // Check write access before executing the operation
      if (this.accessControl) {
        const session = c.get('session') as SessionContext
        await this.accessControl.checkWriteAccess(vaultId, session.userId)
      }

      const body = await c.req.json()
      const parsed = renameRequestSchema.safeParse(body)

      if (!parsed.success) {
        const firstError = parsed.error.errors[0]
        const message = firstError ? firstError.message : 'Invalid request body'
        const apiError = createApiError('VALIDATION_ERROR', message)
        return c.json(apiError, 400)
      }

      const { path: filePath, newName } = parsed.data
      const result = await this.vaultService.renameContent(vaultId, filePath, newName)

      // Notify link index hook for markdown file renames (fire-and-forget)
      if (this.linkIndexHook && filePath.endsWith('.md')) {
        this.linkIndexHook.onFileRenamed(vaultId, filePath, result.newPath)
      }

      return c.json(result, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * Maps domain errors to HTTP status codes and structured ApiError responses.
   */
  private handleError(c: Context, error: unknown): Response {
    // VaultAccessDeniedError — 403 (no write permission)
    if (error instanceof VaultAccessDeniedError) {
      this.logger.warn('Vault access denied', { vaultId: error.vaultId, userId: error.userId, requiredPermission: error.requiredPermission })
      const apiError = createApiError('FORBIDDEN', error.message)
      return c.json(apiError, 403)
    }

    // VaultValidationError — 400 or 409 depending on code
    if (error instanceof VaultValidationError) {
      if (error.code === 'VAULT_NAME_CONFLICT') {
        this.logger.warn('Vault name conflict', { message: error.message })
        const apiError = createApiError('VAULT_NAME_CONFLICT', error.message)
        return c.json(apiError, 409)
      }
      this.logger.warn('Vault validation error', { code: error.code, message: error.message })
      const apiError = createApiError('VALIDATION_ERROR', error.message)
      return c.json(apiError, 400)
    }

    if (error instanceof VaultNotFoundError) {
      this.logger.warn('Vault not found', { vaultId: error.vaultId })
      const apiError = createApiError('VAULT_NOT_FOUND', error.message)
      return c.json(apiError, 404)
    }

    if (error instanceof PathTraversalError) {
      this.logger.warn('Path traversal detected', { rawPath: error.rawPath })
      const apiError = createApiError('PATH_TRAVERSAL', error.message)
      return c.json(apiError, 400)
    }

    // Import-related errors
    if (error instanceof InvalidFilenameError) {
      this.logger.warn('Invalid filename', { message: error.message })
      const apiError = createApiError('INVALID_FILENAME', error.message)
      return c.json(apiError, 400)
    }

    if (error instanceof FileTooLargeError) {
      this.logger.warn('File too large', { message: error.message })
      const apiError = createApiError('FILE_TOO_LARGE', error.message)
      return c.json(apiError, 413)
    }

    if (error instanceof BusinessFileTooLargeError) {
      this.logger.warn('File too large', { message: error.message })
      const apiError = createApiError('FILE_TOO_LARGE', error.message)
      return c.json(apiError, 413)
    }

    if (error instanceof FileConflictError) {
      this.logger.warn('File conflict', { message: error.message })
      const apiError = createApiError('FILE_CONFLICT', error.message)
      return c.json(apiError, 409)
    }

    if (error instanceof DepthExceededError) {
      this.logger.warn('Depth exceeded', { message: error.message })
      const apiError = createApiError('DEPTH_EXCEEDED', error.message)
      return c.json(apiError, 400)
    }

    if (error instanceof FileCountExceededError) {
      this.logger.warn('File count exceeded', { message: error.message })
      const apiError = createApiError('FILE_COUNT_EXCEEDED', error.message)
      return c.json(apiError, 400)
    }

    // ConflictError — 409 (ETag mismatch)
    if (error instanceof ConflictError) {
      this.logger.warn('ETag conflict detected', { currentEtag: error.currentEtag, providedEtag: error.providedEtag })
      const apiError = createApiError('CONFLICT', error.message)
      return c.json(apiError, 409)
    }

    // InvalidMoveError — 400 (destination is subdirectory of source)
    if (error instanceof InvalidMoveError) {
      this.logger.warn('Invalid move operation', { sourcePath: error.sourcePath, destinationPath: error.destinationPath })
      const apiError = createApiError('INVALID_MOVE', error.message)
      return c.json(apiError, 400)
    }

    // BusinessFileConflictError — 409 (file/folder already exists at target)
    if (error instanceof BusinessFileConflictError) {
      this.logger.warn('File conflict at target path', { targetPath: error.targetPath })
      const apiError = createApiError('CONFLICT', error.message)
      return c.json(apiError, 409)
    }

    // InvalidNameError — 400 (invalid characters in name)
    if (error instanceof InvalidNameError) {
      this.logger.warn('Invalid name', { name: error.invalidName, reason: error.reason })
      const apiError = createApiError('VALIDATION_ERROR', error.message)
      return c.json(apiError, 400)
    }

    // StorageError — 500
    if (error instanceof StorageError) {
      this.logger.error('Storage error', { message: error.message })
      const apiError = createApiError('STORAGE_ERROR', error.message)
      return c.json(apiError, 500)
    }

    // VaultHasActiveSharesError — 409 (vault still shared)
    if (error instanceof VaultHasActiveSharesError) {
      this.logger.warn('Vault has active shares', { vaultId: error.vaultId, shareCount: error.activeShares.length })
      const apiError = createApiError('VAULT_HAS_ACTIVE_SHARES', error.message)
      return c.json(apiError, 409)
    }

    // File not found (ENOENT)
    if (isNodeError(error) && error.code === 'ENOENT') {
      this.logger.warn('File not found', { message: error.message })
      const apiError = createApiError('FILE_NOT_FOUND', 'File not found')
      return c.json(apiError, 404)
    }

    // Permission denied (EACCES)
    if (isNodeError(error) && error.code === 'EACCES') {
      this.logger.warn('Permission denied', { message: error.message })
      const apiError = createApiError('PERMISSION_DENIED', 'Permission denied')
      return c.json(apiError, 403)
    }

    // Unknown / internal errors
    this.logger.error('Unexpected error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    const apiError = createApiError('INTERNAL_ERROR', 'Internal server error')
    return c.json(apiError, 500)
  }
}

// --- Helper: Node.js error type guard ---

interface NodeError extends Error {
  code: string
}

function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error && 'code' in error && typeof (error as NodeError).code === 'string'
}

// --- Helper: Content-Type mapping from file extension ---

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
}

function getContentTypeFromExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return CONTENT_TYPE_MAP[ext] ?? 'application/octet-stream'
}

// --- RouteModule Interface ---

export interface RouteModule {
  register(router: Hono): void
}

// --- VaultRouteModule ---

export class VaultRouteModule implements RouteModule {
  constructor(private readonly controller: IVaultController) {}

  register(router: Hono): void {
    // GET routes (existing)
    router.get('/vaults', (c) => this.controller.listVaults(c))
    router.get('/vaults/:vaultId/tree', (c) => this.controller.getVaultTree(c))
    router.get('/vaults/:vaultId/files', (c) => this.controller.getFileContent(c))

    // PUT routes
    router.put('/vaults/:vaultId/files', (c) => this.controller.saveFile(c))
    router.put('/vaults/:vaultId/move', (c) => this.controller.moveContent(c))
    router.put('/vaults/:vaultId/rename', (c) => this.controller.renameContent(c))

    // POST routes (new)
    router.post('/vaults', (c) => this.controller.createVault(c))
    router.post('/vaults/:vaultId/import/file', (c) => this.controller.importFile(c))
    router.post('/vaults/:vaultId/import/folder', (c) => this.controller.importFolder(c))

    // DELETE routes (new)
    router.delete('/vaults/:vaultId', (c) => this.controller.deleteVault(c))
    router.delete('/vaults/:vaultId/content', (c) => this.controller.deleteContent(c))
  }
}

// --- Re-exports ---

export { createAdminRoutes, AdminRouteModule, AdminController } from './adminRoutes.js'
export type { IAdminController, AdminRouteDependencies } from './adminRoutes.js'

// --- Router Factory ---

export function createRouter(registry: RouteModule[]): Hono {
  const router = new Hono()
  for (const module of registry) {
    module.register(router)
  }
  return router
}

// --- Re-exports from route modules ---

export { AuthController, AuthRouteModule } from './authRoutes.js'
export type { IAuthController } from './authRoutes.js'
