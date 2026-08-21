/**
 * Property metadata routes — vault-wide property key/value listing and query.
 * Provides the data layer that the future Bases feature (Prio 10) will consume.
 *
 * Routes:
 *   GET  /vaults/:vaultId/properties            — All property keys with counts and types
 *   GET  /vaults/:vaultId/properties/:key/values — Observed values for a key (paginated)
 *   POST /vaults/:vaultId/properties/query       — Filter-based file listing
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import type { ILinkIndex, PropertyFilter, PropertyFilterOperator } from '../link-index/index.js'
import type { IPropertyTypeService } from '../property-type/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import { VaultAccessDeniedError } from '../business/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiError {
  code: string
  message: string
  timestamp: string
}

interface PropertyRoutesDeps {
  linkIndexResolver: (vaultId: string) => ILinkIndex | undefined
  propertyTypeService: IPropertyTypeService
  accessControl: IVaultAccessControl
  logger: ILogger
}

// ─── Validation ──────────────────────────────────────────────────────────────

const propertyFilterOperatorSchema = z.enum(['eq', 'neq', 'contains', 'exists', 'not_exists'])

const propertyFilterSchema = z.object({
  key: z.string().min(1).max(100),
  operator: propertyFilterOperatorSchema,
  value: z.string().max(500).optional(),
})

const propertyQueryBodySchema = z.object({
  filters: z.array(propertyFilterSchema).min(1).max(10),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createApiError(code: string, message: string): ApiError {
  return { code, message, timestamp: new Date().toISOString() }
}

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with property metadata routes.
 */
export function createPropertyRoutes(deps: PropertyRoutesDeps): Hono {
  const { linkIndexResolver, propertyTypeService, accessControl, logger } = deps
  const app = new Hono()

  // GET /vaults/:vaultId/properties — All property keys with counts and registered types
  app.get('/vaults/:vaultId/properties', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string

    try {
      await accessControl.checkReadAccess(vaultId, session.userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        return c.json(createApiError('FORBIDDEN', error.message), 403)
      }
      throw error
    }

    const linkIndex = linkIndexResolver(vaultId)
    if (!linkIndex || !linkIndex.isReady()) {
      return c.json(createApiError('NOT_READY', 'Link index not yet available for this vault'), 503)
    }

    try {
      const propertyKeys = linkIndex.getPropertyKeys()
      const registry = await propertyTypeService.getRegistry(vaultId)

      // Enrich with type info from registry
      const registryMap = new Map(registry.entries.map((e) => [e.key, e.type]))
      const keys = propertyKeys.map((pk) => ({
        key: pk.key,
        count: pk.count,
        type: registryMap.get(pk.key) ?? null,
      }))

      return c.json({ keys }, 200)
    } catch (error) {
      logger.error('Failed to get property keys', { vaultId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  // GET /vaults/:vaultId/properties/:key/values — Values for a specific key (paginated)
  app.get('/vaults/:vaultId/properties/:key/values', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string
    const key = c.req.param('key') as string

    try {
      await accessControl.checkReadAccess(vaultId, session.userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        return c.json(createApiError('FORBIDDEN', error.message), 403)
      }
      throw error
    }

    const linkIndex = linkIndexResolver(vaultId)
    if (!linkIndex || !linkIndex.isReady()) {
      return c.json(createApiError('NOT_READY', 'Link index not yet available for this vault'), 503)
    }

    // Parse pagination params
    const offsetStr = c.req.query('offset')
    const limitStr = c.req.query('limit')
    const offset = offsetStr ? Math.max(0, parseInt(offsetStr, 10) || 0) : 0
    const limit = limitStr ? Math.min(100, Math.max(1, parseInt(limitStr, 10) || 100)) : 100

    try {
      // Get all values (up to a large limit), then paginate
      const allValues = linkIndex.getPropertyValues(key, 1000)
      const total = allValues.length
      const values = allValues.slice(offset, offset + limit)

      return c.json({ key, values, total }, 200)
    } catch (error) {
      logger.error('Failed to get property values', { vaultId, key, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  // POST /vaults/:vaultId/properties/query — Filter-based file listing
  app.post('/vaults/:vaultId/properties/query', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string

    try {
      await accessControl.checkReadAccess(vaultId, session.userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        return c.json(createApiError('FORBIDDEN', error.message), 403)
      }
      throw error
    }

    const linkIndex = linkIndexResolver(vaultId)
    if (!linkIndex || !linkIndex.isReady()) {
      return c.json(createApiError('NOT_READY', 'Link index not yet available for this vault'), 503)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = propertyQueryBodySchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const filters: PropertyFilter[] = result.data.filters.map((f) => ({
        key: f.key,
        operator: f.operator as PropertyFilterOperator,
        value: f.value,
      }))

      const files = linkIndex.queryByProperties(filters)
      const total = files.length

      return c.json({ files, total }, 200)
    } catch (error) {
      logger.error('Failed to query properties', { vaultId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  return app
}
