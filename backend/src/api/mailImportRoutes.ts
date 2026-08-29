// Mail-Import Routes — Route module for per-vault IMAP mail-import configuration

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import {
  createMailImportConfigSchema,
  updateMailImportConfigSchema,
  mailImportVaultIdParamSchema,
  mailImportConfigIdParamSchema,
  MailImportConfigNotFoundError,
  MailImportConfigLimitExceededError,
  ImapConnectionError,
  MAIL_IMPORT_SECRET_MODULE_ID,
} from '../mail-import/index.js'
import type { IMailImportConfigStore, IMailImportStatusStore, IMailImportEngine, IImapClient, MailImportConfig } from '../mail-import/index.js'
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

/** Never send the password itself back to the client — it's write-only. */
function toPublicConfig(config: MailImportConfig) {
  return config
}

// --- MailImportRouteDependencies ---

export interface MailImportRouteDependencies {
  configStore: IMailImportConfigStore
  statusStore: IMailImportStatusStore
  secretStore: IModuleSecretStore
  importEngine: IMailImportEngine
  imapClient: IImapClient
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  logger: ILogger
}

// --- Route Factory ---

export function createMailImportRoutes(deps: MailImportRouteDependencies): Hono {
  const { configStore, statusStore, secretStore, importEngine, imapClient, accessControl, vaultRegistry, logger } = deps
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

  // GET /vaults/:vaultId/mail-import — list configs (no passwords)
  app.get('/vaults/:vaultId/mail-import', async (c: Context) => {
    const params = mailImportVaultIdParamSchema.safeParse({ vaultId: c.req.param('vaultId') })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'read')
    if ('response' in access) return access.response

    const configs = await configStore.listByVault(vaultId)
    return c.json({ configs: configs.map(toPublicConfig) }, 200)
  })

  // POST /vaults/:vaultId/mail-import — create a config
  app.post('/vaults/:vaultId/mail-import', async (c: Context) => {
    const params = mailImportVaultIdParamSchema.safeParse({ vaultId: c.req.param('vaultId') })
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
    const parsed = createMailImportConfigSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(createApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body'), 400)
    }

    try {
      const config = await configStore.create(vaultId, parsed.data)
      await secretStore.setSecret(vaultId, MAIL_IMPORT_SECRET_MODULE_ID, config.id, parsed.data.password)
      logger.info('Mail-import config created', { vaultId, configId: config.id })
      return c.json(toPublicConfig(config), 201)
    } catch (error) {
      if (error instanceof MailImportConfigLimitExceededError) {
        return c.json(createApiError(error.code, error.message), 409)
      }
      throw error
    }
  })

  // PATCH /vaults/:vaultId/mail-import/:configId — update a config
  app.patch('/vaults/:vaultId/mail-import/:configId', async (c: Context) => {
    const params = mailImportConfigIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      configId: c.req.param('configId'),
    })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId, configId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'write')
    if ('response' in access) return access.response

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }
    const parsed = updateMailImportConfigSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(createApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body'), 400)
    }

    try {
      const { password, ...rest } = parsed.data
      const config = await configStore.update(vaultId, configId, rest)
      if (password !== undefined) {
        await secretStore.setSecret(vaultId, MAIL_IMPORT_SECRET_MODULE_ID, configId, password)
      }
      return c.json(toPublicConfig(config), 200)
    } catch (error) {
      if (error instanceof MailImportConfigNotFoundError) {
        return c.json(createApiError(error.code, error.message), 404)
      }
      throw error
    }
  })

  // DELETE /vaults/:vaultId/mail-import/:configId — remove a config
  app.delete('/vaults/:vaultId/mail-import/:configId', async (c: Context) => {
    const params = mailImportConfigIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      configId: c.req.param('configId'),
    })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId, configId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'write')
    if ('response' in access) return access.response

    try {
      await configStore.remove(vaultId, configId)
      await secretStore.deleteSecret(vaultId, MAIL_IMPORT_SECRET_MODULE_ID, configId)
      logger.info('Mail-import config removed', { vaultId, configId })
      return c.body(null, 204)
    } catch (error) {
      if (error instanceof MailImportConfigNotFoundError) {
        return c.json(createApiError(error.code, error.message), 404)
      }
      throw error
    }
  })

  // POST /vaults/:vaultId/mail-import/:configId/import-now — manual trigger
  app.post('/vaults/:vaultId/mail-import/:configId/import-now', async (c: Context) => {
    const params = mailImportConfigIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      configId: c.req.param('configId'),
    })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId, configId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'write')
    if ('response' in access) return access.response

    try {
      const outcome = await importEngine.runOne(vaultId, configId)
      return c.json(outcome, 200)
    } catch (error) {
      if (error instanceof MailImportConfigNotFoundError) {
        return c.json(createApiError(error.code, error.message), 404)
      }
      logger.error('Manual mail-import run failed unexpectedly', {
        vaultId, configId, message: error instanceof Error ? error.message : String(error),
      })
      return c.json(createApiError('INTERNAL_ERROR', 'Import failed'), 500)
    }
  })

  // GET /vaults/:vaultId/mail-import/:configId/mailbox-tree — folder picker: lists
  // the account's real IMAP mailbox paths, so the user can pick the exact
  // path instead of guessing hierarchy separators/prefixes (e.g. "000" vs
  // "INBOX.000" vs "INBOX/000").
  app.get('/vaults/:vaultId/mail-import/:configId/mailbox-tree', async (c: Context) => {
    const params = mailImportConfigIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      configId: c.req.param('configId'),
    })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId, configId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'read')
    if ('response' in access) return access.response

    const config = await configStore.get(vaultId, configId)
    if (!config) {
      return c.json(createApiError('MAIL_IMPORT_CONFIG_NOT_FOUND', `Mail-import config "${configId}" not found for vault "${vaultId}"`), 404)
    }

    const password = await secretStore.getSecret(vaultId, MAIL_IMPORT_SECRET_MODULE_ID, configId)
    if (password === null) {
      return c.json(createApiError('NO_CREDENTIAL', 'No password stored for this account'), 409)
    }

    try {
      const tree = await imapClient.listMailboxTree({
        host: config.host, port: config.port, secure: config.secure, username: config.username, password,
      })
      return c.json({ tree }, 200)
    } catch (error) {
      if (error instanceof ImapConnectionError) {
        return c.json(createApiError(error.code, error.message), 502)
      }
      logger.error('Failed to list IMAP mailboxes unexpectedly', {
        vaultId, configId, message: error instanceof Error ? error.message : String(error),
      })
      return c.json(createApiError('INTERNAL_ERROR', 'Failed to list mailboxes'), 500)
    }
  })

  // GET /vaults/:vaultId/mail-import/:configId/status — last run status
  app.get('/vaults/:vaultId/mail-import/:configId/status', async (c: Context) => {
    const params = mailImportConfigIdParamSchema.safeParse({
      vaultId: c.req.param('vaultId'),
      configId: c.req.param('configId'),
    })
    if (!params.success) {
      return c.json(createApiError('VALIDATION_ERROR', params.error.issues[0]?.message ?? 'Invalid parameters'), 400)
    }
    const { vaultId, configId } = params.data

    const access = await requireVaultAccess(c, vaultId, 'read')
    if ('response' in access) return access.response

    const status = await statusStore.getStatus(vaultId, configId)
    return c.json(status ?? { configId, lastRunAt: null, lastResult: null, lastError: null, lastFoundCount: 0, lastImportedCount: 0 }, 200)
  })

  return app
}
