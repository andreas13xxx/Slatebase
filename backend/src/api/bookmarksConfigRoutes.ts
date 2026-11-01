// Bookmarks Config Routes — the vault's `.obsidian/bookmarks.json`. See obsidianConfigRoutes.ts.

import type { Hono } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'
import { bookmarksConfigRequestSchema, type IBookmarksConfigService } from '../obsidian-config/bookmarks-config.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { createObsidianConfigRoutes } from './obsidianConfigRoutes.js'

export interface BookmarksConfigRouteDependencies {
  bookmarksConfigService: IBookmarksConfigService
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  eventBus: IEventBus
  logger: ILogger
}

/** Routes for the vault's bookmarks.json, nested under /vaults/:vaultId/bookmarks-config. */
export function createBookmarksConfigRoutes(deps: BookmarksConfigRouteDependencies): Hono {
  const { bookmarksConfigService, ...rest } = deps
  return createObsidianConfigRoutes({
    ...rest,
    service: bookmarksConfigService,
    requestSchema: bookmarksConfigRequestSchema as never,
    filePath: '.obsidian/bookmarks.json',
    invalidCode: 'BOOKMARKS_CONFIG_INVALID',
    label: 'Bookmarks config',
  })
}
