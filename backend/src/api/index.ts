// API Router Layer — Route modules and controllers

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { IVaultService } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import { VaultNotFoundError, VaultValidationError, StorageError } from '../business/index.js'
import { PathTraversalError } from '../vault/index.js'
import type { IImportService, UploadedFile } from '../import/index.js'
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

// --- IVaultController Interface ---

export interface IVaultController {
  listVaults(c: Context): Response | Promise<Response>
  getVaultTree(c: Context): Response | Promise<Response>
  getFileContent(c: Context): Response | Promise<Response>
  createVault(c: Context): Promise<Response>
  deleteVault(c: Context): Promise<Response>
  importFile(c: Context): Promise<Response>
  importFolder(c: Context): Promise<Response>
  deleteContent(c: Context): Promise<Response>
}

// --- VaultController Implementation ---

export class VaultController implements IVaultController {
  constructor(
    private readonly vaultService: IVaultService,
    private readonly logger: ILogger,
    private readonly importService?: IImportService,
  ) {}

  /**
   * GET /vaults — Returns 200 with VaultInfo[] JSON.
   * Strips the internal `path` field from each VaultInfo before responding.
   */
  listVaults(c: Context): Response {
    const vaults = this.vaultService.getVaultList()
    // Strip internal `path` field from API response
    const publicVaults = vaults.map(({ path, ...rest }) => rest)
    return c.json(publicVaults, 200)
  }

  /**
   * GET /vaults/:vaultId/tree — Returns 200 with DirectoryTree JSON
   * or structured ApiError on failure.
   */
  getVaultTree(c: Context): Response {
    const vaultId = c.req.param('vaultId') as string

    try {
      const tree = this.vaultService.getVaultTree(vaultId)
      return c.json(tree, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * GET /vaults/:vaultId/files?path=... — Returns 200 with FileContent JSON
   * or structured ApiError on failure.
   * URL-decodes the `path` query parameter before passing to VaultService.
   */
  async getFileContent(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string
    const rawPath = c.req.query('path')

    if (!rawPath) {
      const error = createApiError('PATH_TRAVERSAL', 'Missing required query parameter: path')
      return c.json(error, 400)
    }

    // URL-decode the path parameter
    const decodedPath = decodeURIComponent(rawPath)

    try {
      const fileContent = await this.vaultService.getFileContent(vaultId, decodedPath)
      return c.json(fileContent, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * POST /vaults — Creates a new vault.
   * Parses JSON body { name }, calls vaultService.createVault(name),
   * returns 201 with vault metadata (strips `path` field).
   */
  async createVault(c: Context): Promise<Response> {
    try {
      const body = await c.req.json()
      const name = body?.name

      if (!name || typeof name !== 'string') {
        const apiError = createApiError('VALIDATION_ERROR', 'Missing required field: name')
        return c.json(apiError, 400)
      }

      const vaultInfo = await this.vaultService.createVault(name)

      // Strip internal `path` field from response
      const { path, ...publicVault } = vaultInfo
      return c.json(publicVault, 201)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * DELETE /vaults/:vaultId — Deletes a vault.
   * Extracts vaultId param, calls vaultService.deleteVault(vaultId), returns 204.
   */
  async deleteVault(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    try {
      await this.vaultService.deleteVault(vaultId)
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
      return c.body(null, 204)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * Maps domain errors to HTTP status codes and structured ApiError responses.
   */
  private handleError(c: Context, error: unknown): Response {
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

    // StorageError — 500
    if (error instanceof StorageError) {
      this.logger.error('Storage error', { message: error.message })
      const apiError = createApiError('STORAGE_ERROR', error.message)
      return c.json(apiError, 500)
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

    // POST routes (new)
    router.post('/vaults', (c) => this.controller.createVault(c))
    router.post('/vaults/:vaultId/import/file', (c) => this.controller.importFile(c))
    router.post('/vaults/:vaultId/import/folder', (c) => this.controller.importFolder(c))

    // DELETE routes (new)
    router.delete('/vaults/:vaultId', (c) => this.controller.deleteVault(c))
    router.delete('/vaults/:vaultId/content', (c) => this.controller.deleteContent(c))
  }
}

// --- Router Factory ---

export function createRouter(registry: RouteModule[]): Hono {
  const router = new Hono()
  for (const module of registry) {
    module.register(router)
  }
  return router
}
