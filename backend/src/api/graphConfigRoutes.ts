// Graph Config Routes — the vault's `.obsidian/graph.json` (force settings and display options of
// the graph view). See obsidianConfigRoutes.ts.

import type { Hono } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import { graphConfigRequestSchema, type IGraphConfigService } from '../obsidian-config/graph-config.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { createObsidianConfigRoutes } from './obsidianConfigRoutes.js'

export interface GraphConfigRouteDependencies {
  graphConfigService: IGraphConfigService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/** Routes for the vault's graph.json, nested under /vaults/:vaultId/graph-config. */
export function createGraphConfigRoutes(deps: GraphConfigRouteDependencies): Hono {
  const { graphConfigService, ...rest } = deps
  return createObsidianConfigRoutes({
    ...rest,
    service: graphConfigService,
    requestSchema: graphConfigRequestSchema as never,
    filePath: '.obsidian/graph.json',
    invalidCode: 'GRAPH_CONFIG_INVALID',
    label: 'Graph config',
  })
}
