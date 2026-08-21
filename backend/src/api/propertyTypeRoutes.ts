/**
 * Property-type routes module — per-vault property type definitions for frontmatter keys.
 * All routes require authentication and vault access.
 *
 * Routes:
 *   GET  /vaults/:vaultId/property-types      — Get full property type registry
 *   PUT  /vaults/:vaultId/property-types      — Replace entire registry
 *   PUT  /vaults/:vaultId/property-types/:key — Upsert a single property type entry
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { IPropertyTypeService } from '../property-type/index.js'
import { PropertyTypeReservedKeyError, PropertyTypeMaxEntriesError } from '../property-type/index.js'
import { propertyTypeRegistrySchema, propertyTypeEntrySchema } from '../property-type/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import { VaultAccessDeniedError } from '../business/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiError {
  code: string
  message: string
  timestamp: string
}

interface PropertyTypeRoutesDeps {
  propertyTypeService: IPropertyTypeService
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
 * Creates a Hono sub-app with property-type management routes.
 * Mounted under /vaults/:vaultId/property-types in the authenticated router.
 */
export function createPropertyTypeRoutes(deps: PropertyTypeRoutesDeps): Hono {
  const { propertyTypeService, accessControl, vaultRegistry, logger } = deps
  const app = new Hono()

  // GET /vaults/:vaultId/property-types — Any user with read access can view
  app.get('/vaults/:vaultId/property-types', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string

    try {
      await accessControl.checkReadAccess(vaultId, session.userId)
      const registry = await propertyTypeService.getRegistry(vaultId)
      return c.json(registry, 200)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        return c.json(createApiError('FORBIDDEN', error.message), 403)
      }
      logger.error('Failed to get property type registry', { vaultId, userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  // PUT /vaults/:vaultId/property-types — Replace entire registry (write access required)
  app.put('/vaults/:vaultId/property-types', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string

    // Check vault existence and write access
    const entry = vaultRegistry.findById(vaultId)
    if (entry === null) {
      return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
    }

    try {
      await accessControl.checkWriteAccess(vaultId, session.userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        return c.json(createApiError('FORBIDDEN', error.message), 403)
      }
      throw error
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = propertyTypeRegistrySchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const saved = await propertyTypeService.saveRegistry(vaultId, result.data)
      return c.json(saved, 200)
    } catch (error) {
      if (error instanceof PropertyTypeMaxEntriesError) {
        return c.json(createApiError('VALIDATION_ERROR', error.message), 400)
      }
      logger.error('Failed to save property type registry', { vaultId, userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  // PUT /vaults/:vaultId/property-types/:key — Upsert a single entry (write access required)
  app.put('/vaults/:vaultId/property-types/:key', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string
    const key = c.req.param('key') as string

    // Check vault existence and write access
    const vaultEntry = vaultRegistry.findById(vaultId)
    if (vaultEntry === null) {
      return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
    }

    try {
      await accessControl.checkWriteAccess(vaultId, session.userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        return c.json(createApiError('FORBIDDEN', error.message), 403)
      }
      throw error
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    // Validate the entry body — the key from the URL overrides any key in the body
    const entryBody = typeof body === 'object' && body !== null ? { ...body, key } : { key }
    const result = propertyTypeEntrySchema.safeParse(entryBody)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const registry = await propertyTypeService.upsertEntry(vaultId, result.data)
      return c.json(registry, 200)
    } catch (error) {
      if (error instanceof PropertyTypeReservedKeyError) {
        return c.json(createApiError('VALIDATION_ERROR', error.message), 400)
      }
      if (error instanceof PropertyTypeMaxEntriesError) {
        return c.json(createApiError('VALIDATION_ERROR', error.message), 400)
      }
      logger.error('Failed to upsert property type entry', { vaultId, key, userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  return app
}
