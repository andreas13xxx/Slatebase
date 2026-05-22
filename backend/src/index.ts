// Slatebase Backend — Composition Root
// Start with: node --experimental-strip-types --env-file=.env src/index.ts (Node.js 22+)
// Or dev mode: tsx watch --env-file=.env src/index.ts

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'

import { ConfigService } from './config/index.js'
import { createLogger } from './logger/index.js'
import { VaultReader, VaultManager } from './vault/index.js'
import { VaultRegistry } from './vault/registry.js'
import { VaultService } from './business/index.js'
import { ImportService } from './import/index.js'
import { VaultController, VaultRouteModule, createRouter } from './api/index.js'

// --- Composition Root ---

const config = new ConfigService()
const logger = createLogger(config)
const serverConfig = config.getServerConfig()

const vaultReader = new VaultReader()
const vaultManager = new VaultManager(vaultReader, logger, serverConfig.maxDirectoryDepth)
const vaultRegistry = new VaultRegistry(serverConfig.dataDir, logger)
const vaultService = new VaultService(vaultManager, vaultReader, config, logger, vaultRegistry)
const importService = new ImportService(vaultManager, vaultReader, config, logger)
const vaultController = new VaultController(vaultService, logger, importService)

// --- Route Registry ---

const routeModules = [new VaultRouteModule(vaultController)]
const router = createRouter(routeModules)

// --- Hono App ---

const app = new Hono()

app.use(
  '*',
  cors({
    origin: serverConfig.allowedOrigins,
    allowMethods: ['GET', 'POST', 'DELETE'],
    allowHeaders: ['Content-Type'],
  }),
)

app.route('/api/v1', router)

// --- Initialize Vaults & Start Server ---

await vaultService.initializeVaults()

serve(
  {
    fetch: app.fetch,
    hostname: serverConfig.host,
    port: serverConfig.port,
  },
  (info) => {
    logger.info('Server started', { host: info.address, port: info.port })
  },
)
