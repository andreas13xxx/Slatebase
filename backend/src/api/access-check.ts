// Shared vault-access-check helper for route handlers
//
// Checks session presence, vault existence, and read access in one call,
// returning either { authorized: true } or a ready-to-return 401/404/403
// Response — used by any route module where a handler needs read access to
// a vault before doing its own work (graph, plugin, and plugin-store routes).

import type { Context } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { SessionContext } from '../auth/index.js'

export type AccessCheckResult =
  | { authorized: true }
  | { authorized: false; response: Response }

/**
 * Checks authentication and vault access (read permission).
 * Returns 401 if no session, 404 if vault not found, 403 if access denied.
 */
export async function checkVaultReadAccess(
  c: Context,
  vaultId: string,
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
    await accessControl.checkReadAccess(vaultId, session.userId)
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
