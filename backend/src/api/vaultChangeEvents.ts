// Publishes `vault:change` for changes that routes make to vault files outside the file API
// (plugins, themes, snippets), so other clients of the vault can refresh.

import type { Context } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'

export interface VaultChangePublisherDeps {
  eventBus: IEventBus
  accessControl: IVaultAccessControl
  logger: ILogger
}

/**
 * Tells the other clients of the vault that `path` (relative to the vault root) changed.
 * The writer's own user is excluded: the response already told them. Best-effort — the write
 * itself has succeeded, so a failure to notify is logged and swallowed.
 */
export async function publishVaultChange(
  deps: VaultChangePublisherDeps,
  c: Context,
  vaultId: string,
  path: string,
  action: 'saved' | 'deleted',
): Promise<void> {
  const session = c.get('session') as SessionContext | undefined
  if (session === undefined) return
  try {
    deps.eventBus.publish({
      type: 'vault:change',
      payload: { vaultId, action, path, userId: session.userId, username: session.username },
      target: { kind: 'users', userIds: await deps.accessControl.getUsersWithAccess(vaultId) },
      excludeUserId: session.userId,
    })
  } catch (error) {
    deps.logger.warn('Failed to publish vault change event', {
      path,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Path of a plugin's manifest — the file whose appearance or removal marks a plugin as (un)installed. */
export function pluginManifestPath(pluginId: string): string {
  return `.obsidian/plugins/${pluginId}/manifest.json`
}

/** The list of enabled plugins, which the registry mirrors. */
export const COMMUNITY_PLUGINS_PATH = '.obsidian/community-plugins.json'
