// Snippet Routes — Route module for CSS snippet management endpoints (CRUD)

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ISnippetStore, SnippetRegistryData } from '../snippets/types.js'
import { SnippetTooLargeError } from '../snippets/errors.js'
import { saveSnippetSchema, updateSnippetContentSchema, snippetRegistrySchema } from '../snippets/validation.js'
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

function createApiError(code: string, message: string): ApiError {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
  }
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

/** Vault IDs are deterministic SHA-256 hashes, max 24 hex chars. */
const vaultIdParamSchema = z.object({
  vaultId: z.string().min(1, 'vaultId must not be empty').max(24, 'vaultId too long'),
})

/** Snippet IDs are filenames without the `.css` extension. */
const snippetIdParamSchema = z.object({
  snippetId: z.string()
    .min(1, 'snippetId must not be empty')
    .max(120, 'snippetId must not exceed 120 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid snippet ID: must contain only letters, digits, underscores, and hyphens'),
})

function validateVaultIdParam(c: Context, vaultId: string): Response | null {
  const parsed = vaultIdParamSchema.safeParse({ vaultId })
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const message = firstIssue ? firstIssue.message : 'Invalid vaultId'
    return c.json(createApiError('VALIDATION_ERROR', message), 400)
  }
  return null
}

function validateSnippetIdParam(c: Context, snippetId: string): Response | null {
  const parsed = snippetIdParamSchema.safeParse({ snippetId })
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const message = firstIssue ? firstIssue.message : 'Invalid snippet ID'
    return c.json(createApiError('VALIDATION_ERROR', message), 400)
  }
  return null
}

/** Derives the snippet id (filename without `.css`) from a validated filename. */
function idFromFilename(filename: string): string {
  return filename.slice(0, -'.css'.length)
}

// ─── Dependencies ────────────────────────────────────────────────────────────

export interface SnippetRouteDependencies {
  snippetStore: ISnippetStore
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  logger: ILogger
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Creates Hono routes for CSS snippet management.
 * All routes are nested under /vaults/:vaultId/snippets.
 * Access control: same as vault files (owner + shared users with read access) —
 * mirrors pluginRoutes.ts's model of treating collaborators as trusted to
 * manage vault-scoped customization, not just content.
 */
export function createSnippetRoutes(deps: SnippetRouteDependencies): Hono {
  const { snippetStore, accessControl, vaultRegistry, logger } = deps
  const app = new Hono()

  // ─── Registry Routes (BEFORE :snippetId to avoid "registry" being parsed as param) ───

  // PUT /registry — Save activation status for all snippets
  app.put('/registry', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) return authResult.response

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    }

    const parsed = snippetRegistrySchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Validation failed'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      await snippetStore.saveRegistry(vaultId, parsed.data as SnippetRegistryData)
      return c.body(null, 204)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // GET /registry — Load activation status for all snippets
  app.get('/registry', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) return authResult.response

    try {
      const registry = await snippetStore.loadRegistry(vaultId)
      return c.json(registry ?? { version: 1, snippets: {} }, 200)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // ─── Collection Routes ─────────────────────────────────────────────────────

  // GET / — List snippets
  app.get('/', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) return authResult.response

    try {
      const snippets = await snippetStore.listSnippets(vaultId)
      return c.json({ snippets }, 200)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // POST / — Create or upload a snippet (Requirement 8.2, 8.3, 8.4)
  app.post('/', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) return authResult.response

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    }

    const parsed = saveSnippetSchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Validation failed'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    const { filename, content } = parsed.data
    const snippetId = idFromFilename(filename)

    try {
      const existing = await snippetStore.loadSnippet(vaultId, snippetId)
      if (existing !== null) {
        return c.json(createApiError('SNIPPET_ALREADY_EXISTS', `A snippet named "${filename}" already exists`), 409)
      }

      await snippetStore.saveSnippet(vaultId, snippetId, content)
      const [meta] = (await snippetStore.listSnippets(vaultId)).filter((m) => m.id === snippetId)
      return c.json(meta, 201)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // ─── Individual Snippet Routes ─────────────────────────────────────────────

  // GET /:snippetId — Load snippet content
  app.get('/:snippetId', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const snippetId = c.req.param('snippetId') as string
    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError
    const snippetIdError = validateSnippetIdParam(c, snippetId)
    if (snippetIdError) return snippetIdError

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) return authResult.response

    try {
      const content = await snippetStore.loadSnippet(vaultId, snippetId)
      if (content === null) {
        return c.json(createApiError('SNIPPET_NOT_FOUND', `Snippet "${snippetId}" not found in vault "${vaultId}"`), 404)
      }
      return new Response(content, {
        status: 200,
        headers: { 'Content-Type': 'text/css; charset=utf-8' },
      })
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // PUT /:snippetId — Save (overwrite) snippet content (Requirement 8.5)
  app.put('/:snippetId', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const snippetId = c.req.param('snippetId') as string
    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError
    const snippetIdError = validateSnippetIdParam(c, snippetId)
    if (snippetIdError) return snippetIdError

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) return authResult.response

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    }

    const parsed = updateSnippetContentSchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Validation failed'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    try {
      await snippetStore.saveSnippet(vaultId, snippetId, parsed.data.content)
      return c.body(null, 204)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // DELETE /:snippetId — Delete a snippet (also prunes its registry entry)
  app.delete('/:snippetId', async (c: Context): Promise<Response> => {
    const vaultId = c.req.param('vaultId') as string
    const snippetId = c.req.param('snippetId') as string
    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return vaultIdError
    const snippetIdError = validateSnippetIdParam(c, snippetId)
    if (snippetIdError) return snippetIdError

    const authResult = await checkVaultReadAccess(c, vaultId, vaultRegistry, accessControl)
    if (!authResult.authorized) return authResult.response

    try {
      const existing = await snippetStore.loadSnippet(vaultId, snippetId)
      if (existing === null) {
        return c.json(createApiError('SNIPPET_NOT_FOUND', `Snippet "${snippetId}" not found in vault "${vaultId}"`), 404)
      }

      await snippetStore.deleteSnippet(vaultId, snippetId)

      const registry = await snippetStore.loadRegistry(vaultId)
      if (registry !== null && snippetId in registry.snippets) {
        const { [snippetId]: _removed, ...rest } = registry.snippets
        await snippetStore.saveRegistry(vaultId, { version: 1, snippets: rest })
      }

      return c.body(null, 204)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  return app
}

// ─── Error Mapping ───────────────────────────────────────────────────────────

function handleSnippetError(c: Context, error: unknown, logger: ILogger): Response {
  if (error instanceof SnippetTooLargeError) {
    logger.warn('Snippet too large', { maxSize: error.maxSize, actualSize: error.actualSize })
    return c.json(createApiError('SNIPPET_TOO_LARGE', error.message), 413)
  }

  logger.error('Unexpected error in snippet route', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
}
