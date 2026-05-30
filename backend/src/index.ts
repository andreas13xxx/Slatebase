// Slatebase Backend — Composition Root
// Start with: node --experimental-strip-types --env-file=.env src/index.ts (Node.js 22+)
// Or dev mode: tsx watch --env-file=.env src/index.ts

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer as createHttpServer } from 'node:http'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getRequestListener } from '@hono/node-server'

import { ConfigService } from './config/index.js'
import { createLogger, ServerLogStore } from './logger/index.js'
import { VaultReader, VaultManager } from './vault/index.js'
import { VaultRegistry, VaultShareRegistry } from './vault/registry.js'
import { VaultService, VaultAccessControlService } from './business/index.js'
import { ImportService } from './import/index.js'
import { VaultController, VaultRouteModule, createRouter } from './api/index.js'
import { AuthRouteModule, AuthController } from './api/authRoutes.js'
import { UserController, UserRouteModule } from './api/userRoutes.js'
import { AdminRouteModule } from './api/adminRoutes.js'
import { VaultShareRouteModule } from './api/vaultShareRoutes.js'
import { SessionStore, AuthService } from './auth/index.js'
import { createAuthMiddleware, createCsrfMiddleware, createRateLimitMiddleware, createMustChangePasswordMiddleware } from './auth/middleware.js'
import { RateLimiter } from './auth/ratelimit.js'
import { UserRepository, UserService, RoleService, ensureDefaultAdmin } from './user/index.js'
import { AuditLogger, AuditService } from './audit/index.js'
import { ConversationStore, MessageStore, ChatRateLimiter, ChatService, UnreadStore } from './chat/index.js'
import { ChatController, ChatRouteModule } from './api/chatRoutes.js'
import {
  CryptoService,
  SetupUriParser,
  SyncLock,
  SyncConfigStore,
  SyncLogStore,
  ConflictStore,
  CheckpointStore,
  SyncEngine,
  SyncScheduler,
  SyncService,
} from './sync/index.js'
import type { VaultPathResolver } from './sync/index.js'
import { createSyncRoutes } from './api/syncRoutes.js'
import { loadMcpConfig } from './mcp/config.js'
import { TokenStore } from './mcp/token-store.js'
import { McpTokenService } from './mcp/token-service.js'
import { McpRateLimiter } from './mcp/rate-limiter.js'
import { McpHandlers } from './mcp/handlers.js'
import { McpServerFactory } from './mcp/server-factory.js'
import { createMcpRoutes, createMcpHttpHandler } from './api/mcpRoutes.js'
import { createMcpTokenRoutes } from './api/mcpTokenRoutes.js'
import { createMcpWellKnownHandler } from './api/mcpWellKnownRoute.js'
import { LinkIndexService } from './link-index/index.js'
import { createGraphRoutes } from './api/graphRoutes.js'

// --- Composition Root ---

// 1. Config + Logger
const config = new ConfigService()
const logger = createLogger(config)
const serverConfig = config.getServerConfig()

// 1b. Server Log Store (file persistence for admin log viewer)
const serverLogStore = new ServerLogStore(serverConfig.dataDir)
logger.setLogStore(serverLogStore)

// 2. Data Layer: VaultReader, VaultManager, VaultRegistry, VaultShareRegistry
const vaultReader = new VaultReader()
const vaultManager = new VaultManager(vaultReader, logger, serverConfig.maxDirectoryDepth)
const vaultRegistry = new VaultRegistry(serverConfig.dataDir, logger)
const vaultShareRegistry = new VaultShareRegistry(serverConfig.dataDir)

// 2b. Data Layer: UserRepository, SessionStore, AuditLogger
const userRepository = new UserRepository(serverConfig.dataDir)
const sessionStore = new SessionStore(serverConfig.dataDir, logger)
const auditLogger = new AuditLogger(serverConfig.dataDir)

// 3. Business Layer: AuditService, AuthService, UserService, RoleService, VaultAccessControlService
const auditService = new AuditService(auditLogger)

const csrfSecret = process.env['SLATEBASE_CSRF_SECRET'] ?? crypto.randomBytes(32).toString('hex')
const authService = new AuthService(sessionStore, userRepository, logger, csrfSecret, auditService)

const checkVaultOwnership = async (userId: string): Promise<boolean> => {
  const entries = await vaultRegistry.load()
  return entries.some((e) => e.ownerId === userId)
}

// MCP config (loaded early to wire onUserInvalidated callback)
const mcpConfig = loadMcpConfig(config)

// Mutable reference for MCP token invalidation hook (set after MCP module init)
let mcpTokenInvalidator: ((userId: string) => Promise<void>) | undefined

const onUserInvalidated = async (userId: string): Promise<void> => {
  if (mcpTokenInvalidator !== undefined) {
    await mcpTokenInvalidator(userId)
  }
}

const userService = new UserService(userRepository, sessionStore, logger, checkVaultOwnership, auditService, onUserInvalidated)
const roleService = new RoleService(userRepository, sessionStore, logger, auditService)

const vaultAccessControl = new VaultAccessControlService(vaultRegistry, vaultShareRegistry, userRepository, logger, auditService)

// 3b. Chat Data Layer
const conversationStore = new ConversationStore(serverConfig.dataDir, logger)
const messageStore = new MessageStore(serverConfig.dataDir, logger)
const unreadStore = new UnreadStore(serverConfig.dataDir, logger)

// 3c. Chat Business Layer
const chatRateLimiter = new ChatRateLimiter()
const chatService = new ChatService(conversationStore, messageStore, unreadStore, userRepository, logger)

// 3d. Sync Module
const syncSecret = process.env['SLATEBASE_SYNC_SECRET']
let resolvedSyncSecret: string
if (syncSecret && syncSecret.length >= 32) {
  resolvedSyncSecret = syncSecret
} else {
  resolvedSyncSecret = crypto.randomBytes(32).toString('hex')
  logger.warn('SLATEBASE_SYNC_SECRET not set or too short — using random secret (sync credentials will not survive restarts)')
}

const cryptoService = new CryptoService(resolvedSyncSecret)
const setupUriParser = new SetupUriParser()
const syncLock = new SyncLock()
const syncConfigStore = new SyncConfigStore(serverConfig.dataDir, cryptoService, logger)
const syncLogStore = new SyncLogStore(serverConfig.dataDir, logger)
const conflictStore = new ConflictStore(serverConfig.dataDir, logger)
const checkpointStore = new CheckpointStore(serverConfig.dataDir, logger)
const syncEngine = new SyncEngine(cryptoService)
const syncScheduler = new SyncScheduler()

// 4. VaultService (extend existing vault setup with share registry and user repository)
const vaultService = new VaultService(vaultManager, vaultReader, config, logger, vaultRegistry, vaultShareRegistry, userRepository, auditService)
const importService = new ImportService(vaultManager, vaultReader, config, logger)

// 4b. SyncService (needs VaultPathResolver)
const vaultPathResolver: VaultPathResolver = (vaultId: string): string | null => {
  const entry = vaultRegistry.findById(vaultId)
  return entry ? entry.storagePath : null
}

const syncService = new SyncService(
  syncConfigStore,
  syncLogStore,
  conflictStore,
  checkpointStore,
  cryptoService,
  setupUriParser,
  syncEngine,
  syncScheduler,
  syncLock,
  logger,
  vaultPathResolver,
)

// 4c. MCP Module (conditional on config)
let mcpTokenService: McpTokenService | undefined
let mcpRoutes: ReturnType<typeof createMcpRoutes> | undefined
let mcpTokenRoutes: ReturnType<typeof createMcpTokenRoutes> | undefined
let mcpHttpHandler: ReturnType<typeof createMcpHttpHandler> = null

if (mcpConfig.enabled) {
  const tokenStore = new TokenStore(serverConfig.dataDir, logger)
  await tokenStore.loadIndex()

  mcpTokenService = new McpTokenService(tokenStore, mcpConfig, logger, auditService)
  const mcpRateLimiter = new McpRateLimiter(mcpConfig.rateLimit)

  const mcpHandlers = new McpHandlers({
    vaultService,
    vaultAccessControl,
    vaultReader,
    logger,
    mcpConfig,
  })

  // getUserId is set per-request by the transport layer via authInfo.extra.userId
  // Tool handlers use a mutable reference that gets updated per-request
  let currentUserId = ''
  const mcpServerFactory = new McpServerFactory({
    handlers: mcpHandlers,
    toolHandlerDeps: {
      vaultService,
      vaultAccessControl,
      logger,
      mcpConfig,
      getUserId: () => currentUserId,
    },
    logger,
  })

  mcpRoutes = createMcpRoutes({
    tokenService: mcpTokenService,
    rateLimiter: mcpRateLimiter,
    serverFactory: mcpServerFactory,
    mcpConfig,
    logger,
  })
  mcpHttpHandler = createMcpHttpHandler({
    tokenService: mcpTokenService,
    rateLimiter: mcpRateLimiter,
    serverFactory: mcpServerFactory,
    mcpConfig,
    logger,
    onAuthenticated: (userId: string) => { currentUserId = userId },
  })
  mcpTokenRoutes = createMcpTokenRoutes({ tokenService: mcpTokenService, logger })

  // Wire the MCP token invalidation hook
  mcpTokenInvalidator = async (userId: string) => {
    await mcpTokenService!.invalidateAllForUser(userId)
  }

  logger.info('MCP server initialized', { rateLimit: mcpConfig.rateLimit, maxTokensPerUser: mcpConfig.maxTokensPerUser })
} else {
  logger.info('MCP server disabled')
}

// 4d. Link Index Module (per-vault instances)
const linkIndexMap = new Map<string, LinkIndexService>()

/**
 * Returns the LinkIndexService instance for a given vault, or undefined if not found.
 */
function getLinkIndex(vaultId: string): LinkIndexService | undefined {
  return linkIndexMap.get(vaultId)
}

// 5. Controllers
const vaultController = new VaultController(vaultService, logger, importService, userRepository, vaultAccessControl, syncConfigStore, vaultShareRegistry)
const authController = new AuthController(authService, logger)
const userController = new UserController(userService, logger)
const chatController = new ChatController(chatService, chatRateLimiter, logger, userRepository)

// 6. Route Modules
const routeModules = [
  new VaultRouteModule(vaultController),
  new AuthRouteModule(authController),
  new UserRouteModule(userController),
  new AdminRouteModule({
    userService,
    roleService,
    authService,
    auditService,
    configService: config,
    logger,
    serverLogStore,
  }),
  new VaultShareRouteModule(vaultAccessControl, vaultService, vaultRegistry, logger, vaultShareRegistry, userRepository),
  new ChatRouteModule(chatController),
  createSyncRoutes({ syncService, vaultRegistry, logger }),
  createGraphRoutes({ getLinkIndex, accessControl: vaultAccessControl, vaultRegistry, vaultReader, logger }),
]
const router = createRouter(routeModules)

// --- Hono App ---

const app = new Hono()

// CORS middleware
app.use(
  '*',
  cors({
    origin: serverConfig.allowedOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  }),
)

// Auth middleware (skips login endpoint internally)
const rateLimiter = new RateLimiter()
app.use('/api/v1/*', createAuthMiddleware(authService))
app.use('/api/v1/*', createCsrfMiddleware(authService))
app.use('/api/v1/*', createRateLimitMiddleware(rateLimiter))
app.use('/api/v1/*', createMustChangePasswordMiddleware(userRepository))

// Global error handler — catches unhandled exceptions and returns proper JSON
app.onError((err, c) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  })
  return c.json({ code: 'INTERNAL_ERROR', message: 'Internal server error', timestamp: new Date().toISOString() }, 500)
})

// Route registration
app.route('/api/v1', router)

// MCP route registration (after main routes, before server start)
// Token routes use session auth (registered under /api/v1/mcp/tokens — session middleware applies)
// MCP transport routes are handled OUTSIDE Hono to avoid double-response issues
// .well-known/mcp.json is public (no auth)
if (mcpConfig.enabled && mcpRoutes !== undefined && mcpTokenRoutes !== undefined) {
  app.route('/api/v1/mcp/tokens', mcpTokenRoutes)
}
app.get('/.well-known/mcp.json', createMcpWellKnownHandler(mcpConfig))

// --- Initialize & Start Server ---

// Load session index from filesystem
await sessionStore.loadIndex()

// Load conversation index from filesystem
await conversationStore.loadIndex()

// Load unread index from filesystem
await unreadStore.loadIndex()

// Ensure default admin account exists
await ensureDefaultAdmin(userRepository, logger)

// Initialize vaults
await vaultService.initializeVaults()

// Initialize link indexes for all vaults (load from disk or rebuild)
const vaultEntries = await vaultRegistry.load()
for (const entry of vaultEntries) {
  const linkIndex = new LinkIndexService(entry.storagePath, entry.id, logger)
  linkIndexMap.set(entry.id, linkIndex)
  // Fire-and-forget: load index in background (don't block server startup)
  linkIndex.loadFromDisk().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Failed to initialize link index', { vaultId: entry.id, error: message })
  })
}

// Set up link index hook on VaultController for incremental updates
vaultController.setLinkIndexHook({
  onFileSaved(vaultId: string, filePath: string, content: string): void {
    let linkIndex = getLinkIndex(vaultId)
    // Create link index on-demand for newly created vaults
    if (!linkIndex) {
      const entry = vaultRegistry.findById(vaultId)
      if (entry) {
        linkIndex = new LinkIndexService(entry.storagePath, entry.id, logger)
        linkIndexMap.set(entry.id, linkIndex)
      }
    }
    if (linkIndex) {
      linkIndex.updateFile(filePath, content).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        logger.error('Link index updateFile failed', { vaultId, filePath, error: message })
      })
    }
  },
  onFileDeleted(vaultId: string, filePath: string): void {
    const linkIndex = getLinkIndex(vaultId)
    if (linkIndex) {
      linkIndex.removeFile(filePath).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        logger.error('Link index removeFile failed', { vaultId, filePath, error: message })
      })
    }
  },
  onFileRenamed(vaultId: string, oldPath: string, newPath: string): void {
    const linkIndex = getLinkIndex(vaultId)
    if (linkIndex) {
      // Read the file content at the new path, then update the index
      const entry = vaultRegistry.findById(vaultId)
      if (entry) {
        const absolutePath = path.join(entry.storagePath, newPath)
        fs.readFile(absolutePath, 'utf-8')
          .then((content) => linkIndex.renameFile(oldPath, newPath, content))
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            logger.error('Link index renameFile failed', { vaultId, oldPath, newPath, error: message })
          })
      }
    }
  },
})

// Initialize sync schedulers
try {
  await syncService.initializeSchedulers()
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  logger.error('Failed to initialize sync schedulers', { error: message })
}

// Create the Hono request listener for non-MCP requests
const honoListener = getRequestListener(app.fetch)

// Create HTTP server with MCP interception
const server = createHttpServer(async (req, res) => {
  // Intercept MCP transport requests — handle directly to avoid Hono double-response
  if (req.url === '/api/v1/mcp' && mcpHttpHandler !== null) {
    await mcpHttpHandler(req, res)
    return
  }

  // All other requests go through Hono
  await honoListener(req, res)
})

server.listen(serverConfig.port, serverConfig.host, () => {
  logger.info('Server started', { host: serverConfig.host, port: serverConfig.port })
})
