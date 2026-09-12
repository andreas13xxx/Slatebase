// Shared vault-access-check helper.
//
// Checks session presence, vault existence, and access at the given level in
// one call, returning either { authorized: true } or a ready-to-return
// 401/404/403 Response. `checkVaultAccess` and `VaultAccessLevel` are imported
// by vault-authorization-middleware.ts, which is what now enforces this for
// every /api/v1/vaults/:vaultId/* route — this module is its implementation,
// not a second place route handlers call into.

import type { Context } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { SessionContext } from '../auth/index.js'

export type AccessCheckResult =
  | { authorized: true }
  | { authorized: false; response: Response }

/** Vault access level a route may require. */
export type VaultAccessLevel = 'read' | 'write' | 'owner'

/**
 * Checks authentication and vault access at the given level.
 * Returns 401 if no session, 404 if vault not found, 403 if access denied.
 */
export async function checkVaultAccess(
  c: Context,
  vaultId: string,
  level: VaultAccessLevel,
  vaultRegistry: IVaultRegistry,
  accessControl: IVaultAccessControl,
): Promise<AccessCheckResult> {
  const session = c.get('session') as SessionContext | undefined
  if (session === undefined) {
    return {
      authorized: false,
      response: c.json({ code: 'UNAUTHORIZED', message: 'Missing session context', timestamp: new Date().toISOString() }, 401),
    }
  }

  const entry = vaultRegistry.findById(vaultId)
  if (entry === null) {
    return {
      authorized: false,
      response: c.json({ code: 'VAULT_NOT_FOUND', message: `Vault not found: ${vaultId}`, timestamp: new Date().toISOString() }, 404),
    }
  }

  try {
    if (level === 'read') {
      await accessControl.checkReadAccess(vaultId, session.userId)
    } else if (level === 'write') {
      await accessControl.checkWriteAccess(vaultId, session.userId)
    } else {
      await accessControl.checkOwnerAccess(vaultId, session.userId)
    }
  } catch (error) {
    if (error instanceof VaultAccessDeniedError) {
      return {
        authorized: false,
        response: c.json({ code: 'FORBIDDEN', message: error.message, timestamp: new Date().toISOString() }, 403),
      }
    }
    throw error
  }

  return { authorized: true }
}
