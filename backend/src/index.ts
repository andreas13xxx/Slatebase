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
import { CsrfSecretManager } from './auth/csrf-secret.js'
import { createAuthMiddleware, createCsrfMiddleware, createRateLimitMiddleware, createMustChangePasswordMiddleware } from './auth/middleware.js'
import { createClientIpMiddleware } from './api/client-ip.js'
import { createRequestIdMiddleware } from './api/request-id.js'
import { RateLimiter } from './auth/ratelimit.js'
import { SseTicketStore } from './auth/sse-ticket-store.js'
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
  SyncProtocolStore,
  ConflictStore,
  CheckpointStore,
  SyncEngine,
  SyncScheduler,
  SyncService,
  AutoResolutionConfigStore,
  ConflictResolver,
  AutoResolutionEngine,
} from './sync/index.js'
import type { VaultPathResolver } from './sync/index.js'
import { createSyncRoutes } from './api/syncRoutes.js'
import { FeatureRegistry, FeatureToggleService, FeatureToggleStore, createFeatureGuard } from './feature-toggle/index.js'
import { createAdminFeatureRoutes, createPublicFeatureRoutes } from './api/featureRoutes.js'
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
import { PluginStore, PluginInstaller } from './plugin/index.js'
import { createPluginRoutes } from './api/pluginRoutes.js'
import { versionRoutes } from './api/versionRoutes.js'
import { SearchService, ReplaceService } from './search/index.js'
import { EventReplayBuffer, RateLimiter as SseRateLimiter, ConnectionManager, PresenceService, EventBus, ConnectionLimitError } from './realtime/index.js'
import type { SseEvent } from './realtime/index.js'
import { createSseRoutes } from './api/sseRoutes.js'
import { createSearchRoutes } from './api/searchRoutes.js'
import { createUploadRoutes } from './api/uploadRoutes.js'
import { createTemplateRoutes } from './api/templateRoutes.js'
import { createStatisticsRoutes } from './api/statisticsRoutes.js'
import { VaultStatisticsService } from './statistics/index.js'
import { TemplateService } from './template/index.js'
import { VersionService } from './version/index.js'
import { createFileVersionRoutes } from './api/fileVersionRoutes.js'
import { TrashService } from './trash/index.js'
import { createTrashRoutes } from './api/trashRoutes.js'
import { CleanupJob } from './cleanup/index.js'
import { PreferencesStore } from './preferences/index.js'
import { createPreferencesRoutes } from './api/preferencesRoutes.js'
import { VaultConfigStore } from './vault-config/index.js'
import { createVaultConfigRoutes } from './api/vaultConfigRoutes.js'
import { WelcomeVaultService } from './welcome-vault/index.js'

// --- Composition Root ---

// 1. Config + Logger
const config = new ConfigService()
const logger = createLogger(config)
const serverConfig = config.getServerConfig()

// 1b. Server Log Store (file persistence for admin log viewer)
const serverLogStore = new ServerLogStore(serverConfig.dataDir)
logger.setLogStore(serverLogStore)

// 1c. Feature Toggle System
const featureRegistry = new FeatureRegistry()
featureRegistry.register({ name: 'vault-sync', description: 'CouchDB-basierte Vault-Synchronisation', defaultEnabled: false, type: 'hot' })
featureRegistry.register({ name: 'obsidian-plugin-compat', description: 'Obsidian Community Plugin Compatibility Layer', defaultEnabled: false, type: 'cold' })
featureRegistry.register({ name: 'chat', description: 'Echtzeit-Chat zwischen Benutzern', defaultEnabled: true, type: 'hot' })
featureRegistry.register({ name: 'mcp', description: 'AI Context Server (MCP Integration)', defaultEnabled: true, type: 'cold' })
featureRegistry.register({ name: 'knowledge-graph', description: 'Interaktive Vault-Verlinkungsvisualisierung', defaultEnabled: true, type: 'hot' })
featureRegistry.register({ name: 'welcome-vault', description: 'Automatischer Welcome-Vault für neue Benutzer', defaultEnabled: true, type: 'hot' })

const featureToggleStore = new FeatureToggleStore(serverConfig.dataDir, logger)
const persistedFeatureState = await featureToggleStore.load()

const featureToggleService = new FeatureToggleService(featureRegistry, config.getFeaturesConfig(), persistedFeatureState)
featureToggleService.setPersistCallback(async (toggles) => {
  await featureToggleStore.save(toggles)
})

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

const csrfSecretManager = new CsrfSecretManager(serverConfig.dataDir, logger)
const csrfSecret = await csrfSecretManager.loadOrCreate()
const sessionDurationMs = serverConfig.sessionDurationHours * 60 * 60 * 1000
const maxLifetimeMs = serverConfig.sessionMaxLifetimeDays * 24 * 60 * 60 * 1000
const authService = new AuthService(sessionStore, userRepository, logger, csrfSecret, auditService, sessionDurationMs, maxLifetimeMs)

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

// Mutable reference for welcome vault hook (set after VaultService init)
// eslint-disable-next-line prefer-const
let welcomeVaultCreator: ((userId: string, language: 'de' | 'en') => Promise<void>) | undefined

const onUserCreated = async (userId: string, language: 'de' | 'en'): Promise<void> => {
  if (welcomeVaultCreator !== undefined) {
    await welcomeVaultCreator(userId, language)
  }
}

const userService = new UserService(userRepository, sessionStore, logger, checkVaultOwnership, auditService, onUserInvalidated, onUserCreated)
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
const syncProtocolStore = new SyncProtocolStore(serverConfig.dataDir, logger)
const conflictStore = new ConflictStore(serverConfig.dataDir, logger)
const checkpointStore = new CheckpointStore(serverConfig.dataDir, logger)
const syncEngine = new SyncEngine(cryptoService)
const syncScheduler = new SyncScheduler()

// Conflict resolution modules
const autoResolutionConfigStore = new AutoResolutionConfigStore(serverConfig.dataDir, logger)
const conflictResolver = new ConflictResolver({ conflictStore, syncLock, cryptoService, logger })
const autoResolutionEngine = new AutoResolutionEngine()

// 4. VaultService (extend existing vault setup with share registry and user repository)
const vaultPathResolver: VaultPathResolver = (vaultId: string): string | null => {
  const entry = vaultRegistry.findById(vaultId)
  return entry ? entry.storagePath : null
}

// Create version and trash services before VaultService (it uses them during file saves)
const versionService = new VersionService(vaultPathResolver, config.getVersionsConfig().maxPerFile, logger)
const trashService = new TrashService(
  (vaultId: string) => {
    const entry = vaultRegistry.findById(vaultId)
    if (!entry) throw new Error(`Vault not found: ${vaultId}`)
    return entry.storagePath
  },
  logger,
)

const vaultService = new VaultService(vaultManager, vaultReader, config, logger, vaultRegistry, vaultShareRegistry, userRepository, auditService, trashService, versionService)
const importService = new ImportService(vaultManager, vaultReader, config, logger)

// 4a. Welcome Vault Service (wires onUserCreated callback)
const welcomeVaultService = new WelcomeVaultService(
  vaultService,
  featureToggleService,
  config.getWelcomeVaultConfig(),
  logger,
  serverConfig.dataDir,
)
welcomeVaultCreator = async (userId: string, language: 'de' | 'en'): Promise<void> => {
  const result = await welcomeVaultService.createWelcomeVault(userId, language)
  // After welcome vault creation: initialize link index so Knowledge Graph is available
  if (result) {
    const linkIndex = new LinkIndexService(result.storagePath, result.vaultId, result.vaultName, logger)
    linkIndexMap.set(result.vaultId, linkIndex)
    linkIndex.rebuild().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Failed to build link index for welcome vault', { vaultId: result.vaultId, error: message })
    })
  }
}

// 4b. SyncService (needs VaultPathResolver)
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
  syncProtocolStore,
  {
    conflictResolver,
    autoResolutionEngine,
    autoResolutionConfigStore,
    vaultOwnerResolver: (vaultId: string) => vaultRegistry.findById(vaultId)?.ownerId,
  },
)

// 4c. MCP Module (conditional on config)
let mcpTokenService: McpTokenService | undefined
let mcpRoutes: ReturnType<typeof createMcpRoutes> | undefined
let mcpTokenRoutes: ReturnType<typeof createMcpTokenRoutes> | undefined
let mcpHttpHandler: ReturnType<typeof createMcpHttpHandler> = null

if (featureToggleService.isEnabled('mcp')) {
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

// 4e. Plugin Module
const pluginStore = new PluginStore(serverConfig.dataDir)
const pluginInstaller = new PluginInstaller(pluginStore)

// 4f. Search Module
const searchService = new SearchService(vaultService, vaultAccessControl, logger)
const replaceService = new ReplaceService(vaultService, vaultAccessControl, logger)

// 4g. Realtime Services (SSE)
const sseConfig = config.getSseConfig()
const replayBuffer = new EventReplayBuffer({ bufferSize: sseConfig.replayBufferSize, ttlMs: sseConfig.replayTtl })
const sseRateLimiter = new SseRateLimiter({ maxPerSecond: 10 })
const realtimeConnectionManager = new ConnectionManager(
  { maxConnections: sseConfig.maxConnections, maxPerUser: sseConfig.maxPerUser, heartbeatInterval: sseConfig.heartbeatInterval },
  logger,
)

const presenceService = new PresenceService({
  logger,
  gracePeriodMs: 60000,
  conversationAccessor: {
    async getUsersWithSharedConversations(userId: string): Promise<string[]> {
      const conversations = await conversationStore.findByParticipant(userId)
      const userIds = new Set<string>()
      for (const conv of conversations) {
        if (conv.archived) continue
        for (const participantId of conv.participants) {
          if (participantId !== userId) {
            userIds.add(participantId)
          }
        }
      }
      return Array.from(userIds)
    },
    async getUsername(userId: string): Promise<string | undefined> {
      const user = await userRepository.findById(userId)
      if (!user) return undefined
      return user.displayName || user.username
    },
  },
})
const eventBus = new EventBus({
  connectionManager: realtimeConnectionManager,
  replayBuffer,
  rateLimiter: sseRateLimiter,
  logger,
  batchWindow: sseConfig.batchWindow,
  batchMax: sseConfig.batchMax,
})

// Wire ConnectionManager callbacks to PresenceService
realtimeConnectionManager.onUserConnected((userId) => presenceService.markOnline(userId))
realtimeConnectionManager.onUserDisconnected((userId) => presenceService.startGracePeriod(userId))

// Publish presence:update events on status changes
presenceService.onStatusChange((userId, status) => {
  eventBus.publish({
    type: 'presence:update',
    payload: { userId, status },
    target: { kind: 'broadcast' },
    excludeUserId: userId,
  })
})

// Start heartbeat
realtimeConnectionManager.startHeartbeat()

// Wire EventBus to ChatService for realtime message/unread push
chatService.setEventBus(eventBus)

/**
 * Returns the LinkIndexService instance for a given vault, or undefined if not found.
 */
function getLinkIndex(vaultId: string): LinkIndexService | undefined {
  return linkIndexMap.get(vaultId)
}

// 5. Controllers
const sseTicketStore = new SseTicketStore()
const vaultController = new VaultController(vaultService, logger, importService, userRepository, vaultAccessControl, syncConfigStore, vaultShareRegistry)
const authController = new AuthController(authService, logger, sseTicketStore)
const userController = new UserController(userService, logger)
const chatController = new ChatController(chatService, chatRateLimiter, logger, userRepository)

// Wire EventBus to VaultController for vault:change events
vaultController.setEventBus(eventBus)

// Wire EventBus to SyncService for sync:conflict events
syncService.setEventBus(eventBus)

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
  createGraphRoutes({ getLinkIndex, accessControl: vaultAccessControl, vaultRegistry, logger }),
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
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
  }),
)

// Auth middleware (skips login endpoint internally)
const rateLimiter = new RateLimiter()
const authMiddleware = createAuthMiddleware(authService)
app.use('*', createRequestIdMiddleware())
app.use('*', createClientIpMiddleware({ trustedProxies: serverConfig.trustedProxies }))
app.use('/api/v1/*', authMiddleware)
app.use('/api/v1/*', createCsrfMiddleware(authService))
app.use('/api/v1/*', createRateLimitMiddleware(rateLimiter))
app.use('/api/v1/*', createMustChangePasswordMiddleware(userRepository))

// Global error handler — catches unhandled exceptions and returns proper JSON
app.onError((err, c) => {
  const requestId = c.res.headers.get('X-Request-Id') ?? undefined
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
    requestId,
  })
  return c.json({ code: 'INTERNAL_ERROR', message: 'Internal server error', timestamp: new Date().toISOString() }, 500)
})

// Feature guards for route protection
app.use('/api/v1/chat/*', createFeatureGuard('chat', featureToggleService))
app.use('/api/v1/vaults/:vaultId/sync/*', createFeatureGuard('vault-sync', featureToggleService))
app.use('/api/v1/vaults/:vaultId/graph', createFeatureGuard('knowledge-graph', featureToggleService))
app.use('/api/v1/vaults/:vaultId/backlinks', createFeatureGuard('knowledge-graph', featureToggleService))
app.use('/api/v1/vaults/:vaultId/plugins/*', createFeatureGuard('obsidian-plugin-compat', featureToggleService))
app.use('/api/v1/vaults/:vaultId/plugins', createFeatureGuard('obsidian-plugin-compat', featureToggleService))
app.use('/api/v1/mcp/tokens', createFeatureGuard('mcp', featureToggleService))
app.use('/api/v1/mcp/tokens/*', createFeatureGuard('mcp', featureToggleService))

// Route registration
app.route('/api/v1', router)

// Feature toggle routes (admin + public)
const adminFeatureApp = createAdminFeatureRoutes({ featureToggleService, auditService })
app.route('/api/v1/admin', adminFeatureApp)

const publicFeatureApp = createPublicFeatureRoutes({ featureToggleService })
app.route('/api/v1', publicFeatureApp)

// MCP route registration (after main routes, before server start)
// Token routes use session auth (registered under /api/v1/mcp/tokens — session middleware applies)
// MCP transport routes are handled OUTSIDE Hono to avoid double-response issues
// .well-known/mcp.json is public (no auth)
if (featureToggleService.isEnabled('mcp') && mcpRoutes !== undefined && mcpTokenRoutes !== undefined) {
  app.route('/api/v1/mcp/tokens', mcpTokenRoutes)
}
app.get('/.well-known/mcp.json', createMcpWellKnownHandler(featureToggleService))
app.route('', versionRoutes)

// Plugin route registration (auth middleware applies via /api/v1/* pattern)
const pluginRoutes = createPluginRoutes({
  pluginStore,
  pluginInstaller,
  accessControl: vaultAccessControl,
  vaultRegistry,
  logger,
})
app.route('/api/v1/vaults/:vaultId/plugins', pluginRoutes)

// Search route registration (auth middleware applies via /api/v1/* pattern)
const searchRoutes = createSearchRoutes({ searchService, replaceService, vaultAccessControl, logger })
app.route('/api/v1', searchRoutes)

// Upload route registration (auth middleware applies via /api/v1/* pattern)
const uploadRoutes = createUploadRoutes({
  accessControl: vaultAccessControl,
  vaultRegistry,
  uploadConfig: config.getUploadConfig(),
  eventBus,
  logger,
})
app.route('/api/v1', uploadRoutes)

// Template route registration (auth middleware applies via /api/v1/* pattern)
const templatesConfig = config.getTemplatesConfig()
const vaultConfigStore = new VaultConfigStore(
  (vaultId: string) => vaultRegistry.findById(vaultId)?.storagePath ?? null,
  templatesConfig.directory,
  logger,
)
const templateService = new TemplateService(templatesConfig.directory, vaultManager, logger, vaultConfigStore)
const templateRoutes = createTemplateRoutes({
  templateService,
  accessControl: vaultAccessControl,
  vaultRegistry,
  eventBus,
  logger,
})
app.route('/api/v1', templateRoutes)

// Statistics route registration (auth middleware applies via /api/v1/* pattern)
const statisticsService = new VaultStatisticsService(
  (vaultId: string) => vaultRegistry.findById(vaultId)?.storagePath,
  logger,
)
const statisticsRoutes = createStatisticsRoutes({
  accessControl: vaultAccessControl,
  vaultRegistry,
  statisticsService,
  logger,
})
app.route('/api/v1', statisticsRoutes)

// File version route registration (auth middleware applies via /api/v1/* pattern)
const fileVersionRoutes = createFileVersionRoutes({
  versionService,
  accessControl: vaultAccessControl,
  vaultRegistry,
  eventBus,
  logger,
})
app.route('/api/v1', fileVersionRoutes)

// Trash routes registration (auth middleware applies via /api/v1/* pattern)
const trashRoutes = createTrashRoutes({
  trashService,
  accessControl: vaultAccessControl,
  vaultRegistry,
  eventBus,
  logger,
})
app.route('/api/v1', trashRoutes)

// Preferences route registration (auth middleware applies via /api/v1/* pattern)
const preferencesStore = new PreferencesStore(serverConfig.dataDir, logger)
const preferencesRoutes = createPreferencesRoutes({ preferencesService: preferencesStore, logger })
app.route('/api/v1', preferencesRoutes)

// Vault config route registration (auth middleware applies via /api/v1/* pattern)
const vaultConfigRoutes = createVaultConfigRoutes({
  vaultConfigService: vaultConfigStore,
  accessControl: vaultAccessControl,
  vaultRegistry,
  logger,
})
app.route('/api/v1', vaultConfigRoutes)

// CleanupJob — periodic trash purge and version pruning
const cleanupJob = new CleanupJob(trashService, versionService, vaultManager, config, logger)

// SSE route registration (realtime events endpoint)
const sseRoutes = createSseRoutes({
  connectionManager: realtimeConnectionManager,
  eventBus,
  presenceService,
  authMiddleware,
  sseTicketStore,
  logger,
})
app.route('/api/v1', sseRoutes)

// Wire vault:change events → statistics cache invalidation via subscriber
eventBus.subscribe('vault:change', (options) => {
  if (options.payload['vaultId']) {
    statisticsService.invalidateCache(options.payload['vaultId'] as string)
  }
})

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
  const linkIndex = new LinkIndexService(entry.storagePath, entry.id, entry.name, logger)
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
        linkIndex = new LinkIndexService(entry.storagePath, entry.id, entry.name, logger)
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

// Set up vault deletion hook for resource cleanup (plugin data, link index)
vaultController.setVaultDeletionHook({
  onVaultDeleted(vaultId: string): void {
    // Clean up plugin data for the deleted vault (fire-and-forget)
    pluginStore.deleteAllForVault(vaultId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Plugin cleanup failed after vault deletion', { vaultId, error: message })
    })

    // Clean up link index for the deleted vault
    linkIndexMap.delete(vaultId)
  },
})

// Initialize sync schedulers (only if vault-sync feature is enabled)
if (featureToggleService.isEnabled('vault-sync')) {
  try {
    await syncService.initializeSchedulers()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Failed to initialize sync schedulers', { error: message })
  }
} else {
  logger.info('Vault-sync feature disabled — skipping scheduler initialization')
}

// Register feature toggle listener for vault-sync scheduler control
featureToggleService.onChange((featureName: string, enabled: boolean) => {
  if (featureName !== 'vault-sync') return

  if (!enabled) {
    // Deactivated: stop the scheduler (no new cycles; running cycles finish naturally)
    syncScheduler.stopAll()
    logger.info('Vault-sync disabled — scheduler stopped')
  } else {
    // Activated: restart schedulers from stored config
    syncService.initializeSchedulers().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Failed to restart sync schedulers after toggle activation', { error: message })
    })
    logger.info('Vault-sync enabled — scheduler restarted')
  }
})

// Set up sync-to-link-index hook: rebuild link index after successful pull
syncService.setOnPullComplete((vaultId: string) => {
  const linkIndex = getLinkIndex(vaultId)
  if (linkIndex) {
    // Fire-and-forget: rebuild in background (don't block sync response)
    linkIndex.rebuild().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Link index rebuild after sync failed', { vaultId, error: message })
    })
  }
})

// Create the Hono request listener for non-MCP requests
const honoListener = getRequestListener(app.fetch)

// Create HTTP server with MCP and SSE interception
const server = createHttpServer(async (req, res) => {
  // Intercept MCP transport requests — handle directly to avoid Hono double-response
  if (req.url === '/api/v1/mcp' && mcpHttpHandler !== null) {
    await mcpHttpHandler(req, res)
    return
  }

  // Intercept SSE events endpoint — handle directly to avoid Hono ERR_HTTP_HEADERS_SENT
  // (Hono's response handler tries to write headers after nodeRes.writeHead() in the SSE route)
  const parsedUrl = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
  if (parsedUrl.pathname === '/api/v1/events' && req.method === 'GET') {
    // Authenticate: ticket-based (preferred) or token-based (legacy fallback)
    let userId: string | undefined

    const ticket = parsedUrl.searchParams.get('ticket')
    if (ticket) {
      const result = sseTicketStore.redeem(ticket)
      if (!result.valid || !result.userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'INVALID_TICKET', message: 'SSE ticket is invalid or expired', timestamp: new Date().toISOString() }))
        return
      }
      userId = result.userId
    } else {
      // Fallback: token query param or Authorization header
      const token = parsedUrl.searchParams.get('token') ?? undefined
      const authHeader = req.headers['authorization']
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
      const sessionToken = token ?? bearerToken

      if (!sessionToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Missing authentication', timestamp: new Date().toISOString() }))
        return
      }

      const session = await authService.validateSession(sessionToken)
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Invalid or expired token', timestamp: new Date().toISOString() }))
        return
      }
      userId = session.userId
    }

    const lastEventId = req.headers['last-event-id'] as string | undefined

    // Register connection
    let connectionId: string
    try {
      connectionId = realtimeConnectionManager.register(userId, res, lastEventId)
    } catch (error) {
      if (error instanceof ConnectionLimitError) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '30' })
        res.end(JSON.stringify({ code: error.code, message: error.message, timestamp: new Date().toISOString() }))
        return
      }
      throw error
    }

    logger.info('SSE connection established', { connectionId, userId })

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    // Send presence:init
    try {
      const visibleUsers = await presenceService.getVisibleOnlineUsers(userId)
      const initEvent: SseEvent = {
        type: 'presence:init',
        id: eventBus.nextEventId(),
        data: { type: 'presence:init', payload: { onlineUsers: visibleUsers }, timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      }
      const json = JSON.stringify(initEvent.data)
      res.write(`event: ${initEvent.type}\nid: ${initEvent.id}\ndata: ${json}\n\n`)
    } catch (err) {
      logger.error('Failed to send presence:init', { connectionId, userId, error: String(err) })
    }

    // Replay missed events
    if (lastEventId) {
      try {
        const missedEvents = eventBus.getEventsSince(userId, lastEventId)
        for (const event of missedEvents) {
          const json = JSON.stringify(event.data)
          res.write(`event: ${event.type}\nid: ${event.id}\ndata: ${json}\n\n`)
        }
      } catch (err) {
        logger.error('Failed to replay events', { connectionId, userId, error: String(err) })
      }
    }

    // Cleanup on disconnect
    res.on('close', () => {
      logger.debug('SSE connection closed', { connectionId, userId })
      realtimeConnectionManager.remove(connectionId)
    })

    // Do NOT call res.end() — connection stays open
    return
  }

  // All other requests go through Hono
  await honoListener(req, res)
})

server.listen(serverConfig.port, serverConfig.host, () => {
  logger.info('Server started', { host: serverConfig.host, port: serverConfig.port })

  // Start periodic cleanup job (trash purge + version pruning)
  cleanupJob.start()
})

// --- Graceful Shutdown ---

const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info('Received shutdown signal', { signal })

  // Stop periodic cleanup job
  cleanupJob.stop()

  // Shutdown realtime connections (sends server:shutdown event, closes all streams)
  await realtimeConnectionManager.shutdown()

  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => { gracefulShutdown('SIGTERM').catch(() => process.exit(1)) })
process.on('SIGINT', () => { gracefulShutdown('SIGINT').catch(() => process.exit(1)) })
