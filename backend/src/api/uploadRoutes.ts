// Upload Routes — Route module for file upload endpoints

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { validateFilePath, PathTraversalError } from '../vault/index.js'
import type { IEventBus } from '../realtime/types.js'
import type { UploadConfig } from '../config/index.js'
import { UploadTooLargeError, UploadLimitExceededError } from '../upload/errors.js'
import { generateUniqueFilename } from '../business/unique-filename.js'

// --- Helper: API Error Response ---

interface ApiError {
  code: string
  message: string
  timestamp: string
}

/**
 * Creates a structured API error response object.
 */
function createApiError(code: string, message: string): ApiError {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
  }
}

// --- Helper: Generate paste filename ---

/**
 * Generates a filename for image paste uploads in the format:
 * `paste-YYYY-MM-DD-HHmmss.<ext>`
 */
function generatePasteFilename(originalName: string): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  const ext = path.extname(originalName) || '.png'
  return `paste-${yyyy}-${mm}-${dd}-${hh}${min}${ss}${ext}`
}

// --- UploadRouteDependencies ---

/**
 * Dependencies required by the upload route factory.
 */
export interface UploadRouteDependencies {
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  uploadConfig: UploadConfig
  eventBus: IEventBus
  logger: ILogger
}

// --- Upload Route Factory ---

/**
 * Creates a Hono app with the upload route registered.
 * Registers `POST /vaults/:vaultId/upload` for multipart file uploads and image paste.
 *
 * @returns A Hono instance with upload routes registered.
 */
export function createUploadRoutes(deps: UploadRouteDependencies): Hono {
  const { accessControl, vaultRegistry, uploadConfig, eventBus, logger } = deps
  const app = new Hono()

  /**
   * POST /vaults/:vaultId/upload
   *
   * Accepts multipart file uploads (max 50 files, max 100 MB each).
   * Image paste variant: max 10 MB, generates `paste-YYYY-MM-DD-HHmmss.<ext>` filename.
   * Applies unique filename logic for conflicts.
   * Validates file size before writing, rejects oversized files.
   * Publishes `vault:change` event after successful upload.
   *
   * Query params:
   * - `paste=true` — Enables image paste mode (10 MB limit, auto-generated filename)
   *
   * Form fields:
   * - File entries — One or more files to upload
   * - `targetDir` — Target directory within the vault (optional, defaults to root)
   *
   * Returns 201 with `{ uploaded: [{ fileName, path }] }`
   */
  app.post('/vaults/:vaultId/upload', async (c: Context) => {
    const vaultId = c.req.param('vaultId') as string
    const session = c.get('session') as SessionContext | undefined

    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // 1. Check vault exists
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(error, 404)
    }

    // 2. Check write access
    try {
      await accessControl.checkWriteAccess(vaultId, session.userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        const apiError = createApiError('FORBIDDEN', error.message)
        return c.json(apiError, 403)
      }
      if (error instanceof VaultNotFoundError) {
        const apiError = createApiError('VAULT_NOT_FOUND', error.message)
        return c.json(apiError, 404)
      }
      throw error
    }

    // 3. Determine if paste mode
    const isPaste = c.req.query('paste') === 'true'
    const maxFileSize = isPaste
      ? uploadConfig.maxImagePasteSize
      : uploadConfig.maxFileSizeBytes

    // 4. Parse multipart form data
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      const apiError = createApiError('VALIDATION_ERROR', 'Invalid multipart form data')
      return c.json(apiError, 400)
    }

    // 5. Extract files and targetDir from form data
    const files: File[] = []
    let targetDir = ''

    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        files.push(value)
      } else if (key === 'targetDir' && typeof value === 'string') {
        targetDir = value
      }
    }

    if (files.length === 0) {
      const apiError = createApiError('VALIDATION_ERROR', 'No files provided')
      return c.json(apiError, 400)
    }

    // 6. Validate file count
    if (files.length > uploadConfig.maxFilesPerDrop) {
      const err = new UploadLimitExceededError(files.length, uploadConfig.maxFilesPerDrop)
      logger.warn('Upload limit exceeded', { fileCount: files.length, max: uploadConfig.maxFilesPerDrop })
      const apiError = createApiError(err.code, err.message)
      return c.json(apiError, 413)
    }

    // 7. Process each file
    const vaultPath = entry.storagePath
    const uploaded: Array<{ fileName: string; path: string }> = []

    try {
      // Determine absolute target directory once
      let absoluteDir: string
      if (targetDir === '') {
        absoluteDir = vaultPath
      } else {
        try {
          absoluteDir = validateFilePath(vaultPath, targetDir)
        } catch (error) {
          if (error instanceof PathTraversalError) {
            const apiError = createApiError('PATH_TRAVERSAL', error.message)
            return c.json(apiError, 400)
          }
          throw error
        }
      }

      // Read existing filenames in target dir for conflict detection
      let existingNames: string[] = []
      try {
        existingNames = await fs.readdir(absoluteDir)
      } catch {
        // Directory doesn't exist yet — no conflicts possible
      }

      for (const file of files) {
        // 7a. Validate file size
        if (file.size > maxFileSize) {
          const err = new UploadTooLargeError(file.name, maxFileSize)
          logger.warn('File too large', { fileName: file.name, size: file.size, max: maxFileSize })
          const apiError = createApiError(err.code, err.message)
          return c.json(apiError, 413)
        }

        // 7b. Determine filename
        let desiredName: string
        if (isPaste) {
          desiredName = generatePasteFilename(file.name)
        } else {
          desiredName = file.name
        }

        // 7c. Apply unique filename logic
        const uniqueName = generateUniqueFilename(desiredName, existingNames)

        // 7d. Validate the full file path
        const relativePath = targetDir ? `${targetDir}/${uniqueName}` : uniqueName
        let absolutePath: string
        try {
          absolutePath = validateFilePath(vaultPath, relativePath)
        } catch (error) {
          if (error instanceof PathTraversalError) {
            const apiError = createApiError('PATH_TRAVERSAL', error.message)
            return c.json(apiError, 400)
          }
          throw error
        }

        // 7e. Ensure target directory exists
        await fs.mkdir(path.dirname(absolutePath), { recursive: true })

        // 7f. Write atomically (temp → rename)
        const tmpFile = `${absolutePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
        const buffer = Buffer.from(await file.arrayBuffer())
        await fs.writeFile(tmpFile, buffer)
        await fs.rename(tmpFile, absolutePath)

        // Track the uploaded file (update existingNames for subsequent files in same batch)
        existingNames.push(uniqueName)
        uploaded.push({ fileName: uniqueName, path: relativePath })
      }
    } catch (error) {
      // Unexpected error during file processing
      logger.error('Upload failed', {
        vaultId,
        message: error instanceof Error ? error.message : String(error),
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Upload failed')
      return c.json(apiError, 500)
    }

    // 8. Publish vault:change event
    eventBus.publish({
      type: 'vault:change',
      payload: {
        vaultId,
        action: 'saved',
        path: uploaded.length === 1 ? uploaded[0]!.path : targetDir || '/',
        userId: session.userId,
        username: session.username,
      },
      target: { kind: 'broadcast' },
      excludeUserId: session.userId,
    })

    logger.info('Files uploaded', { vaultId, count: uploaded.length, isPaste })

    return c.json({ uploaded }, 201)
  })

  return app
}
