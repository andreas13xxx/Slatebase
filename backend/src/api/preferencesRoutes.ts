/**
 * Preferences routes module — per-user recent files, favorites, and keybindings.
 * All routes require authentication.
 *
 * Routes:
 *   GET  /users/me/recent-files   — Get recent files
 *   PUT  /users/me/recent-files   — Save recent files
 *   GET  /users/me/favorites      — Get favorites
 *   PUT  /users/me/favorites      — Save favorites
 *   GET  /users/me/keybindings    — Get keybindings
 *   PUT  /users/me/keybindings    — Save keybindings
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { IPreferencesService } from '../preferences/index.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import {
  saveRecentFilesSchema,
  saveFavoritesSchema,
  saveKeybindingsSchema,
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
  const { preferencesService, logger } = deps
  const app = new Hono()

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
      return c.json({ entries: result.data.entries }, 200)
    } catch (error) {
      logger.error('Failed to save keybindings', { userId: session.userId, error: String(error) })
      return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
    }
  })

  return app
}
