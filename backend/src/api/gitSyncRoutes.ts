// Git-Sync Routes — Route module for per-vault git remote configuration and sync

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import {
  createGitSyncRemoteSchema,
  updateGitSyncRemoteSchema,
  updateGitSyncBranchSchema,
  gitSyncVaultIdParamSchema,
  gitSyncRemoteIdParamSchema,
  GitSyncRemoteNotFoundError,
  GitSyncRemoteLimitExceededError,
  GIT_SYNC_SECRET_MODULE_ID,
} from '../git-sync/index.js'
import type { IGitSyncConfigStore, IGitSyncStatusStore, IGitSyncEngine, GitSyncRemoteConfig } from '../git-sync/index.js'
import type { ISshKeyGenerator } from '../git-sync/index.js'
import { GitCommandFailedError } from '../git-sync/index.js'
import type { IModuleSecretStore } from '../shared-secrets/index.js'

// --- Helper: API Error Response ---

interface ApiError {
  code: string
  message: string
  timestamp: string
}

function createApiError(code: string, message: string): ApiError {
  return { code, message, timestamp: new Date().toISOString() }
}

/** Never send the credential itself back to the client — it's write-only. */
function toPublicRemote(remote: GitSyncRemoteConfig) {
  return remote
}

// --- GitSyncRouteDependencies ---

export interface GitSyncRouteDependencies {
  configStore: IGitSyncConfigStore
  statusStore: IGitSyncStatusStore
  secretStore: IModuleSecretStore
  syncEngine: IGitSyncEngine
  sshKeyGenerator: ISshKeyGenerator
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  logger: ILogger
}

// --- Route Factory ---

export function createGitSyncRoutes(deps: GitSyncRouteDependencies): Hono {
  const { configStore, statusStore, secretStore, syncEngine, sshKeyGenerator, accessControl, vaultRegistry, logger } = deps
  const app = new Hono()

  async function requireVaultAccess(
    c: Context,
    vaultId: string,
    level: 'read' | 'write',
  ): Promise<{ session: SessionContext } | { response: Response }> {
    const session = c.get('session') as SessionContext | undefined
    if (!session) {
      return { response: c.json(createApiError('UNAUTHORIZED', 'Missing session context'), 401) }
    }

    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      return { response: c.json(createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`), 404) }
    }

    try {
      if (level === 'read') {
        await accessControl.checkReadAccess(vaultId, session.userId)
      } else {
        await accessControl.checkWriteAccess(vaultId, session.userId)
      }
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        return { response: c.json(createApiError('FORBIDDEN', error.message), 403) }
      }
      if (error instanceof VaultNotFoundError) {
        return { response: c.json(createApiError('VAULT_NOT_FOUND', error.message), 404) }
      }
      throw error
    }

    return { session }
  }

  // GET /vaults/:vaultId/git-sync — branch + all remotes (no credentials)
  app.get('/vaults/:vaultId/git-sync', async (c: Context) => {
    const params = gitSyncVaultIdParamSchema.safeParse({ vaultId: c.req.param('vaultId') })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'read')
    if ('response' in access) return access.response

    const data = await configStore.getVaultData(vaultId)
    return c.json({ branch: data.branch, remotes: data.remotes.map(toPublicRemote) }, 200)
  })

  // PATCH /vaults/:vaultId/git-sync/branch — update the shared local branch
  app.patch('/vaults/:vaultId/git-sync/branch', async (c: Context) => {
    const params = gitSyncVaultIdParamSchema.safeParse({ vaultId: c.req.param('vaultId') })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'write')
    if ('response' in access) return access.response

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }
    const parsed = updateGitSyncBranchSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(createApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body'), 400)
    }

    const data = await configStore.setBranch(vaultId, parsed.data.branch)
    return c.json({ branch: data.branch }, 200)
  })

  // POST /vaults/:vaultId/git-sync/generate-ssh-key — generate a fresh ed25519 keypair
  // (stateless: not persisted here, just returned for the caller to submit via create/update)
  app.post('/vaults/:vaultId/git-sync/generate-ssh-key', async (c: Context) => {
    const params = gitSyncVaultIdParamSchema.safeParse({ vaultId: c.req.param('vaultId') })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'write')
    if ('response' in access) return access.response

    const { privateKey, publicKey } = await sshKeyGenerator.generateKeyPair(`slatebase-sync@${vaultId}`)
    return c.json({ privateKey, publicKey }, 200)
  })

  // POST /vaults/:vaultId/git-sync/remotes — create a remote
  app.post('/vaults/:vaultId/git-sync/remotes', async (c: Context) => {
    const params = gitSyncVaultIdParamSchema.safeParse({ vaultId: c.req.param('vaultId') })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'write')
    if ('response' in access) return access.response

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }
    const parsed = createGitSyncRemoteSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(createApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body'), 400)
    }

    let publicKey: string | null = null
    if (parsed.data.authMethod === 'ssh-key') {
      try {
        publicKey = await sshKeyGenerator.derivePublicKey(parsed.data.credential)
      } catch (error) {
        if (error instanceof GitCommandFailedError) {
          return c.json(createApiError('VALIDATION_ERROR', 'credential is not a valid SSH private key'), 400)
        }
        throw error
      }
    }

    try {
      const remote = await configStore.createRemote(vaultId, parsed.data, publicKey)
      await secretStore.setSecret(vaultId, GIT_SYNC_SECRET_MODULE_ID, remote.id, parsed.data.credential)
      logger.info('Git-sync remote created', { vaultId, remoteId: remote.id })
      return c.json(toPublicRemote(remote), 201)
    } catch (error) {
      if (error instanceof GitSyncRemoteLimitExceededError) {
        return c.json(createApiError(error.code, error.message), 409)
      }
      throw error
    }
  })

  // PATCH /vaults/:vaultId/git-sync/remotes/:remoteId — update a remote
  app.patch('/vaults/:vaultId/git-sync/remotes/:remoteId', async (c: Context) => {
    const params = gitSyncRemoteIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      remoteId: c.req.param('remoteId'),
    })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId, remoteId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'write')
    if ('response' in access) return access.response

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }
    const parsed = updateGitSyncRemoteSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(createApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body'), 400)
    }

    const existing = await configStore.getRemote(vaultId, remoteId)
    if (!existing) {
      return c.json(createApiError('GIT_SYNC_REMOTE_NOT_FOUND', `Git-sync remote "${remoteId}" not found for vault "${vaultId}"`), 404)
    }

    const { credential, ...rest } = parsed.data
    const effectiveAuthMethod = parsed.data.authMethod ?? existing.authMethod

    let publicKey: string | null | undefined
    if (effectiveAuthMethod === 'ssh-key') {
      if (credential !== undefined) {
        try {
          publicKey = await sshKeyGenerator.derivePublicKey(credential)
        } catch (error) {
          if (error instanceof GitCommandFailedError) {
            return c.json(createApiError('VALIDATION_ERROR', 'credential is not a valid SSH private key'), 400)
          }
          throw error
        }
      } else if (existing.authMethod !== 'ssh-key') {
        return c.json(createApiError('VALIDATION_ERROR', 'credential is required when switching to ssh-key auth'), 400)
      } // else: staying on ssh-key without a new credential -> leave the stored publicKey as-is (undefined)
    } else {
      publicKey = null // switched to (or staying on) https-token -> clear any stored SSH public key
    }

    try {
      const remote = await configStore.updateRemote(vaultId, remoteId, rest, publicKey)
      if (credential !== undefined) {
        await secretStore.setSecret(vaultId, GIT_SYNC_SECRET_MODULE_ID, remoteId, credential)
      }
      return c.json(toPublicRemote(remote), 200)
    } catch (error) {
      if (error instanceof GitSyncRemoteNotFoundError) {
        return c.json(createApiError(error.code, error.message), 404)
      }
      throw error
    }
  })

  // DELETE /vaults/:vaultId/git-sync/remotes/:remoteId — remove a remote
  app.delete('/vaults/:vaultId/git-sync/remotes/:remoteId', async (c: Context) => {
    const params = gitSyncRemoteIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      remoteId: c.req.param('remoteId'),
    })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId, remoteId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'write')
    if ('response' in access) return access.response

    try {
      await configStore.removeRemote(vaultId, remoteId)
      await secretStore.deleteSecret(vaultId, GIT_SYNC_SECRET_MODULE_ID, remoteId)
      logger.info('Git-sync remote removed', { vaultId, remoteId })
      return c.body(null, 204)
    } catch (error) {
      if (error instanceof GitSyncRemoteNotFoundError) {
        return c.json(createApiError(error.code, error.message), 404)
      }
      throw error
    }
  })

  // POST /vaults/:vaultId/git-sync/remotes/:remoteId/sync-now — manual trigger
  app.post('/vaults/:vaultId/git-sync/remotes/:remoteId/sync-now', async (c: Context) => {
    const params = gitSyncRemoteIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      remoteId: c.req.param('remoteId'),
    })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId, remoteId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'write')
    if ('response' in access) return access.response

    try {
      const outcome = await syncEngine.runOne(vaultId, remoteId)
      return c.json(outcome, 200)
    } catch (error) {
      if (error instanceof GitSyncRemoteNotFoundError) {
        return c.json(createApiError(error.code, error.message), 404)
      }
      logger.error('Manual git-sync run failed unexpectedly', {
        vaultId, remoteId, message: error instanceof Error ? error.message : String(error),
      })
      return c.json(createApiError('INTERNAL_ERROR', 'Sync failed'), 500)
    }
  })

  // GET /vaults/:vaultId/git-sync/remotes/:remoteId/status — last run status
  app.get('/vaults/:vaultId/git-sync/remotes/:remoteId/status', async (c: Context) => {
    const params = gitSyncRemoteIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      remoteId: c.req.param('remoteId'),
    })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId, remoteId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'read')
    if ('response' in access) return access.response

    const status = await statusStore.getStatus(vaultId, remoteId)
    return c.json(status ?? { remoteId, lastRunAt: null, lastResult: null, lastError: null, conflictFiles: [], lastPulledFiles: null, lastPushedFiles: null }, 200)
  })

  return app
}
