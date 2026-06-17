// Statistics Routes — Route module for vault statistics endpoint

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IVaultStatisticsService } from '../statistics/index.js'
import { StatisticsTimeoutError, formatSize } from '../statistics/index.js'

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

// --- StatisticsRouteDependencies ---

/**
 * Dependencies required by the statistics route factory.
 */
export interface StatisticsRouteDependencies {
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  statisticsService: IVaultStatisticsService
  logger: ILogger
}

// --- Statistics Route Factory ---

/**
 * Creates a Hono app with the statistics route registered.
 * Registers `GET /vaults/:vaultId/statistics` for retrieving vault statistics.
 *
 * @returns A Hono instance with statistics routes registered.
 */
export function createStatisticsRoutes(deps: StatisticsRouteDependencies): Hono {
  const { accessControl, vaultRegistry, statisticsService, logger } = deps
  const app = new Hono()

  /**
   * GET /vaults/:vaultId/statistics
   *
   * Returns aggregated vault statistics: file count, folder count, total size.
   * Requires authenticated session with read access to the vault.
   *
   * Returns 200 with `{ fileCount, folderCount, totalSizeBytes, formattedSize }`
   * Returns 401 if no session
   * Returns 403 if read access denied
   * Returns 404 if vault not found
   * Returns 408 if statistics computation times out
   */
  app.get('/vaults/:vaultId/statistics', async (c: Context) => {
    const vaultId = c.req.param('vaultId') as string
    const session = c.get('session') as SessionContext | undefined

    // 1. Auth check
    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // 2. Vault existence check
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) {
      const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(error, 404)
    }

    // 3. Read access check
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

    // 4. Get statistics
    try {
      const stats = await statisticsService.getStatistics(vaultId)
      const formattedSize = formatSize(stats.totalSizeBytes)

      return c.json({
        fileCount: stats.fileCount,
        folderCount: stats.folderCount,
        totalSizeBytes: stats.totalSizeBytes,
        formattedSize,
      }, 200)
    } catch (error) {
      // 5. Map StatisticsTimeoutError → 408
      if (error instanceof StatisticsTimeoutError) {
        logger.warn('Statistics computation timed out', { vaultId })
        const apiError = createApiError('STATISTICS_TIMEOUT', error.message)
        return c.json(apiError, 408)
      }

      logger.error('Statistics retrieval failed', {
        vaultId,
        message: error instanceof Error ? error.message : String(error),
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Failed to retrieve statistics')
      return c.json(apiError, 500)
    }
  })

  return app
}
