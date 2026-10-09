/**
 * Bases query routes — the metadata query surface the Bases feature consumes.
 *
 * A `.base` file is a normal vault file (read/written through the regular file
 * endpoints); the only Bases-specific backend logic is translating a parsed
 * base's filter/sort/column spec into a `LinkIndexService` query. This module
 * is that translation, kept deliberately thin.
 *
 * Route:
 *   POST /vaults/:vaultId/bases/query — resolve a base query to table rows
 *
 * Vault access is enforced by the shared vault-authorization middleware that
 * guards every `/api/v1/vaults/:vaultId/*` route (read level), so this handler
 * does not repeat the check. The route is additionally feature-gated on
 * `bases` at mount time in the composition root.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import type { ILinkIndex, BaseQueryNode, BaseQuerySpec } from '../link-index/index.js'
import type { ILogger } from '../logger/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiError {
  code: string
  message: string
  timestamp: string
}

interface BasesRoutesDeps {
  linkIndexResolver: (vaultId: string) => Promise<ILinkIndex | undefined>
  logger: ILogger
}

// ─── Validation ──────────────────────────────────────────────────────────────

const operatorSchema = z.enum(['eq', 'neq', 'contains', 'exists', 'empty', 'lt', 'lte', 'gt', 'gte'])

const conditionSchema = z.object({
  property: z.string().min(1).max(200).optional(),
  tag: z.string().min(1).max(200).optional(),
  path: z.string().min(1).max(500).optional(),
  file: z.enum(['name', 'ctime', 'mtime']).optional(),
  op: operatorSchema.optional(),
  value: z.union([z.string().max(1000), z.number(), z.boolean()]).optional(),
  not: z.boolean().optional(),
})

// Recursive filter node: a condition, or an `and`/`or` group. Zod needs a lazy
// type here because the node references itself.
const filterNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ and: z.array(filterNodeSchema).max(100) }),
    z.object({ or: z.array(filterNodeSchema).max(100) }),
    conditionSchema,
  ]),
)

const sortSchema = z.object({
  column: z.string().min(1).max(200),
  direction: z.enum(['asc', 'desc']).optional(),
})

const queryBodySchema = z.object({
  filters: filterNodeSchema.optional(),
  columns: z.array(z.string().min(1).max(200)).max(50),
  sort: z.array(sortSchema).max(10).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createApiError(code: string, message: string): ApiError {
  return { code, message, timestamp: new Date().toISOString() }
}

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with the Bases query route.
 */
export function createBasesRoutes(deps: BasesRoutesDeps): Hono {
  const { linkIndexResolver, logger } = deps
  const app = new Hono()

  // POST /vaults/:vaultId/bases/query — resolve a base query to table rows
  app.post('/vaults/:vaultId/bases/query', async (c: Context) => {
    const vaultId = c.req.param('vaultId') as string

    const linkIndex = await linkIndexResolver(vaultId)
    if (!linkIndex || !linkIndex.isReady()) {
      return c.json(createApiError('NOT_READY', 'Link index not yet available for this vault'), 503)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const parsed = queryBodySchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const spec: BaseQuerySpec = {
        filters: parsed.data.filters as BaseQueryNode | undefined,
        columns: parsed.data.columns,
        sort: parsed.data.sort,
        limit: parsed.data.limit,
      }

      const result = await linkIndex.queryForBase(spec)
      return c.json(result, 200)
    } catch (error) {
      logger.error('Failed to run base query', { vaultId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  return app
}
