// Trash Routes — Route module for trash (soft-delete) endpoints

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IEventBus } from '../realtime/types.js'
import type { ITrashService } from '../trash/index.js'
import { TrashNotFoundError, TrashRestoreError } from '../trash/index.js'

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

// --- Zod Validation Schemas ---

/** Schema for vaultId path parameter. */
const vaultIdParamSchema = z.object({
  vaultId: z.string().min(1, 'vaultId must not be empty'),
})

/** Schema for entryId path parameter. */
const entryIdParamSchema = z.object({
  vaultId: z.string().min(1, 'vaultId must not be empty'),
  entryId: z.string().min(1, 'entryId must not be empty'),
})

// --- TrashRouteDependencies ---

/**
 * Dependencies required by the trash route factory.
 */
export interface TrashRouteDependencies {
  trashService: ITrashService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

// --- Trash Route Factory ---

/**
 * Creates a Hono app with trash management routes registered.
 *
 * Routes:
 * - `GET /vaults/:vaultId/trash` — List trash entries
 * - `POST /vaults/:vaultId/trash/:entryId/restore` — Restore a trash entry
 * - `DELETE /vaults/:vaultId/trash/:entryId` — Permanently delete a trash entry
 *
 * @returns A Hono instance with trash routes registered.
 */
export function createTrashRoutes(deps: TrashRouteDependencies): Hono {
  const { trashService, accessControl, vaultRegistry, eventBus, logger } = deps
  const app = new Hono()

  /**
   * GET /vaults/:vaultId/trash
   *
   * Lists all trash entries for a vault, sorted by deletedAt descending.
   * Requires read access to the vault.
   *
   * Returns 200 with `{ entries: TrashEntry[] }`
   */
  app.get('/vaults/:vaultId/trash', async (c: Context) => {
    const session = c.get('session') as SessionContext | undefined

    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // Validate params
    const params = vaultIdParamSchema.safeParse({ vaultId: c.req.param('vaultId') })
    if (!params.success) {
      const firstError = params.error.errors[0]
      const message = firstError ? firstError.message : 'Invalid parameters'
      const apiError = createApiError('VALIDATION_ERROR', message)
      return c.json(apiError, 400)
    }

    const { vaultId } = params.data

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

    // List trash entries
    try {
      const entries = await trashService.listTrash(vaultId)
      return c.json({ entries }, 200)
    } catch (error) {
      logger.error('Failed to list trash entries', {
        vaultId,
        message: error instanceof Error ? error.message : String(error),
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Failed to list trash entries')
      return c.json(apiError, 500)
    }
  })

  /**
   * POST /vaults/:vaultId/trash/:entryId/restore
   *
   * Restores a file from trash to its original path (with suffix if occupied).
   * Requires write access to the vault.
   *
   * Returns 200 with `{ restoredPath: string }`
   */
  app.post('/vaults/:vaultId/trash/:entryId/restore', async (c: Context) => {
    const session = c.get('session') as SessionContext | undefined

    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // Validate params
    const params = entryIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      entryId: c.req.param('entryId'),
    })
    if (!params.success) {
      const firstError = params.error.errors[0]
      const message = firstError ? firstError.message : 'Invalid parameters'
      const apiError = createApiError('VALIDATION_ERROR', message)
      return c.json(apiError, 400)
    }

    const { vaultId, entryId } = params.data

    // Check vault exists
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(error, 404)
    }

    // Check write access
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

    // Restore from trash
    try {
      const result = await trashService.restore(vaultId, entryId)

      // Publish vault:change event on successful restore
      eventBus.publish({
        type: 'vault:change',
        payload: {
          vaultId,
          action: 'saved',
          path: result.restoredPath,
          userId: session.userId,
          username: session.username,
        },
        target: { kind: 'broadcast' },
        excludeUserId: session.userId,
      })

      logger.info('Trash entry restored', { vaultId, entryId, restoredPath: result.restoredPath })

      return c.json({ restoredPath: result.restoredPath }, 200)
    } catch (error) {
      if (error instanceof TrashNotFoundError) {
        const apiError = createApiError(error.code, error.message)
        return c.json(apiError, 404)
      }
      if (error instanceof TrashRestoreError) {
        logger.error('Trash restore failed', { vaultId, entryId, reason: error.reason })
        const apiError = createApiError(error.code, error.message)
        return c.json(apiError, 500)
      }
      logger.error('Unexpected error during trash restore', {
        vaultId,
        entryId,
        message: error instanceof Error ? error.message : String(error),
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Failed to restore trash entry')
      return c.json(apiError, 500)
    }
  })

  /**
   * DELETE /vaults/:vaultId/trash/:entryId
   *
   * Permanently deletes a trash entry and its associated files.
   * Requires write access to the vault.
   *
   * Returns 204 on success.
   */
  app.delete('/vaults/:vaultId/trash/:entryId', async (c: Context) => {
    const session = c.get('session') as SessionContext | undefined

    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // Validate params
    const params = entryIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      entryId: c.req.param('entryId'),
    })
    if (!params.success) {
      const firstError = params.error.errors[0]
      const message = firstError ? firstError.message : 'Invalid parameters'
      const apiError = createApiError('VALIDATION_ERROR', message)
      return c.json(apiError, 400)
    }

    const { vaultId, entryId } = params.data

    // Check vault exists
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(error, 404)
    }

    // Check write access
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

    // Permanently delete
    try {
      await trashService.deletePermanently(vaultId, entryId)

      logger.info('Trash entry permanently deleted', { vaultId, entryId })

      return c.body(null, 204)
    } catch (error) {
      if (error instanceof TrashNotFoundError) {
        const apiError = createApiError(error.code, error.message)
        return c.json(apiError, 404)
      }
      logger.error('Failed to permanently delete trash entry', {
        vaultId,
        entryId,
        message: error instanceof Error ? error.message : String(error),
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Failed to delete trash entry')
      return c.json(apiError, 500)
    }
  })

  return app
}
