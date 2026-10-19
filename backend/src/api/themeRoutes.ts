// Theme Routes — Obsidian themes stored in the vault's `.obsidian/themes/` folder.
//
// Access levels come from vault-authorization-middleware.ts, not from this file: reads
// need read access, and every non-GET route (import, delete, select) falls through to the
// `write` default — themes change vault files and apply to everyone who opens the vault.

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import {
  AppearanceFileInvalidError,
  InvalidThemeIdError,
  ThemeNotFoundError,
  ThemeTooLargeError,
  saveThemeSchema,
  setActiveThemeSchema,
  themeIdSchema,
} from '../themes/index.js'
import type { IThemeService } from '../themes/index.js'
import type { IVaultRegistry } from '../vault/registry.js'

const APPEARANCE_PATH = '.obsidian/appearance.json'

function createApiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return { code, message, timestamp: new Date().toISOString() }
}

export interface ThemeRouteDependencies {
  themeService: IThemeService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/**
 * Creates Hono routes for Obsidian theme management, nested under /vaults/:vaultId/themes.
 *
 *   GET    /           → { themes, activeThemeId }
 *   GET    /active     → { themeId }
 *   PUT    /active     → { themeId: string | null }
 *   GET    /:themeId   → { css, meta }
 *   PUT    /:themeId   → ThemeMeta   (body: { css, manifest? })
 *   DELETE /:themeId   → 204
 */
export function createThemeRoutes(deps: ThemeRouteDependencies): Hono {
  const { themeService, accessControl, vaultRegistry, eventBus, logger } = deps
  const app = new Hono()

  function vaultPathOf(vaultId: string): string | null {
    return vaultRegistry.findById(vaultId)?.storagePath ?? null
  }

  /** Tells other clients of the vault that a theme file or the selection changed. */
  async function publishChange(c: Context, vaultId: string, path: string, action: 'saved' | 'deleted'): Promise<void> {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) return
    try {
      eventBus.publish({
        type: 'vault:change',
        payload: { vaultId, action, path, userId: session.userId, username: session.username },
        target: { kind: 'users', userIds: await accessControl.getUsersWithAccess(vaultId) },
        excludeUserId: session.userId,
      })
    } catch (error) {
      // Live refresh is best-effort; the write itself already succeeded.
      logger.warn('Failed to publish theme change event', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function readJsonBody(c: Context): Promise<unknown | undefined> {
    try {
      return await c.req.json()
    } catch {
      return undefined
    }
  }

  // GET / — all themes plus the active selection
  app.get('/', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const vaultPath = vaultPathOf(vaultId)
    if (vaultPath === null) return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
    try {
      const [themes, activeThemeId] = await Promise.all([
        themeService.listThemes(vaultPath),
        themeService.getActiveThemeId(vaultPath),
      ])
      return c.json({ themes, activeThemeId }, 200)
    } catch (error) {
      return handleThemeError(c, error, logger)
    }
  })

  // GET /active — registered before /:themeId; "active" is a reserved id
  app.get('/active', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const vaultPath = vaultPathOf(vaultId)
    if (vaultPath === null) return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
    try {
      return c.json({ themeId: await themeService.getActiveThemeId(vaultPath) }, 200)
    } catch (error) {
      return handleThemeError(c, error, logger)
    }
  })

  // PUT /active — select a theme (or null for the Slatebase default)
  app.put('/active', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const vaultPath = vaultPathOf(vaultId)
    if (vaultPath === null) return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)

    const body = await readJsonBody(c)
    if (body === undefined) return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    const parsed = setActiveThemeSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(createApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Validation failed'), 400)
    }

    try {
      await themeService.setActiveThemeId(vaultPath, parsed.data.themeId)
      await publishChange(c, vaultId, APPEARANCE_PATH, 'saved')
      return c.json({ themeId: parsed.data.themeId }, 200)
    } catch (error) {
      return handleThemeError(c, error, logger)
    }
  })

  // GET /:themeId — CSS plus metadata
  app.get('/:themeId', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const themeId = c.req.param('themeId') as string
    const vaultPath = vaultPathOf(vaultId)
    if (vaultPath === null) return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
    const idCheck = themeIdSchema.safeParse(themeId)
    if (!idCheck.success) {
      return c.json(createApiError('VALIDATION_ERROR', idCheck.error.issues[0]?.message ?? 'Invalid theme ID'), 400)
    }

    try {
      const loaded = await themeService.loadTheme(vaultPath, themeId)
      if (loaded === null) return c.json(createApiError('THEME_NOT_FOUND', `Theme "${themeId}" not found`), 404)
      return c.json(loaded, 200)
    } catch (error) {
      return handleThemeError(c, error, logger)
    }
  })

  // PUT /:themeId — create or overwrite a theme (import)
  app.put('/:themeId', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const themeId = c.req.param('themeId') as string
    const vaultPath = vaultPathOf(vaultId)
    if (vaultPath === null) return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
    const idCheck = themeIdSchema.safeParse(themeId)
    if (!idCheck.success) {
      return c.json(createApiError('VALIDATION_ERROR', idCheck.error.issues[0]?.message ?? 'Invalid theme ID'), 400)
    }

    const body = await readJsonBody(c)
    if (body === undefined) return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    const parsed = saveThemeSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(createApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Validation failed'), 400)
    }

    try {
      const meta = await themeService.saveTheme(vaultPath, themeId, parsed.data.css, parsed.data.manifest)
      await publishChange(c, vaultId, `.obsidian/themes/${themeId}/theme.css`, 'saved')
      logger.info('Theme saved', { vaultId, themeId, size: meta.size })
      return c.json(meta, 200)
    } catch (error) {
      return handleThemeError(c, error, logger)
    }
  })

  // DELETE /:themeId — remove the theme folder (and reset the selection if it was active)
  app.delete('/:themeId', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const themeId = c.req.param('themeId') as string
    const vaultPath = vaultPathOf(vaultId)
    if (vaultPath === null) return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
    const idCheck = themeIdSchema.safeParse(themeId)
    if (!idCheck.success) {
      return c.json(createApiError('VALIDATION_ERROR', idCheck.error.issues[0]?.message ?? 'Invalid theme ID'), 400)
    }

    try {
      // A stat, not loadTheme: a theme over the size limit must still be deletable.
      if (!(await themeService.themeExists(vaultPath, themeId))) {
        return c.json(createApiError('THEME_NOT_FOUND', `Theme "${themeId}" not found`), 404)
      }
      const wasActive = (await themeService.getActiveThemeId(vaultPath)) === themeId
      await themeService.deleteTheme(vaultPath, themeId)
      await publishChange(c, vaultId, `.obsidian/themes/${themeId}/theme.css`, 'deleted')
      // The selection file only changed if the deleted theme was the active one.
      if (wasActive) await publishChange(c, vaultId, APPEARANCE_PATH, 'saved')
      logger.info('Theme deleted', { vaultId, themeId })
      return c.body(null, 204)
    } catch (error) {
      return handleThemeError(c, error, logger)
    }
  })

  return app
}

function handleThemeError(c: Context, error: unknown, logger: ILogger): Response {
  if (error instanceof InvalidThemeIdError) {
    return c.json(createApiError('VALIDATION_ERROR', error.message), 400)
  }
  if (error instanceof ThemeNotFoundError) {
    return c.json(createApiError('THEME_NOT_FOUND', error.message), 404)
  }
  if (error instanceof ThemeTooLargeError) {
    return c.json(createApiError('THEME_TOO_LARGE', error.message), 413)
  }
  if (error instanceof AppearanceFileInvalidError) {
    return c.json(createApiError('APPEARANCE_FILE_INVALID', error.message), 409)
  }
  logger.error('Unexpected error in theme route', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
}
