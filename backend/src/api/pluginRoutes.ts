// Plugin Routes — Route module for plugin management endpoints (CRUD + upload)

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import { PLUGIN_LIMITS, formatPluginLimit } from '@slatebase/shared-contracts'
import type { PluginRegistryData } from '../plugin/types.js'
import type { IPluginService } from '../plugin/plugin-service.js'
import type { PluginInstallResult } from '../plugin/plugin-installer.js'
import {
  CommunityPluginsFileInvalidError,
  PluginNotFoundError,
  PluginFileTooLargeError,
  PluginSettingsTooLargeError,
} from '../plugin/errors.js'
import { PluginInstallError } from '../plugin/plugin-installer.js'
import { PLUGIN_ID_PATTERN, pluginRegistrySchema } from '../plugin/validation.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import { COMMUNITY_PLUGINS_PATH, pluginManifestPath, publishVaultChange } from './vaultChangeEvents.js'

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

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

/**
 * Schema for vaultId path parameter.
 * Vault IDs are deterministic SHA-256 hashes, max 24 hex chars.
 */
const vaultIdParamSchema = z.object({
  vaultId: z.string().min(1, 'vaultId must not be empty').max(24, 'vaultId too long'),
})

/**
 * Schema for plugin ID path parameter.
 * Lowercase alphanumeric + hyphens, max 64 chars.
 */
const pluginIdParamSchema = z.object({
  pluginId: z.string()
    .min(1, 'pluginId must not be empty')
    .max(64, 'pluginId must not exceed 64 characters')
    .regex(PLUGIN_ID_PATTERN, 'Invalid plugin ID: must contain only letters, digits, ".", "_" and "-", start with a letter or digit, and not end with "." (1-64 chars)'),
})

/**
 * Validates a vaultId param via the zod schema and returns an error response if invalid.
 * Returns null if validation passes.
 */
function validateVaultIdParam(c: Context, vaultId: string): Response | null {
  const parsed = vaultIdParamSchema.safeParse({ vaultId })
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const message = firstIssue ? firstIssue.message : 'Invalid vaultId'
    return c.json(createApiError('VALIDATION_ERROR', message), 400)
  }
  return null
}

// ─── Dependencies ────────────────────────────────────────────────────────────

/**
 * Dependencies required by the plugin route module.
 */
export interface PluginRouteDependencies {
  pluginService: IPluginService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Creates Hono routes for plugin management operations.
 * All routes are nested under /vaults/:vaultId/plugins.
 * Access control: same as vault files (owner + shared users with read access).
 *
 * @param deps - Dependencies for the route module.
 * @returns A Hono instance with plugin management routes registered.
 */
export function createPluginRoutes(deps: PluginRouteDependencies): Hono {
  const { pluginService, accessControl, eventBus, logger } = deps
  const publish = (c: Context, vaultId: string, path: string, action: 'saved' | 'deleted'): Promise<void> =>
    publishVaultChange({ eventBus, accessControl, logger }, c, vaultId, path, action)
  const app = new Hono()

  // ─── Registry Routes (BEFORE :pluginId to avoid "registry" being parsed as param) ───

  // PUT /registry — Save registry state
  app.put('/registry', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    }

    const parsed = pluginRegistrySchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Validation failed'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      await pluginService.saveRegistry(vaultId, parsed.data as PluginRegistryData)
      await publish(c, vaultId, COMMUNITY_PLUGINS_PATH, 'saved')
      return c.body(null, 204)
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // GET /registry — Load registry state
  app.get('/registry', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    try {
      const registry = await pluginService.loadRegistry(vaultId)
      if (registry === null) {
        return c.json({ version: 1, plugins: {} }, 200)
      }
      return c.json(registry, 200)
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // ─── Collection Routes ─────────────────────────────────────────────────────

  // GET / — List installed plugins
  app.get('/', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    try {
      const manifests = await pluginService.listPlugins(vaultId)
      return c.json({ plugins: manifests }, 200)
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // POST / — Upload/install plugin (ZIP, multipart/form-data)
  app.post('/', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    try {
      const body = await c.req.parseBody()
      const file = body['file']

      if (!file || !(file instanceof File)) {
        return c.json(createApiError('VALIDATION_ERROR', 'Missing required file field (multipart/form-data with "file" key)'), 400)
      }

      // Check ZIP size limit
      const maxZipSize = PLUGIN_LIMITS.maxZipBytes
      if (file.size > maxZipSize) {
        return c.json(
          createApiError('FILE_TOO_LARGE', `ZIP file exceeds maximum size of ${formatPluginLimit(maxZipSize)} (actual: ${formatPluginLimit(file.size)}, ${file.size} bytes)`),
          413,
        )
      }

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const result: PluginInstallResult = await pluginService.installFromZip(vaultId, buffer)
      await publish(c, vaultId, pluginManifestPath(result.pluginId), 'saved')

      // Persist hasEvalUsage in registry if eval/Function patterns were detected
      if (result.warnings.length > 0) {
        const hasEvalUsage = result.warnings.some((w) => w.includes('eval(') || w.includes('new Function('))
        if (hasEvalUsage) {
          await pluginService.mutateRegistry(vaultId, (registry) => {
            const now = new Date().toISOString()
            const existingEntry = registry?.plugins?.[result.pluginId]
            return {
              version: 1 as const,
              plugins: {
                ...(registry?.plugins ?? {}),
                [result.pluginId]: {
                  status: existingEntry?.status ?? ('inactive' as const),
                  permissions: existingEntry?.permissions ?? {
                    network: false,
                    networkAllowlist: [],
                    filesystemWrite: false,
                    domManipulation: false,
                  },
                  compatibilityLevel: existingEntry?.compatibilityLevel ?? ('unknown' as const),
                  installedAt: existingEntry?.installedAt ?? now,
                  updatedAt: now,
                  hasEvalUsage: true,
                },
              },
            }
          })
        }
      }

      return c.json(result, 201)
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // ─── Individual Plugin Routes ──────────────────────────────────────────────

  // GET /:pluginId — Get plugin details
  app.get('/:pluginId', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const pluginId = c.req.param('pluginId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    // Validate plugin ID with zod schema
    const pluginIdParsed = pluginIdParamSchema.safeParse({ pluginId })
    if (!pluginIdParsed.success) {
      const firstIssue = pluginIdParsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Invalid plugin ID'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const manifest = await pluginService.getManifest(vaultId, pluginId)
      if (manifest === null) {
        return c.json(createApiError('PLUGIN_NOT_FOUND', `Plugin "${pluginId}" not found in vault "${vaultId}"`), 404)
      }
      return c.json(manifest, 200)
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // DELETE /:pluginId — Uninstall plugin
  app.delete('/:pluginId', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const pluginId = c.req.param('pluginId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    // Validate plugin ID with zod schema
    const pluginIdParsed = pluginIdParamSchema.safeParse({ pluginId })
    if (!pluginIdParsed.success) {
      const firstIssue = pluginIdParsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Invalid plugin ID'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      // Verify plugin exists before deleting
      const manifest = await pluginService.getManifest(vaultId, pluginId)
      if (manifest === null) {
        return c.json(createApiError('PLUGIN_NOT_FOUND', `Plugin "${pluginId}" not found in vault "${vaultId}"`), 404)
      }

      await pluginService.deletePlugin(vaultId, pluginId)
      await publish(c, vaultId, pluginManifestPath(pluginId), 'deleted')
      return c.body(null, 204)
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // GET /:pluginId/bundle — Download bundle (main.js)
  app.get('/:pluginId/bundle', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const pluginId = c.req.param('pluginId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    // Validate plugin ID with zod schema
    const pluginIdParsed = pluginIdParamSchema.safeParse({ pluginId })
    if (!pluginIdParsed.success) {
      const firstIssue = pluginIdParsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Invalid plugin ID'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const bundle = await pluginService.loadBundle(vaultId, pluginId)
      if (bundle === null) {
        return c.json(createApiError('PLUGIN_NOT_FOUND', `Plugin "${pluginId}" not found in vault "${vaultId}"`), 404)
      }

      return new Response(bundle, {
        status: 200,
        headers: {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Content-Length': Buffer.byteLength(bundle, 'utf-8').toString(),
        },
      })
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // GET /:pluginId/styles — Download styles (styles.css)
  app.get('/:pluginId/styles', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const pluginId = c.req.param('pluginId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    // Validate plugin ID with zod schema
    const pluginIdParsed = pluginIdParamSchema.safeParse({ pluginId })
    if (!pluginIdParsed.success) {
      const firstIssue = pluginIdParsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Invalid plugin ID'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const styles = await pluginService.loadStyles(vaultId, pluginId)
      if (styles === null) {
        // styles.css is optional for Obsidian plugins. Returning a successful
        // empty response prevents browsers from logging a misleading XHR error
        // when an otherwise valid plugin does not ship its own stylesheet.
        return c.body(null, 204)
      }

      return new Response(styles, {
        status: 200,
        headers: {
          'Content-Type': 'text/css; charset=utf-8',
          'Content-Length': Buffer.byteLength(styles, 'utf-8').toString(),
        },
      })
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // GET /:pluginId/settings — Load settings
  app.get('/:pluginId/settings', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const pluginId = c.req.param('pluginId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    // Validate plugin ID with zod schema
    const pluginIdParsed = pluginIdParamSchema.safeParse({ pluginId })
    if (!pluginIdParsed.success) {
      const firstIssue = pluginIdParsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Invalid plugin ID'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const settings = await pluginService.loadSettings(vaultId, pluginId)
      if (settings === null) {
        return c.json(null, 200)
      }

      // Return the raw JSON string as application/json
      return new Response(settings, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      })
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // PUT /:pluginId/settings — Save settings (max 1 MB)
  app.put('/:pluginId/settings', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const pluginId = c.req.param('pluginId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    // Validate plugin ID with zod schema
    const pluginIdParsed = pluginIdParamSchema.safeParse({ pluginId })
    if (!pluginIdParsed.success) {
      const firstIssue = pluginIdParsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Invalid plugin ID'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const rawBody = await c.req.text()

      // Validate size
      const maxSettingsSize = PLUGIN_LIMITS.maxSettingsBytes
      const size = Buffer.byteLength(rawBody, 'utf-8')
      if (size > maxSettingsSize) {
        return c.json(
          createApiError('SETTINGS_TOO_LARGE', `Plugin settings exceed maximum size of ${formatPluginLimit(maxSettingsSize)} (actual: ${size} bytes)`),
          413,
        )
      }

      // Validate that body is valid JSON
      try {
        JSON.parse(rawBody)
      } catch {
        return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
      }

      // Settings are a file in the vault, and this route is open to read-only collaborators (see
      // the access table): without this check they could create plugin folders for any id.
      const manifest = await pluginService.getManifest(vaultId, pluginId)
      if (manifest === null) {
        return c.json(createApiError('PLUGIN_NOT_FOUND', `Plugin "${pluginId}" not found in vault "${vaultId}"`), 404)
      }

      await pluginService.saveSettings(vaultId, pluginId, rawBody)
      return c.body(null, 204)
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  return app
}

// ─── Error Mapping ───────────────────────────────────────────────────────────

/**
 * Maps plugin domain errors to HTTP status codes and structured API error responses.
 */
function handlePluginError(c: Context, error: unknown, logger: ILogger): Response {
  if (error instanceof PluginNotFoundError) {
    logger.warn('Plugin not found', { vaultId: error.vaultId, pluginId: error.pluginId })
    return c.json(createApiError('PLUGIN_NOT_FOUND', error.message), 404)
  }

  if (error instanceof PluginFileTooLargeError) {
    logger.warn('Plugin file too large', { maxSize: error.maxSize, actualSize: error.actualSize })
    return c.json(createApiError('FILE_TOO_LARGE', error.message), 413)
  }

  if (error instanceof PluginSettingsTooLargeError) {
    logger.warn('Plugin settings too large', { pluginId: error.pluginId })
    return c.json(createApiError('SETTINGS_TOO_LARGE', error.message), 413)
  }

  if (error instanceof CommunityPluginsFileInvalidError) {
    return c.json(createApiError('COMMUNITY_PLUGINS_FILE_INVALID', error.message), 409)
  }

  if (error instanceof PluginInstallError) {
    logger.warn('Plugin installation error', { code: error.code, message: error.message })
    return c.json(createApiError(error.code, error.message), 400)
  }

  // Unknown / internal errors
  logger.error('Unexpected error in plugin route', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
}


