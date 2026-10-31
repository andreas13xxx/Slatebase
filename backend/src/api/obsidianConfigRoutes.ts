// Routes for one JSON config file in a vault's `.obsidian/` folder (app.json, appearance.json, ...).
//
// Access levels come from vault-authorization-middleware.ts: GET needs read access, PATCH falls
// through to the `write` default — the file lives in the vault and applies to everyone who opens it.

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { z } from 'zod'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import { ObsidianConfigFileInvalidError } from '../shared/obsidian-config-file.js'
import { AppearanceFileInvalidError } from '../shared/appearance-file.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { publishVaultChange } from './vaultChangeEvents.js'

function apiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return { code, message, timestamp: new Date().toISOString() }
}

/** What the routes need from the service of a config file. */
export interface ObsidianConfigRouteService<TPatch> {
  get(vaultPath: string, vaultId?: string): Promise<Record<string, unknown>>
  patch(vaultPath: string, patch: TPatch): Promise<Record<string, unknown>>
}

export interface ObsidianConfigRouteDependencies<TPatch> {
  service: ObsidianConfigRouteService<TPatch>
  /** Validates the PATCH body. */
  requestSchema: z.ZodType<TPatch>
  /** Path of the file as `vault:change` reports it, e.g. `.obsidian/app.json`. */
  filePath: string
  /** Error code when the file exists but is not a JSON object, e.g. `APP_CONFIG_INVALID`. */
  invalidCode: string
  /** Name for log lines, e.g. `App config`. */
  label: string
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/**
 * Creates Hono routes for one config file, mounted at `/vaults/:vaultId/<name>`.
 *
 *   GET   /  → { config }   all fields of the file (empty object if it does not exist)
 *   PATCH /  → { config }   body: known keys; `null` removes a key
 */
export function createObsidianConfigRoutes<TPatch>(deps: ObsidianConfigRouteDependencies<TPatch>): Hono {
  const { service, requestSchema, filePath, invalidCode, label, accessControl, vaultRegistry, eventBus, logger } = deps
  const app = new Hono()

  const handleError = (c: Context, error: unknown): Response => {
    if (error instanceof ObsidianConfigFileInvalidError || error instanceof AppearanceFileInvalidError) {
      return c.json(apiError(invalidCode, error.message), 409)
    }
    logger.error(`${label} request failed`, { error: error instanceof Error ? error.message : String(error) })
    return c.json(apiError('INTERNAL_ERROR', `${label} request failed`), 500)
  }

  const vaultPathOf = (c: Context): string | null => {
    const vaultId = c.req.param('vaultId')
    return vaultId ? (vaultRegistry.findById(vaultId)?.storagePath ?? null) : null
  }

  app.get('/', async (c: Context): Promise<Response> => {
    const vaultPath = vaultPathOf(c)
    if (vaultPath === null) return c.json(apiError('VAULT_NOT_FOUND', 'Vault not found'), 404)
    try {
      return c.json({ config: await service.get(vaultPath, c.req.param('vaultId')) }, 200)
    } catch (error) {
      return handleError(c, error)
    }
  })

  app.patch('/', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const vaultPath = vaultPathOf(c)
    if (vaultPath === null) return c.json(apiError('VAULT_NOT_FOUND', 'Vault not found'), 404)

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(apiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    }
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
      return c.json(apiError('VALIDATION_ERROR', `${where}${issue?.message ?? 'Invalid request body'}`), 400)
    }

    try {
      const config = await service.patch(vaultPath, parsed.data)
      await publishVaultChange({ eventBus, accessControl, logger }, c, vaultId, filePath, 'saved')
      return c.json({ config }, 200)
    } catch (error) {
      return handleError(c, error)
    }
  })

  return app
}
