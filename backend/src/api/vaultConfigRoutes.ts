/**
 * Vault configuration routes module — per-vault settings for templates and daily notes.
 * All routes require authentication and vault access.
 *
 * Routes:
 *   GET  /vaults/:vaultId/config — Get vault configuration
 *   PUT  /vaults/:vaultId/config — Update vault configuration (owner only)
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { IVaultConfigService } from '../vault-config/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import { updateVaultConfigSchema } from '../vault-config/validation.js'
import { VaultAccessDeniedError } from '../business/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiError {
  code: string
  message: string
  timestamp: string
}

interface VaultConfigRoutesDeps {
  vaultConfigService: IVaultConfigService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  logger: ILogger
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createApiError(code: string, message: string): ApiError {
  return { code, message, timestamp: new Date().toISOString() }
}

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with vault configuration routes.
 * Mounted under /vaults/:vaultId/config in the authenticated router.
 */
export function createVaultConfigRoutes(deps: VaultConfigRoutesDeps): Hono {
  const { vaultConfigService, accessControl, vaultRegistry, logger } = deps
  const app = new Hono()

  // GET /vaults/:vaultId/config — Any user with vault access can read config
  app.get('/vaults/:vaultId/config', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string

    try {
      // Check at least read access
      await accessControl.checkReadAccess(vaultId, session.userId)
      const config = await vaultConfigService.getConfig(vaultId)
      return c.json(config, 200)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        return c.json(createApiError('FORBIDDEN', error.message), 403)
      }
      logger.error('Failed to get vault config', { vaultId, userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  // PUT /vaults/:vaultId/config — Only vault owner can write config
  app.put('/vaults/:vaultId/config', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string

    // Only owner can change vault configuration
    const entry = vaultRegistry.findById(vaultId)
    if (entry === null) {
      return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
    }
    if (entry.ownerId !== session.userId) {
      return c.json(createApiError('FORBIDDEN', 'Only the vault owner can modify vault configuration'), 403)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = updateVaultConfigSchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      // Build partial config, only including defined fields (exactOptionalPropertyTypes compliance)
      const partial: Partial<import('../vault-config/index.js').VaultConfig> = {}
      if (result.data.templatesDirectory !== undefined) {
        partial.templatesDirectory = result.data.templatesDirectory
      }
      if (result.data.dailyNotesDirectory !== undefined) {
        partial.dailyNotesDirectory = result.data.dailyNotesDirectory
      }
      const config = await vaultConfigService.saveConfig(vaultId, partial)
      return c.json(config, 200)
    } catch (error) {
      logger.error('Failed to save vault config', { vaultId, userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  return app
}
