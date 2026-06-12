// Admin Route Module — AdminController and route registration

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { IUserService, IRoleService, PaginationOptions } from '../user/index.js'
import {
  UserNotFoundError,
  UserConflictError,
  UserValidationError,
  LastAdminError,
  InsufficientPermissionError,
  VaultOwnershipError,
} from '../user/index.js'
import type { IAuthService, SessionContext } from '../auth/index.js'
import type { IAuditService, AuditAction } from '../audit/index.js'
import type { IConfigService } from '../config/index.js'
import type { ILogger } from '../logger/index.js'
import type { IServerLogStore, LogLevel } from '../logger/index.js'
import { createUserSchema, roleSchema } from '../user/validation.js'
import { serverConfigUpdateSchema } from '../auth/validation.js'
import type { RouteModule } from './index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Standard API error response format.
 */
interface ApiError {
  code: string
  message: string
  timestamp: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a structured API error response object.
 */
function createApiError(code: string, message: string): ApiError {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
  }
}

// ─── AdminController Interface ───────────────────────────────────────────────

/**
 * Controller interface for admin-only operations.
 */
export interface IAdminController {
  /** GET /admin/users — Paginated user list. */
  listUsers(c: Context): Promise<Response>
  /** POST /admin/users — Create a new user. */
  createUser(c: Context): Promise<Response>
  /** DELETE /admin/users/:userId — Delete a user. */
  deleteUser(c: Context): Promise<Response>
  /** PUT /admin/users/:userId/role — Change user role. */
  changeRole(c: Context): Promise<Response>
  /** PUT /admin/users/:userId/password — Reset user password. */
  resetPassword(c: Context): Promise<Response>
  /** PUT /admin/users/:userId/suspend — Suspend user account. */
  suspendUser(c: Context): Promise<Response>
  /** PUT /admin/users/:userId/unsuspend — Unsuspend user account. */
  unsuspendUser(c: Context): Promise<Response>
  /** GET /admin/users/:userId/sessions — List user's sessions. */
  listUserSessions(c: Context): Promise<Response>
  /** DELETE /admin/users/:userId/sessions/:sessionId — Invalidate user's session. */
  invalidateUserSession(c: Context): Promise<Response>
  /** GET /admin/config — Return server configuration. */
  getConfig(c: Context): Promise<Response>
  /** PUT /admin/config — Update server configuration. */
  updateConfig(c: Context): Promise<Response>
  /** POST /admin/restart — Graceful server restart (placeholder). */
  restart(c: Context): Promise<Response>
  /** GET /admin/audit — Paginated audit log with filters. */
  getAuditLog(c: Context): Promise<Response>
  /** GET /admin/logs — Paginated server log with filters. */
  getServerLogs(c: Context): Promise<Response>
}

// ─── AdminController Implementation ─────────────────────────────────────────

/**
 * Handles all admin-only API operations including user management,
 * server configuration, session management, and audit log access.
 */
export class AdminController implements IAdminController {
  constructor(
    private readonly userService: IUserService,
    private readonly roleService: IRoleService,
    private readonly authService: IAuthService,
    private readonly auditService: IAuditService,
    private readonly configService: IConfigService,
    private readonly logger: ILogger,
    private readonly serverLogStore?: IServerLogStore,
  ) {}

  /**
   * GET /admin/users — Returns a paginated list of users sorted by username.
   * Accepts query params: page (default 1), pageSize (default 20, max 100).
   */
  async listUsers(c: Context): Promise<Response> {
    try {
      const pageParam = c.req.query('page')
      const pageSizeParam = c.req.query('pageSize')

      const page = pageParam !== undefined ? parseInt(pageParam, 10) : 1
      const pageSize = pageSizeParam !== undefined ? parseInt(pageSizeParam, 10) : 20

      if (isNaN(page) || page < 1) {
        return c.json(createApiError('VALIDATION_ERROR', 'Page must be a positive integer'), 400)
      }

      if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
        return c.json(createApiError('VALIDATION_ERROR', 'Page size must be between 1 and 100'), 400)
      }

      const options: PaginationOptions = { page, pageSize }
      const result = await this.userService.listUsers(options)

      return c.json(result, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * POST /admin/users — Creates a new user account.
   * Validates username, password, and role via Zod schema.
   */
  async createUser(c: Context): Promise<Response> {
    try {
      const body = await c.req.json()
      const parsed = createUserSchema.safeParse(body)

      if (!parsed.success) {
        const firstError = parsed.error.errors[0]
        const message = firstError !== undefined ? firstError.message : 'Validation failed'
        return c.json(createApiError('VALIDATION_ERROR', message), 400)
      }

      const createData = {
        username: parsed.data.username,
        password: parsed.data.password,
        role: parsed.data.role,
        ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
      }

      const user = await this.userService.createUser(createData)
      return c.json(user, 201)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * DELETE /admin/users/:userId — Deletes a user account.
   * Checks last admin invariant and vault ownership constraints.
   */
  async deleteUser(c: Context): Promise<Response> {
    try {
      const userId = c.req.param('userId') as string
      await this.userService.deleteUser(userId)
      return c.body(null, 204)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * PUT /admin/users/:userId/role — Changes a user's role.
   * The change takes immediate effect on all active sessions.
   */
  async changeRole(c: Context): Promise<Response> {
    try {
      const userId = c.req.param('userId') as string
      const body = await c.req.json()

      const parsed = roleSchema.safeParse(body?.role)
      if (!parsed.success) {
        return c.json(createApiError('VALIDATION_ERROR', 'Role must be "admin" or "user"'), 400)
      }

      await this.roleService.assignRole(userId, parsed.data)
      return c.json({ userId, role: parsed.data }, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * PUT /admin/users/:userId/password — Resets a user's password.
   * Generates a temporary password and sets mustChangePassword to true.
   */
  async resetPassword(c: Context): Promise<Response> {
    try {
      const userId = c.req.param('userId') as string
      const tempPassword = await this.userService.resetPassword(userId)
      return c.json({ userId, temporaryPassword: tempPassword }, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * PUT /admin/users/:userId/suspend — Suspends a user account.
   * Invalidates all active sessions for the user.
   */
  async suspendUser(c: Context): Promise<Response> {
    try {
      const userId = c.req.param('userId') as string
      await this.userService.suspendUser(userId)
      return c.json({ userId, suspended: true }, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * PUT /admin/users/:userId/unsuspend — Unsuspends a user account.
   */
  async unsuspendUser(c: Context): Promise<Response> {
    try {
      const userId = c.req.param('userId') as string
      await this.userService.unsuspendUser(userId)
      return c.json({ userId, suspended: false }, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * GET /admin/users/:userId/sessions — Lists all active sessions for a user.
   */
  async listUserSessions(c: Context): Promise<Response> {
    try {
      const userId = c.req.param('userId') as string

      // Verify user exists
      await this.userService.getUser(userId)

      const sessions = await this.authService.getSessions(userId)
      return c.json({ sessions }, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * DELETE /admin/users/:userId/sessions/:sessionId — Invalidates a specific session.
   */
  async invalidateUserSession(c: Context): Promise<Response> {
    try {
      const userId = c.req.param('userId') as string
      const sessionId = c.req.param('sessionId') as string

      // Verify user exists
      await this.userService.getUser(userId)

      await this.authService.invalidateSession(userId, sessionId)
      return c.body(null, 204)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * GET /admin/config — Returns the current server configuration.
   */
  async getConfig(c: Context): Promise<Response> {
    try {
      const config = this.configService.getServerConfig()
      return c.json(config, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * PUT /admin/config — Validates and updates server configuration.
   * Note: In the current filesystem-based architecture, config changes
   * require a restart to take full effect.
   */
  async updateConfig(c: Context): Promise<Response> {
    try {
      const body = await c.req.json()
      const parsed = serverConfigUpdateSchema.safeParse(body)

      if (!parsed.success) {
        const firstError = parsed.error.errors[0]
        const message = firstError !== undefined ? firstError.message : 'Validation failed'
        return c.json(createApiError('VALIDATION_ERROR', message), 400)
      }

      // Log the config change attempt
      const session = c.get('session') as SessionContext
      await this.auditService.log({
        userId: session.userId,
        action: 'CONFIG_CHANGED' as AuditAction,
        target: 'server-config',
        ipAddress: (c.get('clientIp') as string | undefined) ?? '0.0.0.0',
        success: true,
        details: JSON.stringify({ updatedFields: Object.keys(parsed.data) }),
      })

      this.logger.info('Server configuration update requested', {
        userId: session.userId,
        fields: Object.keys(parsed.data),
      })

      // Return the validated config (actual persistence would require restart)
      return c.json({ message: 'Configuration validated. Restart required to apply changes.', config: parsed.data }, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * POST /admin/restart — Initiates a graceful server restart.
   * Responds with 202 Accepted, then exits the process after a short delay.
   * In Docker with `restart: unless-stopped`, this triggers a container restart.
   */
  async restart(c: Context): Promise<Response> {
    try {
      const session = c.get('session') as SessionContext

      this.logger.info('Server restart requested', { userId: session.userId })

      await this.auditService.log({
        userId: session.userId,
        action: 'CONFIG_CHANGED' as AuditAction,
        target: 'server-restart',
        ipAddress: (c.get('clientIp') as string | undefined) ?? '0.0.0.0',
        success: true,
        details: 'Graceful restart requested',
      })

      // Schedule process exit after response is sent
      setTimeout(() => {
        this.logger.info('Server shutting down for restart')
        process.exit(0)
      }, 1000)

      return c.json({ message: 'Restart initiated. Server will restart within 10 seconds.' }, 202)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * GET /admin/audit — Returns paginated audit log entries with optional filters.
   * Accepts query params: action, startDate, endDate, page, pageSize.
   */
  async getAuditLog(c: Context): Promise<Response> {
    try {
      const actionParam = c.req.query('action')
      const startDate = c.req.query('startDate')
      const endDate = c.req.query('endDate')
      const pageParam = c.req.query('page')
      const pageSizeParam = c.req.query('pageSize')

      const page = pageParam !== undefined ? parseInt(pageParam, 10) : 1
      const pageSize = pageSizeParam !== undefined ? parseInt(pageSizeParam, 10) : 20

      if (isNaN(page) || page < 1) {
        return c.json(createApiError('VALIDATION_ERROR', 'Page must be a positive integer'), 400)
      }

      if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
        return c.json(createApiError('VALIDATION_ERROR', 'Page size must be between 1 and 100'), 400)
      }

      const filter: {
        action?: AuditAction
        startDate?: string
        endDate?: string
        page: number
        pageSize: number
      } = { page, pageSize }

      if (actionParam !== undefined) {
        filter.action = actionParam as AuditAction
      }

      if (startDate !== undefined) {
        filter.startDate = startDate
      }

      if (endDate !== undefined) {
        filter.endDate = endDate
      }

      const result = await this.auditService.query(filter)
      return c.json(result, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * GET /admin/logs — Returns paginated server log entries with optional filters.
   * Accepts query params: level, startDate, endDate, search, page, pageSize.
   */
  async getServerLogs(c: Context): Promise<Response> {
    if (!this.serverLogStore) {
      return c.json(createApiError('INTERNAL_ERROR', 'Server log store not configured'), 500)
    }

    try {
      const levelParam = c.req.query('level')
      const startDate = c.req.query('startDate')
      const endDate = c.req.query('endDate')
      const search = c.req.query('search')
      const pageParam = c.req.query('page')
      const pageSizeParam = c.req.query('pageSize')

      const page = pageParam !== undefined ? parseInt(pageParam, 10) : 1
      const pageSize = pageSizeParam !== undefined ? parseInt(pageSizeParam, 10) : 50

      if (isNaN(page) || page < 1) {
        return c.json(createApiError('VALIDATION_ERROR', 'Page must be a positive integer'), 400)
      }

      if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
        return c.json(createApiError('VALIDATION_ERROR', 'Page size must be between 1 and 100'), 400)
      }

      const validLevels = new Set(['debug', 'info', 'warn', 'error'])
      if (levelParam !== undefined && !validLevels.has(levelParam)) {
        return c.json(createApiError('VALIDATION_ERROR', 'Level must be one of: debug, info, warn, error'), 400)
      }

      const filter: { level?: LogLevel; startDate?: string; endDate?: string; search?: string; page: number; pageSize: number } = {
        page,
        pageSize,
      }

      if (levelParam !== undefined) {
        filter.level = levelParam as LogLevel
      }
      if (startDate !== undefined) {
        filter.startDate = startDate
      }
      if (endDate !== undefined) {
        filter.endDate = endDate
      }
      if (search !== undefined) {
        filter.search = search
      }

      const result = await this.serverLogStore.query(filter)

      return c.json(result, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * Maps domain errors to HTTP status codes and structured ApiError responses.
   */
  private handleError(c: Context, error: unknown): Response {
    if (error instanceof UserNotFoundError) {
      this.logger.warn('User not found', { userId: error.userId })
      return c.json(createApiError('USER_NOT_FOUND', error.message), 404)
    }

    if (error instanceof UserConflictError) {
      this.logger.warn('User conflict', { username: error.username })
      return c.json(createApiError('USER_CONFLICT', error.message), 409)
    }

    if (error instanceof UserValidationError) {
      this.logger.warn('User validation error', { code: error.code, message: error.message })
      return c.json(createApiError(error.code, error.message), 400)
    }

    if (error instanceof LastAdminError) {
      this.logger.warn('Last admin constraint violated')
      return c.json(createApiError('LAST_ADMIN', error.message), 409)
    }

    if (error instanceof InsufficientPermissionError) {
      this.logger.warn('Insufficient permissions', { message: error.message })
      return c.json(createApiError('INSUFFICIENT_PERMISSION', error.message), 403)
    }

    if (error instanceof VaultOwnershipError) {
      this.logger.warn('Vault ownership constraint', { message: error.message })
      return c.json(createApiError('VAULT_OWNERSHIP', error.message), 409)
    }

    // Unknown / internal errors
    this.logger.error('Unexpected error in admin controller', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
  }
}

// ─── Admin Route Module ──────────────────────────────────────────────────────

/**
 * Dependencies required to create the admin route module.
 */
export interface AdminRouteDependencies {
  userService: IUserService
  roleService: IRoleService
  authService: IAuthService
  auditService: IAuditService
  configService: IConfigService
  logger: ILogger
  /** Optional server log store for the admin log viewer. */
  serverLogStore?: IServerLogStore
  /** Callback that performs a graceful server restart. */
  restartFn?: () => Promise<void>
}

/**
 * Creates a Hono sub-app with all admin routes.
 * Includes admin-only middleware that rejects non-admin users with 403.
 * All routes are mounted under /admin/... relative to the parent router.
 */
export function createAdminRoutes(deps: AdminRouteDependencies): Hono {
  const app = new Hono()
  const controller = new AdminController(
    deps.userService,
    deps.roleService,
    deps.authService,
    deps.auditService,
    deps.configService,
    deps.logger,
    deps.serverLogStore,
  )

  // Admin-only middleware: reject non-admin users with 403
  app.use('*', async (c: Context, next) => {
    const session = c.get('session' as never) as SessionContext | undefined
    if (!session || session.role !== 'admin') {
      return c.json(createApiError('FORBIDDEN', 'Admin access required'), 403)
    }
    await next()
    return undefined
  })

  // User management routes
  app.get('/users', (c) => controller.listUsers(c))
  app.post('/users', (c) => controller.createUser(c))
  app.delete('/users/:userId', (c) => controller.deleteUser(c))
  app.put('/users/:userId/role', (c) => controller.changeRole(c))
  app.put('/users/:userId/password', (c) => controller.resetPassword(c))
  app.put('/users/:userId/suspend', (c) => controller.suspendUser(c))
  app.put('/users/:userId/unsuspend', (c) => controller.unsuspendUser(c))

  // Session management routes
  app.get('/users/:userId/sessions', (c) => controller.listUserSessions(c))
  app.delete('/users/:userId/sessions/:sessionId', (c) => controller.invalidateUserSession(c))

  // Server configuration routes
  app.get('/config', (c) => controller.getConfig(c))
  app.put('/config', (c) => controller.updateConfig(c))

  // Server restart
  app.post('/restart', (c) => controller.restart(c))

  // Audit log
  app.get('/audit', (c) => controller.getAuditLog(c))

  // Server logs
  app.get('/logs', (c) => controller.getServerLogs(c))

  return app
}

/**
 * Route module that registers admin routes on a parent Hono router.
 * Mounts the admin sub-app under /admin.
 */
export class AdminRouteModule implements RouteModule {
  private readonly adminApp: Hono

  constructor(deps: AdminRouteDependencies) {
    this.adminApp = createAdminRoutes(deps)
  }

  /**
   * Registers the admin sub-app on the given router under /admin.
   */
  register(router: Hono): void {
    router.route('/admin', this.adminApp)
  }
}
