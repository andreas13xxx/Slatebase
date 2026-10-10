/**
 * Activity timeline read route.
 *
 * Returns a page of recorded vault activity, newest first, for the activity
 * timeline view. Recording happens as a side effect of vault mutations (see
 * `VaultController`, `trashRoutes`, MCP `tool-handlers`); this module only
 * reads back what the {@link import('../activity/index.js').ActivityStore} wrote.
 *
 * Route:
 *   GET /vaults/:vaultId/activity — a page of events (type/time filtered, paginated)
 *
 * Vault access is enforced by the shared vault-authorization middleware that
 * guards every `/api/v1/vaults/:vaultId/*` route (read level), so this handler
 * does not repeat the check. The route is additionally feature-gated on
 * `activity-timeline` at mount time in the composition root.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import type { ILogger } from '../logger/index.js'
import type { IActivityService, ActivityEventType, ActivityQuery } from '../activity/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiError {
  code: string
  message: string
  timestamp: string
}

interface ActivityRoutesDeps {
  activityService: IActivityService
  logger: ILogger
}

// ─── Validation ──────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  'note.created',
  'note.edited',
  'note.deleted',
  'note.moved',
  'note.restored',
  'canvas.created',
  'canvas.edited',
  'canvas.deleted',
  'base.created',
  'base.edited',
  'base.deleted',
  'snippet.created',
  'snippet.edited',
  'snippet.deleted',
] as const

const eventTypeSchema = z.enum(EVENT_TYPES)

const querySchema = z.object({
  /** Comma-separated list of event types to include. */
  types: z
    .string()
    .optional()
    .transform(v => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined)),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createApiError(code: string, message: string): ApiError {
  return { code, message, timestamp: new Date().toISOString() }
}

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with the activity timeline read route.
 */
export function createActivityRoutes(deps: ActivityRoutesDeps): Hono {
  const { activityService, logger } = deps
  const app = new Hono()

  // GET /vaults/:vaultId/activity — a page of events, newest first
  app.get('/vaults/:vaultId/activity', async (c: Context) => {
    const vaultId = c.req.param('vaultId') as string

    const parsed = querySchema.safeParse({
      types: c.req.query('types'),
      from: c.req.query('from'),
      to: c.req.query('to'),
      cursor: c.req.query('cursor'),
      limit: c.req.query('limit'),
    })
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid query'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    // Validate each requested type against the known set (reject unknown filters).
    let types: ActivityEventType[] | undefined
    if (parsed.data.types) {
      const invalid = parsed.data.types.find(t => !eventTypeSchema.safeParse(t).success)
      if (invalid !== undefined) {
        return c.json(createApiError('VALIDATION_ERROR', `Unknown event type: ${invalid}`), 400)
      }
      types = parsed.data.types as ActivityEventType[]
    }

    try {
      const query: ActivityQuery = {
        limit: parsed.data.limit ?? 50,
        ...(types ? { types } : {}),
        ...(parsed.data.from ? { from: parsed.data.from } : {}),
        ...(parsed.data.to ? { to: parsed.data.to } : {}),
        ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
      }
      const page = await activityService.query(vaultId, query)
      return c.json(page, 200)
    } catch (error) {
      logger.error('Failed to read activity', { vaultId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  return app
}
