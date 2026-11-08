import path from 'node:path'
import type { IVaultService } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import { assertRealPathInsideVault } from '../vault/index.js'

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
  await assertRealPathInsideVault(vaultRoot, resolvedPath, {
    vaultId,
    requestedPath: relativePath,
    ...(logger ? { logger } : {}),
  })
  return resolvedPath
}
