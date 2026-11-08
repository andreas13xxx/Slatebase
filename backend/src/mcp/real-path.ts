import path from 'node:path'
import type { IVaultService } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import { assertRealPathInsideVault, PathTraversalError } from '../vault/index.js'

/**
 * Resolves `relativePath` inside a vault for direct filesystem access by MCP.
 *
 * `IVaultService.resolveFilePath()` only validates the path lexically, so a
 * symlink inside the vault pointing outside of it would pass and `stat`/`readFile`/
 * `mkdir` would follow it out. This additionally resolves every symlink on the way
 * (also for not-yet-existing targets, via the nearest existing ancestor) and
 * throws PathTraversalError if the real path leaves the vault — the same
 * containment check `VaultService` applies to its own file operations.
 */
export async function resolveContainedPath(
  vaultService: Pick<IVaultService, 'resolveFilePath'>,
  vaultId: string,
  relativePath: string,
  logger?: ILogger,
): Promise<string> {
  const resolvedPath = vaultService.resolveFilePath(vaultId, relativePath)
  // resolveFilePath('dummy') yields <vaultRoot>/dummy, so its parent is the vault root
  const vaultRoot = path.dirname(vaultService.resolveFilePath(vaultId, 'dummy'))
  try {
    await assertRealPathInsideVault(vaultRoot, resolvedPath, {
      vaultId,
      requestedPath: relativePath,
      ...(logger ? { logger } : {}),
    })
  } catch (error) {
    if (error instanceof PathTraversalError) throw error
    // ELOOP / EACCES / ...: log the cause, but never leak the absolute server path to the client
    logger?.warn('MCP realpath check failed', {
      vaultId,
      requestedPath: relativePath,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new PathTraversalError(relativePath)
  }
  return resolvedPath
}
