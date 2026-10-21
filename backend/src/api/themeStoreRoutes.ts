// Theme Store Routes — browse, install and update Obsidian community themes.
//
// Two routers, mounted by index.ts behind the `obsidian-theme-store` feature guard:
//   /api/v1/theme-store                     catalog and screenshots (no vault involved)
//   /api/v1/vaults/:vaultId/theme-store     update check (GET) and install (POST)
//
// Access levels come from vault-authorization-middleware.ts, not from this file: the update check is a GET and needs
// read access to the vault; install is a POST and falls through to the `write` default, because it writes theme files
// that apply to everyone who opens the vault.

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import { AppearanceFileInvalidError, InvalidThemeIdError, ThemeNotFoundError, ThemeTooLargeError, themeIdSchema } from '../themes/index.js'
import {
  ThemeAlreadyInstalledError,
  ThemeAssetTooLargeError,
  ThemeFilesNotFoundError,
  ThemeIdUnderivableError,
  ThemeManifestInvalidError,
  ThemeManifestMismatchError,
  ThemeNotInCatalogError,
  ThemeStoreFetchError,
  isValidRepo,
} from '../theme-store/index.js'
import type { IThemeStoreService } from '../theme-store/index.js'
import type { IVaultRegistry } from '../vault/registry.js'

const APPEARANCE_PATH = '.obsidian/appearance.json'

function createApiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return { code, message, timestamp: new Date().toISOString() }
}

/** Body of `POST /vaults/:vaultId/theme-store/install`. */
const installSchema = z.object({
  repo: z.string().refine(isValidRepo, 'repo must be "owner/repo"'),
  replace: z.boolean().optional().default(false),
  activate: z.boolean().optional().default(false),
  /** Folder of the installed theme to update in place (from the update check). */
  themeId: themeIdSchema.optional(),
})

export interface ThemeStoreRouteDependencies {
  themeStoreService: IThemeStoreService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/**
 * Catalog and screenshot routes (no vault involved), mounted at `/api/v1/theme-store`.
 *
 *   GET /themes                       → { themes, stale }
 *   GET /screenshot?repo=owner/repo   → the image, or 404
 */
export function createThemeStoreRoutes(deps: Pick<ThemeStoreRouteDependencies, 'themeStoreService' | 'logger'>): Hono {
  const { themeStoreService, logger } = deps
  const app = new Hono()

  app.get('/themes', async (c: Context): Promise<Response> => {
    try {
      return c.json(await themeStoreService.listCatalog(), 200)
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  app.get('/screenshot', async (c: Context): Promise<Response> => {
    const repo = c.req.query('repo') ?? ''
    if (!isValidRepo(repo)) return c.json(createApiError('VALIDATION_ERROR', 'repo must be "owner/repo"'), 400)
    try {
      const shot = await themeStoreService.getScreenshot(repo)
      if (shot === null) return c.json(createApiError('SCREENSHOT_NOT_FOUND', 'No screenshot available'), 404)
      return c.body(new Uint8Array(shot.data), 200, {
        // The type comes from the file's own bytes (PNG/JPEG/GIF/WebP only), never from the upstream header.
        'Content-Type': shot.contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=86400',
        'Content-Security-Policy': "default-src 'none'",
      })
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  return app
}

/**
 * Vault routes, mounted at `/api/v1/vaults/:vaultId/theme-store`.
 *
 *   GET  /updates   → ThemeUpdateCheckResult
 *   POST /install   → ThemeMeta   (body: { repo, replace?, activate? })
 */
export function createVaultThemeStoreRoutes(deps: ThemeStoreRouteDependencies): Hono {
  const { themeStoreService, accessControl, vaultRegistry, eventBus, logger } = deps
  const app = new Hono()

  function vaultPathOf(vaultId: string): string | null {
    return vaultRegistry.findById(vaultId)?.storagePath ?? null
  }

  /**
   * Tells other clients of the vault that theme files or the selection changed (best effort). The audience is
   * looked up once and shared by all events of one install.
   */
  async function publishChanges(c: Context, vaultId: string, paths: string[]): Promise<void> {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) return
    try {
      const userIds = await accessControl.getUsersWithAccess(vaultId)
      for (const path of paths) {
        eventBus.publish({
          type: 'vault:change',
          payload: { vaultId, action: 'saved', path, userId: session.userId, username: session.username },
          target: { kind: 'users', userIds },
          excludeUserId: session.userId,
        })
      }
    } catch (error) {
      logger.warn('Failed to publish theme store change event', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  app.get('/updates', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const vaultPath = vaultPathOf(vaultId)
    if (vaultPath === null) return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)
    try {
      return c.json(await themeStoreService.checkUpdates(vaultId, vaultPath), 200)
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  app.post('/install', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const vaultPath = vaultPathOf(vaultId)
    if (vaultPath === null) return c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404)

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    }
    const parsed = installSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(createApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Validation failed'), 400)
    }

    const { repo, replace, activate, themeId } = parsed.data
    try {
      const meta = await themeStoreService.install(vaultId, vaultPath, repo, {
        replace,
        activate,
        ...(themeId !== undefined ? { targetThemeId: themeId } : {}),
      })
      await publishChanges(c, vaultId, activate ? [`.obsidian/themes/${meta.id}/theme.css`, APPEARANCE_PATH] : [`.obsidian/themes/${meta.id}/theme.css`])
      logger.info('Theme installed from the community catalog', { vaultId, themeId: meta.id, repo, replace, activate })
      return c.json(meta, 200)
    } catch (error) {
      return handleStoreError(c, error, logger)
    }
  })

  return app
}

function handleStoreError(c: Context, error: unknown, logger: ILogger): Response {
  if (error instanceof ThemeNotFoundError) return c.json(createApiError('THEME_NOT_FOUND', error.message), 404)
  if (error instanceof ThemeNotInCatalogError) return c.json(createApiError('THEME_NOT_IN_CATALOG', error.message), 404)
  if (error instanceof ThemeAlreadyInstalledError) return c.json(createApiError('THEME_ALREADY_INSTALLED', error.message), 409)
  if (error instanceof AppearanceFileInvalidError) return c.json(createApiError('APPEARANCE_FILE_INVALID', error.message), 409)
  if (error instanceof ThemeFilesNotFoundError) return c.json(createApiError('THEME_FILES_NOT_FOUND', error.message), 422)
  if (error instanceof ThemeAssetTooLargeError || error instanceof ThemeTooLargeError) {
    return c.json(createApiError('THEME_TOO_LARGE', error.message), 422)
  }
  if (
    error instanceof ThemeManifestInvalidError ||
    error instanceof ThemeManifestMismatchError ||
    error instanceof ThemeIdUnderivableError ||
    error instanceof InvalidThemeIdError
  ) {
    return c.json(createApiError('THEME_INVALID', error.message), 422)
  }
  if (error instanceof ThemeStoreFetchError) {
    logger.warn('Theme store upstream request failed', { message: error.message })
    return c.json(createApiError('UPSTREAM_UNAVAILABLE', 'The theme catalog could not be reached. Try again later.'), 502)
  }
  logger.error('Unexpected error in theme store route', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
}
