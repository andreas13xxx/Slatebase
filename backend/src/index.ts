// Slatebase Backend — Composition Root
// Start with: node --experimental-strip-types --env-file=.env src/index.ts (Node.js 22+)
// Or dev mode: tsx watch --env-file=.env src/index.ts

import crypto from 'node:crypto'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'

import { ConfigService } from './config/index.js'
import { createLogger } from './logger/index.js'
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

// --- Composition Root ---

// 1. Config + Logger
const config = new ConfigService()
const logger = createLogger(config)
const serverConfig = config.getServerConfig()

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
const userService = new UserService(userRepository, sessionStore, logger, checkVaultOwnership, auditService)
const roleService = new RoleService(userRepository, sessionStore, logger, auditService)

const vaultAccessControl = new VaultAccessControlService(vaultRegistry, vaultShareRegistry, userRepository, logger, auditService)

// 4. VaultService (extend existing vault setup with share registry and user repository)
const vaultService = new VaultService(vaultManager, vaultReader, config, logger, vaultRegistry, vaultShareRegistry, userRepository, auditService)
const importService = new ImportService(vaultManager, vaultReader, config, logger)

// 5. Controllers
const vaultController = new VaultController(vaultService, logger, importService, userRepository, vaultAccessControl)
const authController = new AuthController(authService, logger)
const userController = new UserController(userService, logger)

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
  }),
  new VaultShareRouteModule(vaultAccessControl, vaultService, vaultRegistry, logger, vaultShareRegistry, userRepository),
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

// Route registration
app.route('/api/v1', router)

// --- Initialize & Start Server ---

// Load session index from filesystem
await sessionStore.loadIndex()

// Ensure default admin account exists
await ensureDefaultAdmin(userRepository, logger)

// Initialize vaults
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
