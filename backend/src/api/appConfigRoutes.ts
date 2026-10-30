// App Config Routes — the vault's `.obsidian/app.json`.
//
// Access levels come from vault-authorization-middleware.ts: GET needs read access, PATCH falls
// through to the `write` default — the file lives in the vault and applies to everyone who opens it.

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import type { IAppConfigService } from '../obsidian-config/index.js'
import { appConfigRequestSchema } from '../obsidian-config/index.js'
import { ObsidianConfigFileInvalidError } from '../shared/obsidian-config-file.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { publishVaultChange } from './vaultChangeEvents.js'

const APP_CONFIG_PATH = '.obsidian/app.json'

function apiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return { code, message, timestamp: new Date().toISOString() }
}

export interface AppConfigRouteDependencies {
  appConfigService: IAppConfigService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/**
 * Creates Hono routes for the vault's app.json, nested under /vaults/:vaultId/app-config.
 *
 *   GET   /  → { config }   all fields of the file (empty object if it does not exist)
 *   PATCH /  → { config }   body: known keys; `null` removes a key
 */
export function createAppConfigRoutes(deps: AppConfigRouteDependencies): Hono {
  const { appConfigService, accessControl, vaultRegistry, eventBus, logger } = deps
  const app = new Hono()

  const handleError = (c: Context, error: unknown): Response => {
    if (error instanceof ObsidianConfigFileInvalidError) {
      return c.json(apiError('APP_CONFIG_INVALID', error.message), 409)
    }
    logger.error('App config request failed', { error: error instanceof Error ? error.message : String(error) })
    return c.json(apiError('INTERNAL_ERROR', 'App config request failed'), 500)
  }

  const vaultPathOf = (c: Context): string | null => {
    const vaultId = c.req.param('vaultId')
    return vaultId ? (vaultRegistry.findById(vaultId)?.storagePath ?? null) : null
  }

  app.get('/', async (c: Context): Promise<Response> => {
    const vaultPath = vaultPathOf(c)
    if (vaultPath === null) return c.json(apiError('VAULT_NOT_FOUND', 'Vault not found'), 404)
    try {
      return c.json({ config: await appConfigService.get(vaultPath) }, 200)
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
    const parsed = appConfigRequestSchema.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
      return c.json(apiError('VALIDATION_ERROR', `${where}${issue?.message ?? 'Invalid request body'}`), 400)
    }

    try {
      const config = await appConfigService.patch(vaultPath, parsed.data)
      await publishVaultChange({ eventBus, accessControl, logger }, c, vaultId, APP_CONFIG_PATH, 'saved')
      return c.json({ config }, 200)
    } catch (error) {
      return handleError(c, error)
    }
  })

  return app
}
