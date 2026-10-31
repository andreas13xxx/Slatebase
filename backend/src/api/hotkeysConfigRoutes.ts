// Hotkeys Config Routes — the vault's `.obsidian/hotkeys.json`. See obsidianConfigRoutes.ts.

import type { Hono } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import { hotkeysConfigRequestSchema, type IHotkeysConfigService } from '../obsidian-config/hotkeys-config.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { createObsidianConfigRoutes } from './obsidianConfigRoutes.js'

export interface HotkeysConfigRouteDependencies {
  hotkeysConfigService: IHotkeysConfigService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/** Routes for the vault's hotkeys.json, nested under /vaults/:vaultId/hotkeys-config. */
export function createHotkeysConfigRoutes(deps: HotkeysConfigRouteDependencies): Hono {
  const { hotkeysConfigService, ...rest } = deps
  return createObsidianConfigRoutes({
    ...rest,
    service: hotkeysConfigService,
    requestSchema: hotkeysConfigRequestSchema as never,
    filePath: '.obsidian/hotkeys.json',
    invalidCode: 'HOTKEYS_CONFIG_INVALID',
    label: 'Hotkeys config',
  })
}
