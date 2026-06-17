// File Version Routes — Route module for file versioning endpoints

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { IVersionService } from '../version/types.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { validateFilePath, PathTraversalError } from '../vault/index.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IEventBus } from '../realtime/types.js'
import { VersionNotFoundError } from '../version/errors.js'

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

// --- Zod Schemas ---

/**
 * Schema for the `path` query parameter (required, non-empty).
 */
const filePathQuerySchema = z.object({
  path: z.string().min(1, 'path query parameter must not be empty'),
})

/**
 * Schema for the restore request body.
 */
const restoreBodySchema = z.object({
  path: z.string().min(1, 'path must not be empty'),
  timestamp: z.string().min(1, 'timestamp must not be empty'),
})

/**
 * Schema for the `timestamp` query parameter (required, non-empty).
 */
const timestampQuerySchema = z.object({
  path: z.string().min(1, 'path query parameter must not be empty'),
  timestamp: z.string().min(1, 'timestamp query parameter must not be empty'),
})

// --- FileVersionRouteDependencies ---

/**
 * Dependencies required by the file version route factory.
 */
export interface FileVersionRouteDependencies {
  versionService: IVersionService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

// --- File Version Route Factory ---

/**
 * Creates a Hono app with file versioning routes registered.
 *
 * Routes:
 * - `GET /vaults/:vaultId/versions?path=<encodedPath>` — list versions for a file
 * - `GET /vaults/:vaultId/versions/content?path=<encodedPath>&timestamp=<ts>` — get version content
 * - `POST /vaults/:vaultId/versions/restore` — restore a version (body: { path, timestamp })
 *
 * @returns A Hono instance with file versioning routes registered.
 */
export function createFileVersionRoutes(deps: FileVersionRouteDependencies): Hono {
  const { versionService, accessControl, vaultRegistry, eventBus, logger } = deps
  const app = new Hono()

  /**
   * GET /vaults/:vaultId/versions?path=<encodedPath>
   *
   * Lists all stored versions for a file, sorted by timestamp descending.
   * Requires read access to the vault.
   *
   * Query params:
   * - `path` (required) — URL-encoded relative file path within the vault
   *
   * Returns 200 with `{ versions: VersionEntry[] }`
   */
  app.get('/vaults/:vaultId/versions', async (c: Context) => {
    const vaultId = c.req.param('vaultId') as string
    const session = c.get('session') as SessionContext | undefined

    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // Check vault exists
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(error, 404)
    }

    // Check read access
    try {
      await accessControl.checkReadAccess(vaultId, session.userId)
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

    // Validate path query param
    const rawPath = c.req.query('path')
    const parsed = filePathQuerySchema.safeParse({ path: rawPath })
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      const message = firstError ? firstError.message : 'Invalid query parameters'
      const apiError = createApiError('VALIDATION_ERROR', message)
      return c.json(apiError, 400)
    }

    const filePath = decodeURIComponent(parsed.data.path)

    // Validate file path (path traversal check)
    try {
      validateFilePath(entry.storagePath, filePath)
    } catch (error) {
      if (error instanceof PathTraversalError) {
        const apiError = createApiError('PATH_TRAVERSAL', error.message)
        return c.json(apiError, 400)
      }
      throw error
    }

    try {
      const versions = await versionService.listVersions(vaultId, filePath)
      return c.json({ versions }, 200)
    } catch (error) {
      logger.error('Failed to list versions', {
        vaultId,
        filePath,
        message: error instanceof Error ? error.message : String(error),
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Failed to list versions')
      return c.json(apiError, 500)
    }
  })

  /**
   * GET /vaults/:vaultId/versions/content?path=<encodedPath>&timestamp=<ts>
   *
   * Retrieves the content of a specific file version.
   * Requires read access to the vault.
   *
   * Query params:
   * - `path` (required) — URL-encoded relative file path within the vault
   * - `timestamp` (required) — Version timestamp (YYYYMMDDTHHmmssSSS)
   *
   * Returns 200 with raw file content (Content-Type based on extension).
   */
  app.get('/vaults/:vaultId/versions/content', async (c: Context) => {
    const vaultId = c.req.param('vaultId') as string
    const session = c.get('session') as SessionContext | undefined

    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // Check vault exists
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(error, 404)
    }

    // Check read access
    try {
      await accessControl.checkReadAccess(vaultId, session.userId)
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

    // Validate query params
    const rawPath = c.req.query('path')
    const rawTimestamp = c.req.query('timestamp')
    const parsed = timestampQuerySchema.safeParse({ path: rawPath, timestamp: rawTimestamp })
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      const message = firstError ? firstError.message : 'Invalid query parameters'
      const apiError = createApiError('VALIDATION_ERROR', message)
      return c.json(apiError, 400)
    }

    const filePath = decodeURIComponent(parsed.data.path)
    const timestamp = parsed.data.timestamp

    // Validate file path (path traversal check)
    try {
      validateFilePath(entry.storagePath, filePath)
    } catch (error) {
      if (error instanceof PathTraversalError) {
        const apiError = createApiError('PATH_TRAVERSAL', error.message)
        return c.json(apiError, 400)
      }
      throw error
    }

    try {
      const content = await versionService.getVersionContent(vaultId, filePath, timestamp)
      return c.json({ content: content.toString('utf-8') }, 200)
    } catch (error) {
      if (error instanceof VersionNotFoundError) {
        const apiError = createApiError('VERSION_NOT_FOUND', error.message)
        return c.json(apiError, 404)
      }
      logger.error('Failed to get version content', {
        vaultId,
        filePath,
        timestamp,
        message: error instanceof Error ? error.message : String(error),
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Failed to get version content')
      return c.json(apiError, 500)
    }
  })

  /**
   * POST /vaults/:vaultId/versions/restore
   *
   * Restores a file version: saves the current content as a new version,
   * then atomically overwrites the file with the selected version's content.
   * Requires write access to the vault.
   *
   * Body: `{ path: string, timestamp: string }`
   *
   * Returns 200 with `{ restored: true, path, timestamp }`
   */
  app.post('/vaults/:vaultId/versions/restore', async (c: Context) => {
    const vaultId = c.req.param('vaultId') as string
    const session = c.get('session') as SessionContext | undefined

    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // Check vault exists
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(error, 404)
    }

    // Check write access (restore modifies the file)
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

    // Parse and validate body
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      const apiError = createApiError('VALIDATION_ERROR', 'Invalid JSON body')
      return c.json(apiError, 400)
    }

    const parsed = restoreBodySchema.safeParse(body)
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      const message = firstError ? firstError.message : 'Invalid request body'
      const apiError = createApiError('VALIDATION_ERROR', message)
      return c.json(apiError, 400)
    }

    const filePath = parsed.data.path
    const timestamp = parsed.data.timestamp

    // Validate file path (path traversal check)
    try {
      validateFilePath(entry.storagePath, filePath)
    } catch (error) {
      if (error instanceof PathTraversalError) {
        const apiError = createApiError('PATH_TRAVERSAL', error.message)
        return c.json(apiError, 400)
      }
      throw error
    }

    try {
      await versionService.restoreVersion(vaultId, filePath, timestamp)

      // Publish vault:change event (file was modified by restore)
      eventBus.publish({
        type: 'vault:change',
        payload: {
          vaultId,
          action: 'saved',
          path: filePath,
          userId: session.userId,
          username: session.username,
        },
        target: { kind: 'broadcast' },
        excludeUserId: session.userId,
      })

      logger.info('Version restored via API', { vaultId, filePath, timestamp, userId: session.userId })

      return c.json({ restored: true, path: filePath, timestamp }, 200)
    } catch (error) {
      if (error instanceof VersionNotFoundError) {
        const apiError = createApiError('VERSION_NOT_FOUND', error.message)
        return c.json(apiError, 404)
      }
      logger.error('Failed to restore version', {
        vaultId,
        filePath,
        timestamp,
        message: error instanceof Error ? error.message : String(error),
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Failed to restore version')
      return c.json(apiError, 500)
    }
  })

  return app
}
