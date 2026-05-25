// Vault Share Routes — Route module for vault sharing and ownership transfer

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { IVaultAccessControl, IVaultService } from '../business/index.js'
import type { IVaultShareRegistry } from '../vault/registry.js'
import {
  VaultAccessDeniedError,
  VaultNotFoundError,
  ShareLimitError,
  InvalidShareTargetError,
  VaultHasActiveSharesError,
  SharesNotRevokedError,
} from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IUserRepository } from '../user/index.js'
import type { RouteModule } from './index.js'

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
 * Returns the session context if authorized, or a 403/404 Response if not.
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

  if (entry.ownerId !== session.userId) {
    const error = createApiError('ACCESS_DENIED', 'Only the vault owner can manage shares')
    return { authorized: false, response: c.json(error, 403) }
  }

  return { authorized: true, session }
}

// --- Helper: Domain Error Mapping ---

/**
 * Maps domain errors to HTTP status codes and structured ApiError responses.
 */
function handleShareError(c: Context, error: unknown, logger: ILogger): Response {
  if (error instanceof VaultAccessDeniedError) {
    logger.warn('Vault access denied', { vaultId: error.vaultId, userId: error.userId })
    const apiError = createApiError('ACCESS_DENIED', error.message)
    return c.json(apiError, 403)
  }

  if (error instanceof VaultNotFoundError) {
    logger.warn('Vault not found', { vaultId: error.vaultId })
    const apiError = createApiError('VAULT_NOT_FOUND', error.message)
    return c.json(apiError, 404)
  }

  if (error instanceof ShareLimitError) {
    logger.warn('Share limit reached', { vaultId: error.vaultId, maxShares: error.maxShares })
    const apiError = createApiError('SHARE_LIMIT_REACHED', error.message)
    return c.json(apiError, 409)
  }

  if (error instanceof InvalidShareTargetError) {
    logger.warn('Invalid share target', { code: error.code, message: error.message })
    const apiError = createApiError('INVALID_SHARE_TARGET', error.message)
    return c.json(apiError, 400)
  }

  if (error instanceof VaultHasActiveSharesError) {
    logger.warn('Vault has active shares', { vaultId: error.vaultId })
    const apiError = createApiError('VAULT_HAS_ACTIVE_SHARES', error.message)
    return c.json(apiError, 409)
  }

  if (error instanceof SharesNotRevokedError) {
    logger.warn('Shares not revoked before transfer', { vaultId: error.vaultId })
    const apiError = createApiError('SHARES_NOT_REVOKED', error.message)
    return c.json(apiError, 409)
  }

  // Unknown / internal errors
  logger.error('Unexpected error in vault share route', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  const apiError = createApiError('INTERNAL_ERROR', 'Internal server error')
  return c.json(apiError, 500)
}

// --- VaultShareRouteModule ---

/**
 * Route module for vault sharing operations.
 * Registers routes under /vaults/:vaultId/shares and /vaults/:vaultId/transfer.
 * All routes require the caller to be the vault owner.
 */
export class VaultShareRouteModule implements RouteModule {
  constructor(
    private readonly accessControl: IVaultAccessControl,
    private readonly vaultService: IVaultService,
    private readonly vaultRegistry: IVaultRegistry,
    private readonly logger: ILogger,
    private readonly shareRegistry?: IVaultShareRegistry,
    private readonly userRepository?: IUserRepository,
  ) {}

  /**
   * Registers vault share routes on the provided Hono router.
   */
  register(router: Hono): void {
    // GET /vaults/:vaultId/shares — List shares for a vault
    router.get('/vaults/:vaultId/shares', (c) => this.listShares(c))

    // POST /vaults/:vaultId/shares — Create a share
    router.post('/vaults/:vaultId/shares', (c) => this.createShare(c))

    // DELETE /vaults/:vaultId/shares/:userId — Revoke a share
    router.delete('/vaults/:vaultId/shares/:userId', (c) => this.revokeShare(c))

    // PUT /vaults/:vaultId/shares/:userId — Update share permission
    router.put('/vaults/:vaultId/shares/:userId', (c) => this.updateSharePermission(c))

    // POST /vaults/:vaultId/transfer — Transfer ownership
    router.post('/vaults/:vaultId/transfer', (c) => this.transferOwnership(c))
  }

  /**
   * GET /vaults/:vaultId/shares
   * Lists all shares for a vault. Only the vault owner can list shares.
   * Enriches each share entry with the username of the target user.
   */
  private async listShares(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    if (!this.shareRegistry) {
      const error = createApiError('INTERNAL_ERROR', 'Share registry not available')
      return c.json(error, 500)
    }

    try {
      const shares = await this.shareRegistry.getSharesForVault(vaultId)

      // Enrich with username if userRepository is available
      if (this.userRepository) {
        const enriched = await Promise.all(
          shares.map(async (share) => {
            const user = await this.userRepository!.findById(share.userId)
            return {
              ...share,
              username: user?.username ?? share.userId,
              displayName: user?.displayName ?? '',
            }
          }),
        )
        return c.json(enriched, 200)
      }

      return c.json(shares, 200)
    } catch (error) {
      return handleShareError(c, error, this.logger)
    }
  }

  /**
   * POST /vaults/:vaultId/shares
   * Creates a share for a target user on the vault.
   * Body: { userId: string, permission: 'read' | 'write' }
   */
  private async createShare(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const body: unknown = await c.req.json()

      if (body === null || typeof body !== 'object') {
        const error = createApiError('VALIDATION_ERROR', 'Request body must be a JSON object')
        return c.json(error, 400)
      }

      const { userId, permission } = body as { userId?: unknown; permission?: unknown }

      if (typeof userId !== 'string' || userId.length === 0) {
        const error = createApiError('VALIDATION_ERROR', 'Missing or invalid field: userId')
        return c.json(error, 400)
      }

      if (permission !== 'read' && permission !== 'write') {
        const error = createApiError('VALIDATION_ERROR', 'Field permission must be "read" or "write"')
        return c.json(error, 400)
      }

      await this.accessControl.createShare(vaultId, ownerCheck.session.userId, userId, permission)

      return c.json({ vaultId, userId, permission }, 201)
    } catch (error) {
      return handleShareError(c, error, this.logger)
    }
  }

  /**
   * DELETE /vaults/:vaultId/shares/:userId
   * Revokes a share for a target user on the vault.
   */
  private async revokeShare(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string
    const targetUserId = c.req.param('userId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      await this.accessControl.revokeShare(vaultId, ownerCheck.session.userId, targetUserId)
      return c.body(null, 204)
    } catch (error) {
      return handleShareError(c, error, this.logger)
    }
  }

  /**
   * PUT /vaults/:vaultId/shares/:userId
   * Updates the permission level of an existing share.
   * Body: { permission: 'read' | 'write' }
   */
  private async updateSharePermission(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string
    const targetUserId = c.req.param('userId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const body: unknown = await c.req.json()

      if (body === null || typeof body !== 'object') {
        const error = createApiError('VALIDATION_ERROR', 'Request body must be a JSON object')
        return c.json(error, 400)
      }

      const { permission } = body as { permission?: unknown }

      if (permission !== 'read' && permission !== 'write') {
        const error = createApiError('VALIDATION_ERROR', 'Field permission must be "read" or "write"')
        return c.json(error, 400)
      }

      await this.accessControl.updateSharePermission(vaultId, ownerCheck.session.userId, targetUserId, permission)

      return c.json({ vaultId, userId: targetUserId, permission }, 200)
    } catch (error) {
      return handleShareError(c, error, this.logger)
    }
  }

  /**
   * POST /vaults/:vaultId/transfer
   * Transfers ownership of the vault to a new owner.
   * Body: { newOwnerId: string }
   */
  private async transferOwnership(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const ownerCheck = checkOwnership(c, vaultId, this.vaultRegistry)
    if (!ownerCheck.authorized) {
      return ownerCheck.response
    }

    try {
      const body: unknown = await c.req.json()

      if (body === null || typeof body !== 'object') {
        const error = createApiError('VALIDATION_ERROR', 'Request body must be a JSON object')
        return c.json(error, 400)
      }

      const { newOwnerId } = body as { newOwnerId?: unknown }

      if (typeof newOwnerId !== 'string' || newOwnerId.length === 0) {
        const error = createApiError('VALIDATION_ERROR', 'Missing or invalid field: newOwnerId')
        return c.json(error, 400)
      }

      await this.vaultService.transferOwnership(vaultId, ownerCheck.session.userId, newOwnerId)

      return c.json({ vaultId, newOwnerId }, 200)
    } catch (error) {
      return handleShareError(c, error, this.logger)
    }
  }
}
