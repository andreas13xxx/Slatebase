// Plugin Routes — Route module for plugin management endpoints (CRUD + upload)

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { PluginRegistryData } from '../plugin/types.js'
import type { IPluginService } from '../plugin/plugin-service.js'
import type { PluginInstallResult } from '../plugin/plugin-installer.js'
import { PluginNotFoundError, PluginFileTooLargeError, PluginSettingsTooLargeError } from '../plugin/errors.js'
import { PluginInstallError } from '../plugin/plugin-installer.js'
import { pluginRegistrySchema } from '../plugin/validation.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'
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
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Invalid plugin ID: must contain only lowercase letters, digits, and hyphens (1-64 chars)'),
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
  const { pluginService, accessControl, vaultRegistry, logger } = deps
  const app = new Hono()

  // ─── Detected plugins route (scans .obsidian/plugins/ inside vault filesystem) ───

  // GET /detected — List plugins detected in .obsidian/plugins/ directory
  app.get('/detected', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

    try {
      const entry = vaultRegistry.findById(vaultId)
      if (entry === null) {
        return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
      }

      const detected = await pluginService.listDetected(entry.storagePath)
      return c.json({ plugins: detected }, 200)
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // POST /detected/:pluginId/install — Install a detected plugin from .obsidian/plugins/
  app.post('/detected/:pluginId/install', async (c: Context): Promise<Response> => {
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

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

    try {
      const entry = vaultRegistry.findById(vaultId)
      if (entry === null) {
        return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
      }

      const result = await pluginService.installDetected(vaultId, pluginId, entry.storagePath)

      // Persist hasEvalUsage in registry if eval/Function patterns were detected
      if (result.warnings.length > 0) {
        const hasEvalUsage = result.warnings.some((w) => w.includes('eval(') || w.includes('new Function('))
        if (hasEvalUsage) {
          const registry = await pluginService.loadRegistry(vaultId)
          const now = new Date().toISOString()
          const existingEntry = registry?.plugins?.[result.pluginId]
          const updatedRegistry = {
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
          await pluginService.saveRegistry(vaultId, updatedRegistry)
        }
      }

      return c.json(result, 201)
    } catch (error) {
      return handlePluginError(c, error, logger)
    }
  })

  // ─── Registry Routes (BEFORE :pluginId to avoid "registry" being parsed as param) ───

  // PUT /registry — Save registry state
  app.put('/registry', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string

    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

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

    const parsed = pluginRegistrySchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Validation failed'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      await pluginService.saveRegistry(vaultId, parsed.data as PluginRegistryData)
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

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

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

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

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

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

    try {
      const body = await c.req.parseBody()
      const file = body['file']

      if (!file || !(file instanceof File)) {
        return c.json(createApiError('VALIDATION_ERROR', 'Missing required file field (multipart/form-data with "file" key)'), 400)
      }

      // Check ZIP size limit (5 MB)
      const maxZipSize = 5 * 1024 * 1024
      if (file.size > maxZipSize) {
        return c.json(
          createApiError('FILE_TOO_LARGE', `ZIP file exceeds maximum size of ${maxZipSize} bytes (actual: ${file.size})`),
          413,
        )
      }

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const result: PluginInstallResult = await pluginService.installFromZip(vaultId, buffer)

      // Persist hasEvalUsage in registry if eval/Function patterns were detected
      if (result.warnings.length > 0) {
        const hasEvalUsage = result.warnings.some((w) => w.includes('eval(') || w.includes('new Function('))
        if (hasEvalUsage) {
          const registry = await pluginService.loadRegistry(vaultId)
          const now = new Date().toISOString()
          const existingEntry = registry?.plugins?.[result.pluginId]
          const updatedRegistry = {
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
          await pluginService.saveRegistry(vaultId, updatedRegistry)
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

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
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

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

    try {
      // Verify plugin exists before deleting
      const manifest = await pluginService.getManifest(vaultId, pluginId)
      if (manifest === null) {
        return c.json(createApiError('PLUGIN_NOT_FOUND', `Plugin "${pluginId}" not found in vault "${vaultId}"`), 404)
      }

      await pluginService.deletePlugin(vaultId, pluginId)
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

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
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

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
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

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
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

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) {
      return authResult.response
    }

    try {
      const rawBody = await c.req.text()

      // Validate size (max 1 MB)
      const maxSettingsSize = 1 * 1024 * 1024
      const size = Buffer.byteLength(rawBody, 'utf-8')
      if (size > maxSettingsSize) {
        return c.json(
          createApiError('SETTINGS_TOO_LARGE', `Plugin settings exceed maximum size of 1 MB (actual: ${size} bytes)`),
          413,
        )
      }

      // Validate that body is valid JSON
      try {
        JSON.parse(rawBody)
      } catch {
        return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
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


