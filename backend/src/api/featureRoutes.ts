// Feature Toggle Route Module — Admin + Public Feature Endpoints

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { IFeatureToggleService } from '../feature-toggle/index.js'
import { FeatureNotFoundError } from '../feature-toggle/index.js'
import type { IAuditService } from '../audit/index.js'
import type { SessionContext } from '../auth/index.js'
import type { RouteModule } from './index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Standard API error response format.
 */
interface ApiError {
  code: string
  message: string
  timestamp: string
}

/**
 * Dependencies required to create the feature route modules.
 */
export interface FeatureRouteDeps {
  featureToggleService: IFeatureToggleService
  auditService?: IAuditService
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

/**
 * Schema for the PUT /admin/features/:featureName request body.
 */
const toggleUpdateSchema = z.object({
  enabled: z.boolean(),
})

// ─── Admin Feature Routes ────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with admin-only feature toggle routes.
 * Routes:
 *   GET  /features       — List all feature toggles
 *   PUT  /features/:featureName — Update a feature toggle
 *
 * These routes are intended to be mounted under /admin on a parent router
 * that already enforces admin-only access.
 */
export function createAdminFeatureRoutes(deps: FeatureRouteDeps): Hono {
  const app = new Hono()
  const { featureToggleService, auditService } = deps

  // GET /features — Returns all feature toggles (name, enabled, type, description)
  app.get('/features', (c: Context) => {
    const features = featureToggleService.getAll()
    return c.json(features, 200)
  })

  // PUT /features/:featureName — Toggle a feature's enabled state
  app.put('/features/:featureName', async (c: Context) => {
    const featureName = c.req.param('featureName') as string

    // Validate request body with Zod
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const parsed = toggleUpdateSchema.safeParse(body)
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      const message = firstError !== undefined ? firstError.message : 'Field "enabled" must be a boolean'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    const { enabled } = parsed.data

    // Get old state for audit log
    const oldState = featureToggleService.get(featureName)

    try {
      const result = featureToggleService.setEnabled(featureName, enabled)

      // Audit log entry for toggle change
      if (auditService) {
        const session = c.get('session') as SessionContext
        const oldEnabled = oldState ? oldState.enabled : !enabled
        const clientIp = (c.get('clientIp') as string | undefined) ?? '0.0.0.0'

        await auditService.log({
          userId: session.userId,
          action: 'FEATURE_TOGGLED',
          target: featureName,
          ipAddress: clientIp,
          success: true,
          details: JSON.stringify({ oldEnabled, newEnabled: enabled }),
        })
      }

      return c.json(result, 200)
    } catch (error) {
      if (error instanceof FeatureNotFoundError) {
        return c.json(createApiError('FEATURE_NOT_FOUND', error.message), 404)
      }
      throw error
    }
  })

  return app
}

// ─── Public Feature Routes ───────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with the public features endpoint.
 * Routes:
 *   GET /features — Returns all features with only name + enabled (for any authenticated user)
 *
 * This route is intended to be mounted under /api/v1 on a parent router
 * that enforces authentication (but not admin-only access).
 */
export function createPublicFeatureRoutes(deps: FeatureRouteDeps): Hono {
  const app = new Hono()
  const { featureToggleService } = deps

  // GET /features — Returns array of { name, enabled } for all authenticated users
  app.get('/features', (c: Context) => {
    const allFeatures = featureToggleService.getAll()
    const publicFeatures = allFeatures.map(({ name, enabled }) => ({ name, enabled }))
    return c.json(publicFeatures, 200)
  })

  return app
}

// ─── Route Modules ───────────────────────────────────────────────────────────

/**
 * Route module that registers admin feature routes on a parent Hono router.
 * Mounts the admin feature sub-app under /admin.
 */
export class AdminFeatureRouteModule implements RouteModule {
  private readonly adminApp: Hono

  constructor(deps: FeatureRouteDeps) {
    this.adminApp = createAdminFeatureRoutes(deps)
  }

  /**
   * Registers the admin feature sub-app on the given router under /admin.
   */
  register(router: Hono): void {
    router.route('/admin', this.adminApp)
  }
}

/**
 * Route module that registers the public features endpoint on a parent Hono router.
 * Mounts under the root (caller determines prefix like /api/v1).
 */
export class PublicFeatureRouteModule implements RouteModule {
  private readonly publicApp: Hono

  constructor(deps: FeatureRouteDeps) {
    this.publicApp = createPublicFeatureRoutes(deps)
  }

  /**
   * Registers the public feature routes on the given router.
   */
  register(router: Hono): void {
    router.route('/', this.publicApp)
  }
}
