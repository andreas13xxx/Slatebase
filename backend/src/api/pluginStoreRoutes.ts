// ─── Plugin Store Routes ──────────────────────────────────────────────────────

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { IPluginStoreService } from '../plugin-store/plugin-store-service.js'
import {
  GitHubRateLimitError,
  GitHubFetchError,
  DesktopOnlyPluginError,
  AssetTooLargeError,
  PluginNotInStoreError,
  UpstreamError,
} from '../plugin-store/errors.js'
import { storeInstallSchema } from '../plugin-store/validation.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import { checkVaultReadAccess } from './access-check.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Dependencies ────────────────────────────────────────────────────────────

/**
 * Dependencies required by the plugin store route modules.
 */
export interface PluginStoreRouteDependencies {
  pluginStoreService: IPluginStoreService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  logger: ILogger
}

// ─── Global Plugin Store Routes ──────────────────────────────────────────────

/**
 * Creates Hono routes for the global plugin store (not vault-specific).
 * Routes:
 * - GET /plugins — Community plugin list (cached)
 * - GET /plugins/:pluginId/manifest — Remote manifest for a plugin
 *
 * All routes require an authenticated session.
 *
 * @param deps - Dependencies for the route module.
 * @returns A Hono instance with global plugin store routes registered.
 */
export function createPluginStoreRoutes(deps: PluginStoreRouteDependencies): Hono {
  const { pluginStoreService, logger } = deps
  const app = new Hono()

  // GET /plugins — Community plugin list (cached)
  app.get('/plugins', async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      return c.json(createApiError('UNAUTHORIZED', 'Missing session context'), 401)
    }

    try {
      const plugins = await pluginStoreService.getPluginList()
      return c.json({
        plugins,
        cachedAt: new Date().toISOString(),
        total: plugins.length,
      }, 200)
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  // GET /plugins/stats — Release stats for all plugins (cached)
  // NOTE: Must be registered BEFORE /plugins/:pluginId/* to avoid "stats" being matched as pluginId
  app.get('/plugins/stats', async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      return c.json(createApiError('UNAUTHORIZED', 'Missing session context'), 401)
    }

    try {
      const result = await pluginStoreService.getPluginStats()
      return c.json(result, 200)
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  // GET /plugins/:pluginId/manifest — Remote manifest for a plugin
  app.get('/plugins/:pluginId/manifest', async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      return c.json(createApiError('UNAUTHORIZED', 'Missing session context'), 401)
    }

    const pluginId = c.req.param('pluginId') as string

    try {
      // Look up the repo from the plugin list
      const plugins = await pluginStoreService.getPluginList()
      const entry = plugins.find(p => p.id === pluginId)
      if (entry === undefined) {
        return c.json(createApiError('PLUGIN_NOT_FOUND', `Plugin "${pluginId}" not found in community store`), 404)
      }

      const manifest = await pluginStoreService.getRemoteManifest(entry.repo)
      return c.json({ manifest }, 200)
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  return app
}

// ─── Vault-Specific Plugin Store Routes ──────────────────────────────────────

/**
 * Creates Hono routes for vault-specific plugin store operations.
 * Routes:
 * - POST /store-install — Install a plugin from the community store
 * - POST /check-updates — Check for available updates
 * - POST /:pluginId/update — Update a single plugin
 * - POST /update-all — Update all plugins with available updates
 *
 * All routes require an authenticated session and vault access.
 *
 * @param deps - Dependencies for the route module.
 * @returns A Hono instance with vault-specific plugin store routes registered.
 */
export function createVaultPluginStoreRoutes(deps: PluginStoreRouteDependencies): Hono {
  const { pluginStoreService, accessControl, vaultRegistry, logger } = deps
  const app = new Hono()

  // POST /store-install — Install a plugin from the community store
  app.post('/store-install', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    }

    const parsed = storeInstallSchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Validation failed'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    const { pluginId, repo } = parsed.data

    try {
      const result = await pluginStoreService.installFromStore(vaultId, pluginId, repo)
      return c.json(result, 201)
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  // POST /check-updates — Check for available updates
  app.post('/check-updates', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

    try {
      const result = await pluginStoreService.checkUpdates(vaultId)
      return c.json(result, 200)
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  // POST /update-all — Bulk update all plugins (BEFORE :pluginId/update to avoid param conflict)
  app.post('/update-all', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

    try {
      const result = await pluginStoreService.updateAll(vaultId)
      return c.json(result, 200)
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  // POST /:pluginId/update — Update a single plugin
  app.post('/:pluginId/update', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const pluginId = c.req.param('pluginId') as string

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

    try {
      const result = await pluginStoreService.updatePlugin(vaultId, pluginId)
      return c.json(result, 200)
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  return app
}

// ─── Error Mapping ───────────────────────────────────────────────────────────

/**
 * Maps plugin store domain errors to HTTP status codes and structured API error responses.
 */
function handleStoreError(c: Context, error: unknown, logger: ILogger): Response {
  if (error instanceof GitHubRateLimitError) {
    logger.warn('GitHub rate limit exceeded', { retryAfter: error.retryAfter, remaining: error.remaining })
    return c.json({
      ...createApiError('RATE_LIMIT_EXCEEDED', error.message),
      retryAfter: error.retryAfter,
    }, 429)
  }

  if (error instanceof GitHubFetchError) {
    logger.warn('GitHub fetch error', { statusCode: error.statusCode, url: error.url })
    return c.json(createApiError('UPSTREAM_ERROR', 'GitHub API request failed'), 502)
  }

  if (error instanceof DesktopOnlyPluginError) {
    logger.info('Desktop-only plugin install attempted', { pluginId: error.pluginId })
    return c.json(createApiError('DESKTOP_ONLY_PLUGIN', error.message), 400)
  }

  if (error instanceof AssetTooLargeError) {
    logger.warn('Plugin asset too large', { assetName: error.assetName, actualSize: error.actualSize, maxSize: error.maxSize })
    return c.json(createApiError('ASSET_TOO_LARGE', error.message), 400)
  }

  if (error instanceof PluginNotInStoreError) {
    logger.info('Plugin not in store', { pluginId: error.pluginId })
    return c.json(createApiError('PLUGIN_NOT_FOUND', error.message), 404)
  }

  if (error instanceof UpstreamError) {
    logger.warn('Upstream unavailable', { cause: error.cause })
    return c.json(createApiError('UPSTREAM_ERROR', error.message), 502)
  }

  if (error instanceof VaultAccessDeniedError) {
    return c.json(createApiError('FORBIDDEN', error.message), 403)
  }

  // Unknown / internal errors
  logger.error('Unexpected error in plugin store route', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
}
