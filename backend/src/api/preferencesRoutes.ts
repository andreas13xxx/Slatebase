/**
 * Preferences routes module — everything stored per user: recent files,
 * favorites, keybindings, account-wide UI settings, and per-vault settings.
 * All routes require authentication.
 *
 * Routes:
 *   GET   /users/me/recent-files              — Get recent files
 *   PUT   /users/me/recent-files              — Save recent files
 *   GET   /users/me/favorites                 — Get favorites
 *   PUT   /users/me/favorites                 — Save favorites
 *   GET   /users/me/keybindings               — Get keybindings
 *   PUT   /users/me/keybindings               — Save keybindings
 *   GET   /users/me/ui-settings               — Get account-wide UI settings
 *   PATCH /users/me/ui-settings               — Merge a partial UI settings update
 *   GET   /users/me/vault-settings/:vaultId   — Get this user's settings for a vault
 *   PATCH /users/me/vault-settings/:vaultId   — Merge a partial per-vault update
 *
 * Every write publishes a `preferences:change` SSE event to this user's own
 * connections, so a second device picks the change up instead of holding a
 * stale copy until its next reload. The writing client names itself in the
 * `X-Client-Id` header and is echoed back as `originId`, so it can skip its
 * own event rather than re-fetching what it just sent.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { IPreferencesService } from '../preferences/index.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IEventBus } from '../realtime/index.js'
import {
  saveRecentFilesSchema,
  saveFavoritesSchema,
  saveKeybindingsSchema,
  saveUiSettingsSchema,
  saveVaultSettingsSchema,
} from '../preferences/validation.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiError {
  code: string
  message: string
  timestamp: string
}

interface PreferencesRoutesDeps {
  preferencesService: IPreferencesService
  logger: ILogger
  /** Optional so tests can exercise the HTTP contract without a realtime stack. */
  eventBus?: IEventBus
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createApiError(code: string, message: string): ApiError {
  return { code, message, timestamp: new Date().toISOString() }
}

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with all preferences routes.
 * Mounted under /users/me in the authenticated router.
 */
export function createPreferencesRoutes(deps: PreferencesRoutesDeps): Hono {
  const { preferencesService, logger, eventBus } = deps
  const app = new Hono()

  /**
   * Tells this user's other devices that a preference scope changed. Targeted
   * at the one user — no other account has any use for the event.
   */
  function publishChange(
    userId: string,
    scope: string,
    originId: string | undefined,
    extra: Record<string, unknown> = {},
  ): void {
    eventBus?.publish({
      type: 'preferences:change',
      payload: { scope, originId: originId ?? null, ...extra },
      target: { kind: 'user', userId },
    })
  }

  /** The client instance that made the write, so it can skip its own echo. */
  function originOf(c: Context): string | undefined {
    const header = c.req.header('X-Client-Id')
    return header !== undefined && header.length > 0 && header.length <= 128 ? header : undefined
  }

  // ── Recent Files ──────────────────────────────────────────────────────────

  app.get('/users/me/recent-files', async (c: Context) => {
    const session = c.get('session') as SessionContext
    try {
      const entries = await preferencesService.getRecentFiles(session.userId)
      return c.json({ entries }, 200)
    } catch (error) {
      logger.error('Failed to get recent files', { userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  app.put('/users/me/recent-files', async (c: Context) => {
    const session = c.get('session') as SessionContext

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = saveRecentFilesSchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      await preferencesService.saveRecentFiles(session.userId, result.data.entries)
      publishChange(session.userId, 'recentFiles', originOf(c))
      return c.json({ entries: result.data.entries }, 200)
    } catch (error) {
      logger.error('Failed to save recent files', { userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  // ── Favorites ─────────────────────────────────────────────────────────────

  app.get('/users/me/favorites', async (c: Context) => {
    const session = c.get('session') as SessionContext
    try {
      const entries = await preferencesService.getFavorites(session.userId)
      return c.json({ entries }, 200)
    } catch (error) {
      logger.error('Failed to get favorites', { userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  app.put('/users/me/favorites', async (c: Context) => {
    const session = c.get('session') as SessionContext

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = saveFavoritesSchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      await preferencesService.saveFavorites(session.userId, result.data.entries)
      publishChange(session.userId, 'favorites', originOf(c))
      return c.json({ entries: result.data.entries }, 200)
    } catch (error) {
      logger.error('Failed to save favorites', { userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  // ── Keybindings ───────────────────────────────────────────────────────────

  app.get('/users/me/keybindings', async (c: Context) => {
    const session = c.get('session') as SessionContext
    try {
      const entries = await preferencesService.getKeybindings(session.userId)
      return c.json({ entries }, 200)
    } catch (error) {
      logger.error('Failed to get keybindings', { userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  app.put('/users/me/keybindings', async (c: Context) => {
    const session = c.get('session') as SessionContext

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = saveKeybindingsSchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      await preferencesService.saveKeybindings(session.userId, result.data.entries)
      publishChange(session.userId, 'keybindings', originOf(c))
      return c.json({ entries: result.data.entries }, 200)
    } catch (error) {
      logger.error('Failed to save keybindings', { userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  // ── UI Settings (account-wide) ────────────────────────────────────────────

  app.get('/users/me/ui-settings', async (c: Context) => {
    const session = c.get('session') as SessionContext
    try {
      const settings = await preferencesService.getUiSettings(session.userId)
      return c.json({ settings }, 200)
    } catch (error) {
      logger.error('Failed to get UI settings', { userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  app.patch('/users/me/ui-settings', async (c: Context) => {
    const session = c.get('session') as SessionContext

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = saveUiSettingsSchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const settings = await preferencesService.saveUiSettings(session.userId, result.data)
      publishChange(session.userId, 'uiSettings', originOf(c))
      return c.json({ settings }, 200)
    } catch (error) {
      logger.error('Failed to save UI settings', { userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  // ── Per-Vault Settings (scoped to this user *and* this vault) ─────────────

  app.get('/users/me/vault-settings/:vaultId', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string
    try {
      const settings = await preferencesService.getVaultSettings(session.userId, vaultId)
      return c.json({ settings }, 200)
    } catch (error) {
      logger.error('Failed to get vault settings', { userId: session.userId, vaultId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  app.patch('/users/me/vault-settings/:vaultId', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = saveVaultSettingsSchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      const settings = await preferencesService.saveVaultSettings(session.userId, vaultId, result.data)
      publishChange(session.userId, 'vaultSettings', originOf(c), { vaultId })
      return c.json({ settings }, 200)
    } catch (error) {
      logger.error('Failed to save vault settings', { userId: session.userId, vaultId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  return app
}
