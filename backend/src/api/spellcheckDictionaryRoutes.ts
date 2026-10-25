/**
 * Spellcheck dictionary routes module — a vault's personal word list, shared by everyone
 * who works in the vault and carried along by Git Sync.
 * All routes require authentication and vault access (read for GET, write otherwise —
 * resolved by the vault authorization middleware).
 *
 * Routes:
 *   GET    /vaults/:vaultId/spellcheck/words        — Get the word list
 *   POST   /vaults/:vaultId/spellcheck/words        — Add one or more words
 *   DELETE /vaults/:vaultId/spellcheck/words/:word  — Remove a word
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ISpellcheckDictionaryService } from '../spellcheck-dictionary/index.js'
import {
  SpellcheckDictionaryFullError,
  SpellcheckDictionaryUnreadableError,
  addSpellcheckWordsSchema,
} from '../spellcheck-dictionary/index.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiError {
  code: string
  message: string
  timestamp: string
}

interface SpellcheckDictionaryRoutesDeps {
  spellcheckDictionaryService: ISpellcheckDictionaryService
  logger: ILogger
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createApiError(code: string, message: string): ApiError {
  return { code, message, timestamp: new Date().toISOString() }
}

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with the spellcheck dictionary routes.
 * Mounted under /vaults/:vaultId/spellcheck in the authenticated router.
 */
export function createSpellcheckDictionaryRoutes(deps: SpellcheckDictionaryRoutesDeps): Hono {
  const { spellcheckDictionaryService, logger } = deps
  const app = new Hono()

  function handleError(c: Context, error: unknown, action: string, vaultId: string, userId: string): Response {
    if (error instanceof SpellcheckDictionaryFullError) {
      return c.json(createApiError('VALIDATION_ERROR', error.message), 400)
    }
    if (error instanceof SpellcheckDictionaryUnreadableError) {
      return c.json(createApiError('CONFLICT', error.message), 409)
    }
    logger.error(`Failed to ${action} spellcheck words`, { vaultId, userId, error: String(error) })
    return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
  }

  app.get('/vaults/:vaultId/spellcheck/words', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string

    try {
      return c.json(await spellcheckDictionaryService.getWords(vaultId), 200)
    } catch (error) {
      return handleError(c, error, 'read', vaultId, session.userId)
    }
  })

  app.post('/vaults/:vaultId/spellcheck/words', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = addSpellcheckWordsSchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      return c.json(await spellcheckDictionaryService.addWords(vaultId, result.data.words), 200)
    } catch (error) {
      return handleError(c, error, 'add', vaultId, session.userId)
    }
  })

  app.delete('/vaults/:vaultId/spellcheck/words/:word', async (c: Context) => {
    const session = c.get('session') as SessionContext
    const vaultId = c.req.param('vaultId') as string
    const word = c.req.param('word') as string

    try {
      return c.json(await spellcheckDictionaryService.removeWord(vaultId, word), 200)
    } catch (error) {
      return handleError(c, error, 'remove', vaultId, session.userId)
    }
  })

  return app
}
