// App Config Routes — the vault's `.obsidian/app.json`. See obsidianConfigRoutes.ts.

import type { Hono } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import type { IAppConfigService } from '../obsidian-config/index.js'
import { appConfigRequestSchema } from '../obsidian-config/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { createObsidianConfigRoutes } from './obsidianConfigRoutes.js'

export interface AppConfigRouteDependencies {
  appConfigService: IAppConfigService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/** Routes for the vault's app.json, nested under /vaults/:vaultId/app-config. */
export function createAppConfigRoutes(deps: AppConfigRouteDependencies): Hono {
  const { appConfigService, ...rest } = deps
  return createObsidianConfigRoutes({
    ...rest,
    service: appConfigService,
    requestSchema: appConfigRequestSchema as never,
    filePath: '.obsidian/app.json',
    invalidCode: 'APP_CONFIG_INVALID',
    label: 'App config',
  })
}
