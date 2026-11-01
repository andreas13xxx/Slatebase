// Workspaces Config Routes — the vault's `.obsidian/workspaces.json`. See obsidianConfigRoutes.ts.

import type { Hono } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import { workspacesConfigRequestSchema, type IWorkspacesConfigService } from '../obsidian-config/workspaces-config.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { createObsidianConfigRoutes } from './obsidianConfigRoutes.js'

export interface WorkspacesConfigRouteDependencies {
  workspacesConfigService: IWorkspacesConfigService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/** Routes for the vault's workspaces.json, nested under /vaults/:vaultId/workspaces-config. */
export function createWorkspacesConfigRoutes(deps: WorkspacesConfigRouteDependencies): Hono {
  const { workspacesConfigService, ...rest } = deps
  return createObsidianConfigRoutes({
    ...rest,
    service: workspacesConfigService,
    requestSchema: workspacesConfigRequestSchema as never,
    filePath: '.obsidian/workspaces.json',
    invalidCode: 'WORKSPACES_CONFIG_INVALID',
    label: 'Workspaces config',
  })
}
