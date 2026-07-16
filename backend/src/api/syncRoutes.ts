// Sync Routes — Route module for vault synchronization endpoints

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { CreateSyncConfigInput, ISyncService, UpdateSyncConfigInput } from '../sync/types.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { RouteModule } from './index.js'
import {
  SyncAlreadyConfiguredError,
  SyncNotConfiguredError,
  SyncInProgressError,
  ConnectionTestFailedError,
  InvalidSetupUriError,
  InvalidSyncIntervalError,
  InvalidPassphraseError,
  ConflictResolutionError,
  ConflictNotFoundError,
  BatchLimitExceededError,
  FileContentUnavailableError,
  SchedulerAlreadyPausedError,
  AutoResolutionConfigError,
} from '../sync/errors.js'
import {
  createSyncConfigSchema,
  updateSyncConfigSchema,
  syncLogQuerySchema,
  resolveBatchSchema,
  resolveMergeSchema,
  autoResolutionConfigSchema,
  fileContentQuerySchema,
} from '../sync/validation.js'

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

// --- Helper: Owner Authorization Check ---

/**
 * Verifies that the authenticated user is the owner of the specified vault.
 * Check order: Authentication (401) → Vault existence (404) → Owner permission (403).
 * Admin role does NOT bypass owner check (Requirement 9.7).
 */
function checkOwnership(
  c: Context,
  vaultId: string,
  vaultRegistry: IVaultRegistry,
): { authorized: true; session: SessionContext } | { authorized: false; response: Response } {
  const session = c.get('session') as SessionContext | undefined
  if (session === undefined) {
    const error = createApiError('UNAUTHORIZED', 'Missing session context')
    return { authorized: false, response: c.json(error, 401) }
  }

  const entry = vaultRegistry.findById(vaultId)
  if (entry === null) {
    const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
    return { authorized: false, response: c.json(error, 404) }
  }

  // Admin role does NOT bypass owner check (Requirement 9.7)
  if (entry.ownerId !== session.userId) {
    const error = createApiError('ACCESS_DENIED', 'Only the vault owner can manage sync')
    return { authorized: false, response: c.json(error, 403) }
  }

  return { authorized: true, session }
}

// --- Helper: Domain Error Mapping ---

/**
 * Maps sync domain errors to HTTP status codes and structured ApiError responses.
 */
function handleSyncError(c: Context, error: unknown, logger: ILogger): Response {
  if (error instanceof SyncAlreadyConfiguredError) {
    logger.warn('Sync already configured', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 409)
  }

  if (error instanceof SyncNotConfiguredError) {
    logger.debug('Sync not configured', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 409)
  }

  if (error instanceof SyncInProgressError) {
    logger.warn('Sync in progress', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 409)
  }

  if (error instanceof ConnectionTestFailedError) {
    logger.warn('Connection test failed', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 422)
  }

  if (error instanceof InvalidSetupUriError) {
    logger.warn('Invalid setup URI', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 400)
  }

  if (error instanceof InvalidSyncIntervalError) {
    logger.warn('Invalid sync interval', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 400)
  }

  if (error instanceof InvalidPassphraseError) {
    logger.warn('Invalid passphrase', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 400)
  }

  if (error instanceof ConflictResolutionError) {
    logger.error('Conflict resolution error', { code: error.code, message: error.message })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 500)
  }

  if (error instanceof ConflictNotFoundError) {
    logger.debug('Conflict not found', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 404)
  }

  if (error instanceof BatchLimitExceededError) {
    logger.warn('Batch limit exceeded', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 400)
  }

  if (error instanceof FileContentUnavailableError) {
    logger.debug('File content unavailable', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 404)
  }

  if (error instanceof SchedulerAlreadyPausedError) {
    logger.warn('Scheduler already paused', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 409)
  }

  if (error instanceof AutoResolutionConfigError) {
    logger.warn('Auto-resolution config error', { code: error.code })
    const apiError = createApiError(error.code, error.message)
    return c.json(apiError, 400)
  }

  // Zod validation errors (should not reach here normally, but as safety net)
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0]
    const message = firstIssue ? firstIssue.message : 'Validation failed'
    logger.warn('Zod validation error in sync route', { message })
    const apiError = createApiError('VALIDATION_ERROR', message)
    return c.json(apiError, 400)
  }

  // Unknown / internal errors
  logger.error('Unexpected error in sync route', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  const apiError = createApiError('INTERNAL_ERROR', 'Internal server error')
  return c.json(apiError, 500)
}

// --- SyncRouteModule ---

/**
 * Dependencies required by the sync route module.
 */
export interface SyncRouteDependencies {
  syncService: ISyncService
  vaultRegistry: IVaultRegistry
  logger: ILogger
}

/**
 * Route module for vault synchronization operations.
 * Registers routes under /vaults/:vaultId/sync/.
 * All routes require the caller to be the vault owner.
 */
export class SyncRouteModule implements RouteModule {
  private readonly syncService: ISyncService
  private readonly vaultRegistry: IVaultRegistry
  private readonly logger: ILogger

  constructor(deps: SyncRouteDependencies) {
    this.syncService = deps.syncService
    this.vaultRegistry = deps.vaultRegistry
    this.logger = deps.logger
  }

  /**
   * Registers sync routes on the provided Hono router.
   */
  register(router: Hono): void {
    // Config CRUD
    router.post('/vaults/:vaultId/sync/config', (c) => this.createConfig(c))
    router.get('/vaults/:vaultId/sync/config', (c) => this.getConfig(c))
    router.put('/vaults/:vaultId/sync/config', (c) => this.updateConfig(c))
    router.delete('/vaults/:vaultId/sync/config', (c) => this.removeConfig(c))

    // Config state management
    router.put('/vaults/:vaultId/sync/config/disable', (c) => this.disableConfig(c))
    router.put('/vaults/:vaultId/sync/config/enable', (c) => this.enableConfig(c))

    // Sync operations
    router.post('/vaults/:vaultId/sync/trigger', (c) => this.triggerSync(c))
    router.post('/vaults/:vaultId/sync/analyze', (c) => this.analyze(c))
    router.post('/vaults/:vaultId/sync/reset-checkpoint', (c) => this.resetCheckpoint(c))

    // Sync log
    router.get('/vaults/:vaultId/sync/log', (c) => this.getLog(c))

    // Sync protocol (event log)
    router.get('/vaults/:vaultId/sync/protocol', (c) => this.getProtocol(c))

    // Conflicts
    router.get('/vaults/:vaultId/sync/conflicts', (c) => this.getConflicts(c))

    // Conflict resolution (wizard endpoints) — must be registered BEFORE wildcard :path route
    router.get('/vaults/:vaultId/sync/conflicts/categorized', (c) => this.getCategorizedConflicts(c))
    router.post('/vaults/:vaultId/sync/conflicts/resolve-batch', (c) => this.resolveConflictBatch(c))
    router.post('/vaults/:vaultId/sync/conflicts/resolve-merge', (c) => this.resolveConflictWithContent(c))
    router.get('/vaults/:vaultId/sync/conflicts/file-content', (c) => this.getFileContent(c))
    router.post('/vaults/:vaultId/sync/conflicts/:path{.+}/resolve', (c) => this.resolveConflict(c))

    // Auto-resolution configuration
    router.get('/vaults/:vaultId/sync/auto-resolution', (c) => this.getAutoResolutionConfig(c))
    router.put('/vaults/:vaultId/sync/auto-resolution', (c) => this.setAutoResolutionConfig(c))

    // Scheduler control
    router.post('/vaults/:vaultId/sync/scheduler/pause', (c) => this.pauseScheduler(c))
    router.post('/vaults/:vaultId/sync/scheduler/resume', (c) => this.resumeScheduler(c))
  }

  // ─── Config CRUD ─────────────────────────────────────────────────────────

  /**
   * POST /vaults/:vaultId/sync/config
   * Creates a new sync configuration for the vault.
   * Returns 201 with the config and connection test result.
   */
  private async createConfig(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const body: unknown = await c.req.json()
      const parsed = createSyncConfigSchema.safeParse(body)

      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        const message = firstIssue ? firstIssue.message : 'Validation failed'
        const apiError = createApiError('VALIDATION_ERROR', message)
        return c.json(apiError, 400)
      }

      const result = await this.syncService.createConfig(vaultId, ownerCheck.session.userId, parsed.data as CreateSyncConfigInput)
      return c.json(result, 201)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * GET /vaults/:vaultId/sync/config
   * Returns the sync configuration for the vault (password masked).
   * Returns 200 with config or 409 if not configured.
   */
  private async getConfig(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const config = await this.syncService.getConfig(vaultId)
      if (config === null) {
        throw new SyncNotConfiguredError()
      }
      return c.json(config, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * PUT /vaults/:vaultId/sync/config
   * Updates an existing sync configuration.
   * Returns 200 with the updated config and connection test result.
   */
  private async updateConfig(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const body: unknown = await c.req.json()
      const parsed = updateSyncConfigSchema.safeParse(body)

      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        const message = firstIssue ? firstIssue.message : 'Validation failed'
        const apiError = createApiError('VALIDATION_ERROR', message)
        return c.json(apiError, 400)
      }

      const result = await this.syncService.updateConfig(vaultId, parsed.data as UpdateSyncConfigInput)
      return c.json(result, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * DELETE /vaults/:vaultId/sync/config
   * Removes the sync configuration completely.
   * Returns 204 on success.
   */
  private async removeConfig(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      await this.syncService.removeConfig(vaultId)
      return c.body(null, 204)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  // ─── Config State Management ─────────────────────────────────────────────

  /**
   * PUT /vaults/:vaultId/sync/config/disable
   * Disables the sync configuration.
   * Returns 200 on success.
   */
  private async disableConfig(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      await this.syncService.disableConfig(vaultId)
      return c.json({ status: 'disabled' }, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * PUT /vaults/:vaultId/sync/config/enable
   * Re-enables a disabled sync configuration.
   * Returns 200 on success.
   */
  private async enableConfig(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      await this.syncService.enableConfig(vaultId)
      return c.json({ status: 'active' }, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  // ─── Sync Operations ─────────────────────────────────────────────────────

  /**
   * POST /vaults/:vaultId/sync/trigger
   * Triggers a manual synchronization.
   * Returns 200 with the sync result.
   */
  private async triggerSync(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const result = await this.syncService.triggerSync(vaultId)
      return c.json(result, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * POST /vaults/:vaultId/sync/analyze
   * Starts analysis mode (read-only comparison).
   * Returns 200 with the analysis result.
   */
  private async analyze(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const result = await this.syncService.analyze(vaultId)
      return c.json(result, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * POST /vaults/:vaultId/sync/reset-checkpoint
   * Resets the sync checkpoint so the next sync performs a full pull (since=0).
   * This re-processes all documents including tombstones for deleted/moved files,
   * cleaning up stale files that were incorrectly preserved by previous sync bugs.
   * Returns 200 on success.
   */
  private async resetCheckpoint(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      await this.syncService.resetCheckpoint(vaultId)
      return c.json({ status: 'checkpoint_reset', message: 'Next sync will perform a full pull' }, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  // ─── Sync Log ────────────────────────────────────────────────────────────

  /**
   * GET /vaults/:vaultId/sync/log
   * Returns the sync log paginated.
   * Query params: page (default 1), pageSize (default 50, max 100).
   */
  private async getLog(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const rawPage = c.req.query('page')
      const rawPageSize = c.req.query('pageSize')

      const parsed = syncLogQuerySchema.safeParse({
        page: rawPage ?? undefined,
        pageSize: rawPageSize ?? undefined,
      })

      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        const message = firstIssue ? firstIssue.message : 'Validation failed'
        const apiError = createApiError('VALIDATION_ERROR', message)
        return c.json(apiError, 400)
      }

      const { page, pageSize } = parsed.data
      const result = await this.syncService.getLog(vaultId, page, pageSize)
      return c.json(result, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * GET /vaults/:vaultId/sync/protocol
   * Returns the sync protocol (event log) paginated with optional filters.
   * Query params: page (default 1), pageSize (default 100, max 200),
   *   level (info|warn|error), search (text filter), runId (filter by run).
   */
  private async getProtocol(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const rawPage = c.req.query('page')
      const rawPageSize = c.req.query('pageSize')
      const level = c.req.query('level') as 'info' | 'warn' | 'error' | undefined
      const search = c.req.query('search')
      const runId = c.req.query('runId')

      const page = rawPage ? Math.max(1, parseInt(rawPage, 10) || 1) : 1
      const pageSize = rawPageSize ? Math.min(200, Math.max(1, parseInt(rawPageSize, 10) || 100)) : 100

      const filter = {
        ...(level && ['info', 'warn', 'error'].includes(level) ? { level } : {}),
        ...(search ? { search } : {}),
        ...(runId ? { runId } : {}),
      }

      const result = await this.syncService.getProtocol(vaultId, page, pageSize, Object.keys(filter).length > 0 ? filter : undefined)
      return c.json(result, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  // ─── Conflicts ───────────────────────────────────────────────────────────

  /**
   * GET /vaults/:vaultId/sync/conflicts
   * Returns all open conflicts for the vault.
   */
  private async getConflicts(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const conflicts = await this.syncService.getConflicts(vaultId)
      return c.json(conflicts, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * POST /vaults/:vaultId/sync/conflicts/:path/resolve
   * Resolves a conflict for a specific document path.
   * The :path parameter is URL-decoded and may contain slashes.
   * Body: { resolution: 'use_remote' | 'use_local' | 'skip' }
   */
  private async resolveConflict(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string
    const rawPath = c.req.param('path') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      // URL-decode the path parameter (it's a file path like notes/test.md)
      const documentPath = decodeURIComponent(rawPath)

      if (documentPath.length === 0) {
        const apiError = createApiError('VALIDATION_ERROR', 'Document path must not be empty')
        return c.json(apiError, 400)
      }

      const body: unknown = await c.req.json()

      // Validate resolution body
      const resolutionSchema = z.object({
        resolution: z.enum(['use_remote', 'use_local', 'skip']),
      })

      const parsed = resolutionSchema.safeParse(body)
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        const message = firstIssue ? firstIssue.message : 'Invalid resolution value'
        const apiError = createApiError('VALIDATION_ERROR', message)
        return c.json(apiError, 400)
      }

      await this.syncService.resolveConflict(vaultId, documentPath, parsed.data.resolution)
      return c.json({ documentPath, resolution: parsed.data.resolution }, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  // ─── Conflict Resolution (Wizard Endpoints) ──────────────────────────────

  /**
   * GET /vaults/:vaultId/sync/conflicts/categorized
   * Returns all open conflicts with category classification.
   */
  private async getCategorizedConflicts(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const conflicts = await this.syncService.getCategorizedConflicts(vaultId)
      return c.json(conflicts, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * POST /vaults/:vaultId/sync/conflicts/resolve-batch
   * Resolves multiple conflicts in a single batch operation.
   * Body: Array of { documentPath, resolution } (max 100 items).
   */
  private async resolveConflictBatch(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const body: unknown = await c.req.json()
      const parsed = resolveBatchSchema.safeParse(body)

      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        const message = firstIssue ? firstIssue.message : 'Validation failed'
        const apiError = createApiError('VALIDATION_ERROR', message)
        return c.json(apiError, 400)
      }

      const result = await this.syncService.resolveConflictBatch(vaultId, parsed.data)
      return c.json(result, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * POST /vaults/:vaultId/sync/conflicts/resolve-merge
   * Resolves a conflict with manually provided merged content.
   * Body: { documentPath, content }.
   */
  private async resolveConflictWithContent(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const body: unknown = await c.req.json()
      const parsed = resolveMergeSchema.safeParse(body)

      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        const message = firstIssue ? firstIssue.message : 'Validation failed'
        const apiError = createApiError('VALIDATION_ERROR', message)
        return c.json(apiError, 400)
      }

      await this.syncService.resolveConflictWithContent(vaultId, parsed.data.documentPath, parsed.data.content)
      return c.json({ documentPath: parsed.data.documentPath, resolution: 'manual_merge' }, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * GET /vaults/:vaultId/sync/conflicts/file-content
   * Returns the content of a file for the diff view.
   * Query: path (document path), source (local|remote).
   */
  private async getFileContent(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const rawPath = c.req.query('path')
      const rawSource = c.req.query('source')

      const parsed = fileContentQuerySchema.safeParse({
        path: rawPath ?? '',
        source: rawSource ?? '',
      })

      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        const message = firstIssue ? firstIssue.message : 'Validation failed'
        const apiError = createApiError('VALIDATION_ERROR', message)
        return c.json(apiError, 400)
      }

      const content = await this.syncService.getFileContent(vaultId, parsed.data.path, parsed.data.source)
      return c.json({ path: parsed.data.path, source: parsed.data.source, content }, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  // ─── Auto-Resolution Configuration ───────────────────────────────────────

  /**
   * GET /vaults/:vaultId/sync/auto-resolution
   * Returns the auto-resolution configuration for the vault.
   */
  private async getAutoResolutionConfig(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const config = await this.syncService.getAutoResolutionConfig(vaultId)
      return c.json(config, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * PUT /vaults/:vaultId/sync/auto-resolution
   * Updates the auto-resolution configuration for the vault.
   * Body: { enabled, strategies }.
   */
  private async setAutoResolutionConfig(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const body: unknown = await c.req.json()
      const parsed = autoResolutionConfigSchema.safeParse(body)

      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        const message = firstIssue ? firstIssue.message : 'Validation failed'
        const apiError = createApiError('VALIDATION_ERROR', message)
        return c.json(apiError, 400)
      }

      await this.syncService.setAutoResolutionConfig(vaultId, parsed.data)
      return c.json(parsed.data, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  // ─── Scheduler Control ────────────────────────────────────────────────────

  /**
   * POST /vaults/:vaultId/sync/scheduler/pause
   * Pauses the sync scheduler for the vault (while wizard is open).
   */
  private async pauseScheduler(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      this.syncService.pauseScheduler(vaultId)
      return c.json({ status: 'paused' }, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }

  /**
   * POST /vaults/:vaultId/sync/scheduler/resume
   * Resumes the sync scheduler for the vault (wizard closed).
   */
  private async resumeScheduler(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      this.syncService.resumeScheduler(vaultId)
      return c.json({ status: 'resumed' }, 200)
    } catch (error) {
      return handleSyncError(c, error, this.logger)
    }
  }
}

// --- Factory Function ---

/**
 * Creates a SyncRouteModule instance with the provided dependencies.
 * This is the primary entry point for wiring sync routes into the application.
 */
export function createSyncRoutes(deps: SyncRouteDependencies): SyncRouteModule {
  return new SyncRouteModule(deps)
}
