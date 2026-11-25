// Page Preview Config Routes — the vault's `.obsidian/page-preview.json`. See obsidianConfigRoutes.ts.

import type { Hono } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import { pagePreviewConfigRequestSchema, type IPagePreviewConfigService } from '../obsidian-config/page-preview-config.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { createObsidianConfigRoutes } from './obsidianConfigRoutes.js'

export interface PagePreviewConfigRouteDependencies {
  pagePreviewConfigService: IPagePreviewConfigService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/** Routes for the vault's page-preview.json, nested under /vaults/:vaultId/page-preview-config. */
export function createPagePreviewConfigRoutes(deps: PagePreviewConfigRouteDependencies): Hono {
  const { pagePreviewConfigService, ...rest } = deps
  return createObsidianConfigRoutes({
    ...rest,
    service: pagePreviewConfigService,
    requestSchema: pagePreviewConfigRequestSchema as never,
    filePath: '.obsidian/page-preview.json',
    invalidCode: 'PAGE_PREVIEW_CONFIG_INVALID',
    label: 'Page preview config',
  })
}
