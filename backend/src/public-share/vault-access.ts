// ─── Public Share Links — Vault access adapter ───────────────────────────────

import fs from 'node:fs/promises'
import type { IVaultService } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import { assertRealPathInsideVault } from '../vault/index.js'
import type { IPublicShareVaultAccess } from './types.js'

/** Largest asset the public routes will read into memory. */
export const MAX_PUBLIC_ASSET_BYTES = 50 * 1024 * 1024

/** What the adapter needs from the application. */
export interface PublicShareVaultAccessDeps {
  vaultService: Pick<IVaultService, 'getVaultTree' | 'getFileContent' | 'resolveFilePath'>
  /** Absolute root of the vault, or `null` if the vault is unknown. */
  getVaultRoot(vaultId: string): string | null
  logger: ILogger
}

/**
 * Builds the vault access the public share module uses.
 *
 * Every read goes through `VaultService` (which validates the path) or, for
 * binary assets, `resolveFilePath` plus the symlink guard — a note in a shared
 * vault must not be able to embed a file outside the vault via a symlink.
 * Failures read as `null`/`unreadable`, never as a hard error.
 */
export function createPublicShareVaultAccess(deps: PublicShareVaultAccessDeps): IPublicShareVaultAccess {
  const { vaultService, getVaultRoot, logger } = deps

  return {
    async getTree(vaultId) {
      try {
        return await vaultService.getVaultTree(vaultId)
      } catch (error) {
        logger.warn('Public share: vault tree unavailable', { vaultId, error: String(error) })
        return null
      }
    },

    async readText(vaultId, filePath) {
      try {
        const file = await vaultService.getFileContent(vaultId, filePath)
        // A truncated note would be shown cut off without the reader noticing.
        if (file.isBinary || file.isTruncated) return null
        return file.content
      } catch {
        return null
      }
    },

    async readBinary(vaultId, filePath) {
      try {
        const root = getVaultRoot(vaultId)
        if (root === null) return null
        const resolved = vaultService.resolveFilePath(vaultId, filePath)
        await assertRealPathInsideVault(root, resolved, { vaultId, requestedPath: filePath, logger })
        const stat = await fs.stat(resolved)
        if (!stat.isFile() || stat.size > MAX_PUBLIC_ASSET_BYTES) return null
        return await fs.readFile(resolved)
      } catch {
        return null
      }
    },
  }
}
