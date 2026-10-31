// Appearance Config Routes — the vault's `.obsidian/appearance.json` (base theme, accent colour,
// font size and fonts; the theme and the CSS snippets have their own routes). See obsidianConfigRoutes.ts.

import type { Hono } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import { appearanceConfigRequestSchema, type IAppearanceConfigService } from '../obsidian-config/appearance-config.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { createObsidianConfigRoutes } from './obsidianConfigRoutes.js'

export interface AppearanceConfigRouteDependencies {
  appearanceConfigService: IAppearanceConfigService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/** Routes for the vault's appearance.json, nested under /vaults/:vaultId/appearance-config. */
export function createAppearanceConfigRoutes(deps: AppearanceConfigRouteDependencies): Hono {
  const { appearanceConfigService, ...rest } = deps
  return createObsidianConfigRoutes({
    ...rest,
    service: appearanceConfigService,
    requestSchema: appearanceConfigRequestSchema as never,
    filePath: '.obsidian/appearance.json',
    invalidCode: 'APPEARANCE_CONFIG_INVALID',
    label: 'Appearance config',
  })
}
