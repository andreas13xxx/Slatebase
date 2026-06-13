// Search Routes — Route module for full-text search and replace endpoints

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { ISearchService, IReplaceService } from '../search/index.js'
import {
  searchQuerySchema,
  multiVaultSearchSchema,
  replaceBodySchema,
} from '../search/index.js'
import {
  SearchQueryValidationError,
  RegexValidationError,
  RegexTooLongError,
  ReplaceValidationError,
} from '../search/index.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a structured API error response object.
 */
function createApiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Maps domain errors to HTTP status codes and structured API error responses.
 */
function handleSearchError(c: Context, error: unknown, logger: ILogger): Response {
  if (error instanceof SearchQueryValidationError) {
    return c.json(createApiError('INVALID_QUERY', error.message), 400)
  }

  if (error instanceof RegexValidationError) {
    return c.json(createApiError('INVALID_REGEX', error.message), 400)
  }

  if (error instanceof RegexTooLongError) {
    return c.json(createApiError('REGEX_TOO_LONG', error.message), 400)
  }

  if (error instanceof ReplaceValidationError) {
    return c.json(createApiError('INVALID_REPLACE', error.message), 400)
  }

  if (error instanceof VaultNotFoundError) {
    return c.json(createApiError('VAULT_NOT_FOUND', error.message), 404)
  }

  if (error instanceof VaultAccessDeniedError) {
    return c.json(createApiError('ACCESS_DENIED', error.message), 403)
  }

  // Unknown error — log and return generic 500
  const message = error instanceof Error ? error.message : String(error)
  logger.error('Unexpected error in search route', { error: message })
  return c.json(createApiError('INTERNAL_ERROR', 'An unexpected error occurred'), 500)
}

// ─── Dependencies ────────────────────────────────────────────────────────────

export interface SearchRouteDependencies {
  searchService: ISearchService
  replaceService: IReplaceService
  vaultAccessControl: IVaultAccessControl
  logger: ILogger
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Creates Hono routes for vault search and replace operations.
 * Auth middleware is expected to be applied by the composition root before these routes.
 *
 * Routes:
 * - GET  /vaults/:vaultId/search  — Single-vault search
 * - GET  /search                  — Multi-vault search
 * - POST /vaults/:vaultId/replace — Replace in vault
 *
 * @param deps - Dependencies for the route module.
 * @returns A Hono instance with search routes registered.
 */
export function createSearchRoutes(deps: SearchRouteDependencies): Hono {
  const { searchService, replaceService, vaultAccessControl, logger } = deps
  const app = new Hono()

  // ─── GET /vaults/:vaultId/search — Single-vault search ───────────────────

  app.get('/vaults/:vaultId/search', async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      return c.json(createApiError('UNAUTHORIZED', 'Not authenticated'), 401)
    }

    const vaultId = c.req.param('vaultId') as string
    const userId = session.userId

    // Parse and validate query parameters
    const rawQuery = {
      query: c.req.query('query'),
      caseSensitive: c.req.query('caseSensitive'),
      regex: c.req.query('regex'),
      contextLines: c.req.query('contextLines'),
      maxResults: c.req.query('maxResults'),
    }

    const parsed = searchQuerySchema.safeParse(rawQuery)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Validation failed'
      return c.json(createApiError('INVALID_QUERY', message), 400)
    }

    try {
      // Check read access
      await vaultAccessControl.checkReadAccess(vaultId, userId)

      // Execute search
      const response = await searchService.search(vaultId, parsed.data)
      return c.json(response, 200)
    } catch (error) {
      return handleSearchError(c, error, logger)
    }
  })

  // ─── GET /search — Multi-vault search ────────────────────────────────────

  app.get('/search', async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      return c.json(createApiError('UNAUTHORIZED', 'Not authenticated'), 401)
    }

    const userId = session.userId

    // Parse and validate query parameters
    const rawQuery = {
      query: c.req.query('query'),
      caseSensitive: c.req.query('caseSensitive'),
      regex: c.req.query('regex'),
      contextLines: c.req.query('contextLines'),
      maxResults: c.req.query('maxResults'),
      vaultIds: c.req.query('vaultIds'),
    }

    const parsed = multiVaultSearchSchema.safeParse(rawQuery)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Validation failed'
      return c.json(createApiError('INVALID_QUERY', message), 400)
    }

    // Parse vaultIds from comma-separated string
    const vaultIdsParam = parsed.data.vaultIds
    const vaultIds: string[] = vaultIdsParam
      ? vaultIdsParam.split(',').map((id) => id.trim()).filter((id) => id.length > 0)
      : []

    try {
      // Access control is handled per-vault inside searchMultiVault
      const { vaultIds: _unused, ...searchOptions } = parsed.data
      const response = await searchService.searchMultiVault(userId, vaultIds, searchOptions)
      return c.json(response, 200)
    } catch (error) {
      return handleSearchError(c, error, logger)
    }
  })

  // ─── POST /vaults/:vaultId/replace — Replace in vault ────────────────────

  app.post('/vaults/:vaultId/replace', async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      return c.json(createApiError('UNAUTHORIZED', 'Not authenticated'), 401)
    }

    const vaultId = c.req.param('vaultId') as string
    const userId = session.userId

    // Parse and validate JSON body
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('INVALID_REPLACE', 'Invalid JSON body'), 400)
    }

    const parsed = replaceBodySchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Validation failed'
      return c.json(createApiError('INVALID_REPLACE', message), 400)
    }

    try {
      // Check write access
      await vaultAccessControl.checkWriteAccess(vaultId, userId)

      // Build replace options, omitting paths if undefined (exactOptionalPropertyTypes)
      const replaceOptions = {
        query: parsed.data.query,
        replacement: parsed.data.replacement,
        caseSensitive: parsed.data.caseSensitive,
        regex: parsed.data.regex,
        ...(parsed.data.paths !== undefined ? { paths: parsed.data.paths } : {}),
      }

      // Execute replace
      const response = await replaceService.replace(vaultId, replaceOptions)
      return c.json(response, 200)
    } catch (error) {
      return handleSearchError(c, error, logger)
    }
  })

  return app
}
