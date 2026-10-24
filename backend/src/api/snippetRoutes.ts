// Snippet Routes — CSS snippets stored in the vault's `.obsidian/snippets/` folder (CRUD + activation)
//
// Access levels come from vault-authorization-middleware.ts, not from this file: reads need
// read access, every non-GET route falls through to the `write` default — snippets are vault
// files and apply to everyone who opens the vault.

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ISnippetStore, SnippetRegistryData } from '../snippets/types.js'
import { AppearanceFileInvalidError } from '../shared/appearance-file.js'
import { SnippetTooLargeError } from '../snippets/errors.js'
import {
  SNIPPET_ID_PATTERN,
  saveSnippetSchema,
  updateSnippetContentSchema,
  snippetRegistrySchema,
} from '../snippets/validation.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'

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
    .regex(SNIPPET_ID_PATTERN, 'Invalid snippet ID: must not start with a dot or contain / \\ % : * ? " < > | or control characters'),
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
 */
export function createSnippetRoutes(deps: SnippetRouteDependencies): Hono {
  const { snippetStore, vaultRegistry, logger } = deps
  const app = new Hono()

  function vaultPathOf(vaultId: string): string | null {
    return vaultRegistry.findById(vaultId)?.storagePath ?? null
  }

  /** Validates the vault id and resolves its storage path; returns the error response on failure. */
  function resolveVault(c: Context): { vaultPath: string } | { error: Response } {
    const vaultId = c.req.param('vaultId') as string
    const vaultIdError = validateVaultIdParam(c, vaultId)
    if (vaultIdError) return { error: vaultIdError }
    const vaultPath = vaultPathOf(vaultId)
    if (vaultPath === null) {
      return { error: c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404) }
    }
    return { vaultPath }
  }

  // ─── Registry Routes (BEFORE :snippetId to avoid "registry" being parsed as param) ───

  // PUT /registry — Save activation status for all snippets
  app.put('/registry', async (c: Context): Promise<Response> => {
    const vault = resolveVault(c)
    if ('error' in vault) return vault.error

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

    const enabledIds = Object.entries(parsed.data.snippets)
      .filter(([id, entry]) => entry.enabled && SNIPPET_ID_PATTERN.test(id))
      .map(([id]) => id)

    try {
      await snippetStore.saveEnabledIds(vault.vaultPath, enabledIds)
      return c.body(null, 204)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // GET /registry — Load activation status (enabled snippets only; absent means disabled)
  app.get('/registry', async (c: Context): Promise<Response> => {
    const vault = resolveVault(c)
    if ('error' in vault) return vault.error

    try {
      const [enabledIds, snippets] = await Promise.all([
        snippetStore.loadEnabledIds(vault.vaultPath),
        snippetStore.listSnippets(vault.vaultPath),
      ])
      const updatedAtById = new Map(snippets.map((meta) => [meta.id, meta.updatedAt]))
      const registry: SnippetRegistryData = { version: 1, snippets: {} }
      for (const id of enabledIds) {
        registry.snippets[id] = { enabled: true, updatedAt: updatedAtById.get(id) ?? '' }
      }
      return c.json(registry, 200)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // ─── Collection Routes ─────────────────────────────────────────────────────

  // GET / — List snippets
  app.get('/', async (c: Context): Promise<Response> => {
    const vault = resolveVault(c)
    if ('error' in vault) return vault.error

    try {
      const snippets = await snippetStore.listSnippets(vault.vaultPath)
      return c.json({ snippets }, 200)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // POST / — Create or upload a snippet (Requirement 8.2, 8.3, 8.4)
  app.post('/', async (c: Context): Promise<Response> => {
    const vault = resolveVault(c)
    if ('error' in vault) return vault.error

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
      const existing = await snippetStore.loadSnippet(vault.vaultPath, snippetId)
      if (existing !== null) {
        return c.json(createApiError('SNIPPET_ALREADY_EXISTS', `A snippet named "${filename}" already exists`), 409)
      }

      await snippetStore.saveSnippet(vault.vaultPath, snippetId, content)
      const [meta] = (await snippetStore.listSnippets(vault.vaultPath)).filter((m) => m.id === snippetId)
      return c.json(meta, 201)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // ─── Individual Snippet Routes ─────────────────────────────────────────────

  // GET /:snippetId — Load snippet content
  app.get('/:snippetId', async (c: Context): Promise<Response> => {
    const vault = resolveVault(c)
    if ('error' in vault) return vault.error
    const snippetId = c.req.param('snippetId') as string
    const snippetIdError = validateSnippetIdParam(c, snippetId)
    if (snippetIdError) return snippetIdError

    try {
      const content = await snippetStore.loadSnippet(vault.vaultPath, snippetId)
      if (content === null) {
        return c.json(createApiError('SNIPPET_NOT_FOUND', `Snippet "${snippetId}" not found`), 404)
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
    const vault = resolveVault(c)
    if ('error' in vault) return vault.error
    const snippetId = c.req.param('snippetId') as string
    const snippetIdError = validateSnippetIdParam(c, snippetId)
    if (snippetIdError) return snippetIdError

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
      await snippetStore.saveSnippet(vault.vaultPath, snippetId, parsed.data.content)
      return c.body(null, 204)
    } catch (error) {
      return handleSnippetError(c, error, logger)
    }
  })

  // DELETE /:snippetId — Delete a snippet (also removes it from the enabled list)
  app.delete('/:snippetId', async (c: Context): Promise<Response> => {
    const vault = resolveVault(c)
    if ('error' in vault) return vault.error
    const snippetId = c.req.param('snippetId') as string
    const snippetIdError = validateSnippetIdParam(c, snippetId)
    if (snippetIdError) return snippetIdError

    try {
      const existing = await snippetStore.loadSnippet(vault.vaultPath, snippetId)
      if (existing === null) {
        return c.json(createApiError('SNIPPET_NOT_FOUND', `Snippet "${snippetId}" not found`), 404)
      }

      await snippetStore.deleteSnippet(vault.vaultPath, snippetId)
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
  if (error instanceof AppearanceFileInvalidError) {
    return c.json(createApiError('APPEARANCE_FILE_INVALID', error.message), 409)
  }

  logger.error('Unexpected error in snippet route', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
}
