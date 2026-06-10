/**
 * Feature-guard middleware factory.
 *
 * Creates a Hono middleware that blocks requests with HTTP 403
 * when the specified feature is disabled or not registered.
 */

import type { MiddlewareHandler } from 'hono'
import type { IFeatureToggleService } from './types.js'

/**
 * Creates a Hono middleware that guards routes behind a feature toggle.
 *
 * If the feature is enabled, the request passes through unchanged.
 * If the feature is disabled or not registered, the middleware responds
 * with HTTP 403 and a JSON error body in the standard API format.
 *
 * @param featureName - The feature name to check against the toggle service
 * @param toggleService - The feature toggle service instance
 * @returns A Hono MiddlewareHandler
 */
export function createFeatureGuard(
  featureName: string,
  toggleService: IFeatureToggleService,
): MiddlewareHandler {
  return async (c, next) => {
    if (toggleService.isEnabled(featureName)) {
      await next()
      return
    }

    return c.json(
      {
        code: 'FEATURE_DISABLED',
        message: `Feature '${featureName}' is currently disabled`,
        timestamp: new Date().toISOString(),
      },
      403,
    )
  }
}
