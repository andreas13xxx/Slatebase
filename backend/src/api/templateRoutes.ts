// Template Routes — Route module for template management endpoints

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IEventBus } from '../realtime/types.js'
import type { ITemplateService } from '../template/index.js'
import { TemplateNotFoundError, TemplateConflictError } from '../template/index.js'

// --- Helper: API Error Response ---

interface ApiError {
  code: string
  message: string
  timestamp: string
}

/**
 * Creates a structured API error response object.
 */
function createApiError(code: string, message: string): ApiError {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
  }
}

// --- Zod Validation Schema ---

/**
 * Schema for the create-from-template request body.
 */
const CreateFromTemplateSchema = z.object({
  templateName: z.string().min(1).max(255),
  targetDir: z.string().max(255),
  fileName: z.string().min(1).max(255),
})

// --- TemplateRouteDependencies ---

/**
 * Dependencies required by the template route factory.
 */
export interface TemplateRouteDependencies {
  templateService: ITemplateService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

// --- Template Route Factory ---

/**
 * Creates a Hono app with template routes registered.
 *
 * Routes:
 * - `GET /vaults/:vaultId/templates` — Lists available templates (read access)
 * - `POST /vaults/:vaultId/templates/create` — Creates a file from a template (write access)
 *
 * @returns A Hono instance with template routes registered.
 */
export function createTemplateRoutes(deps: TemplateRouteDependencies): Hono {
  const { templateService, accessControl, vaultRegistry, eventBus, logger } = deps
  const app = new Hono()

  /**
   * GET /vaults/:vaultId/templates
   *
   * Lists available templates for the specified vault.
   * Requires read access to the vault.
   *
   * Returns 200 with `{ templates: TemplateInfo[] }`
   */
  app.get('/vaults/:vaultId/templates', async (c: Context) => {
    const vaultId = c.req.param('vaultId') as string
    const session = c.get('session') as SessionContext | undefined

    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // 1. Check vault exists
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(error, 404)
    }

    // 2. Check read access
    try {
      await accessControl.checkReadAccess(vaultId, session.userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        const apiError = createApiError('FORBIDDEN', error.message)
        return c.json(apiError, 403)
      }
      if (error instanceof VaultNotFoundError) {
        const apiError = createApiError('VAULT_NOT_FOUND', error.message)
        return c.json(apiError, 404)
      }
      throw error
    }

    // 3. List templates
    try {
      const templates = await templateService.listTemplates(vaultId)
      return c.json({ templates }, 200)
    } catch (error) {
      logger.error('Failed to list templates', {
        vaultId,
        message: error instanceof Error ? error.message : String(error),
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Failed to list templates')
      return c.json(apiError, 500)
    }
  })

  /**
   * POST /vaults/:vaultId/templates/create
   *
   * Creates a new file from a specified template with placeholder substitution.
   * Requires write access to the vault.
   *
   * Request body (JSON):
   * - `templateName` — Name of the template to use (1–255 chars)
   * - `targetDir` — Target directory for the new file (0–255 chars)
   * - `fileName` — Name for the new file (1–255 chars)
   *
   * Returns 201 with `{ path, content }`
   */
  app.post('/vaults/:vaultId/templates/create', async (c: Context) => {
    const vaultId = c.req.param('vaultId') as string
    const session = c.get('session') as SessionContext | undefined

    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // 1. Check vault exists
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(error, 404)
    }

    // 2. Check write access
    try {
      await accessControl.checkWriteAccess(vaultId, session.userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        const apiError = createApiError('FORBIDDEN', error.message)
        return c.json(apiError, 403)
      }
      if (error instanceof VaultNotFoundError) {
        const apiError = createApiError('VAULT_NOT_FOUND', error.message)
        return c.json(apiError, 404)
      }
      throw error
    }

    // 3. Validate request body
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      const apiError = createApiError('VALIDATION_ERROR', 'Invalid JSON body')
      return c.json(apiError, 400)
    }

    const parsed = CreateFromTemplateSchema.safeParse(body)
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      const message = firstError ? firstError.message : 'Invalid request body'
      const apiError = createApiError('VALIDATION_ERROR', message)
      return c.json(apiError, 400)
    }

    const { templateName, targetDir, fileName } = parsed.data

    // 4. Create file from template
    try {
      const result = await templateService.createFromTemplate(vaultId, templateName, targetDir, fileName)

      // 5. Publish vault:change event
      eventBus.publish({
        type: 'vault:change',
        payload: {
          vaultId,
          action: 'saved',
          path: result.path,
          userId: session.userId,
          username: session.username,
        },
        target: { kind: 'broadcast' },
        excludeUserId: session.userId,
      })

      logger.info('File created from template', { vaultId, templateName, path: result.path })

      return c.json({ path: result.path, content: result.content }, 201)
    } catch (error) {
      if (error instanceof TemplateNotFoundError) {
        const apiError = createApiError(error.code, error.message)
        return c.json(apiError, 404)
      }
      if (error instanceof TemplateConflictError) {
        const apiError = createApiError(error.code, error.message)
        return c.json(apiError, 409)
      }

      logger.error('Failed to create file from template', {
        vaultId,
        templateName,
        message: error instanceof Error ? error.message : String(error),
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Failed to create file from template')
      return c.json(apiError, 500)
    }
  })

  return app
}
