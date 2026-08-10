// Admin Route Module — AdminController and route registration

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
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

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

/**
 * Schema for route params containing `:userId`.
 * Non-empty string, max 64 characters (user IDs are shorter, but leave margin).
 */
const userIdParamSchema = z.object({
  userId: z.string().min(1, 'userId must not be empty').max(64, 'userId too long'),
})

/**
 * Schema for route params containing `:userId` and `:sessionId`.
 */
const sessionParamsSchema = z.object({
  userId: z.string().min(1, 'userId must not be empty').max(64, 'userId too long'),
  sessionId: z.string().min(1, 'sessionId must not be empty').max(256, 'sessionId too long'),
})

/**
 * Schema for pagination query params (page, pageSize).
 * Accepts strings from query params and coerces to numbers.
 */
const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be a positive integer').default(1),
  pageSize: z.coerce.number().int().min(1, 'Page size must be at least 1').max(100, 'Page size must be at most 100').default(20),
})

/**
 * Valid audit action values for query-param validation.
 */
const auditActionEnum = z.enum([
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'ROLE_CHANGED',
  'USER_CREATED',
  'USER_DELETED',
  'USER_SUSPENDED',
  'USER_UNSUSPENDED',
  'VAULT_SHARE_CREATED',
  'VAULT_SHARE_REVOKED',
  'VAULT_SHARE_UPDATED',
  'VAULT_OWNERSHIP_TRANSFERRED',
  'CONFIG_CHANGED',
  'FEATURE_TOGGLED',
])

/**
 * ISO 8601 date string schema (YYYY-MM-DD format).
 */
const isoDateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in YYYY-MM-DD format',
)

/**
 * Schema for audit log query params.
 */
const auditQuerySchema = z.object({
  action: auditActionEnum.optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1, 'Page must be a positive integer').default(1),
  pageSize: z.coerce.number().int().min(1, 'Page size must be at least 1').max(100, 'Page size must be at most 100').default(20),
})

/**
 * Valid log level enum for server log query.
 */
const logLevelEnum = z.enum(['debug', 'info', 'warn', 'error'])

/**
 * Schema for server logs query params.
 */
const logsQuerySchema = z.object({
  level: logLevelEnum.optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  search: z.string().max(256, 'Search term too long').optional(),
  page: z.coerce.number().int().min(1, 'Page must be a positive integer').default(1),
  pageSize: z.coerce.number().int().min(1, 'Page size must be at least 1').max(100, 'Page size must be at most 100').default(50),
})

/**
 * Schema for the changeRole body.
 * Wraps role in an object so we validate the body shape.
 */
const changeRoleBodySchema = z.object({
  role: roleSchema,
})

// ─── Helpers: Validation ─────────────────────────────────────────────────────

/**
 * Extracts the first error message from a Zod error and returns a 400 response.
 */
function validationErrorResponse(c: Context, zodError: z.ZodError): Response {
  const firstError = zodError.errors[0]
  const message = firstError ? firstError.message : 'Validation failed'
  return c.json(createApiError('VALIDATION_ERROR', message), 400)
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
      const raw = c.req.query()
      const parsed = paginationQuerySchema.safeParse(raw)

      if (!parsed.success) {
        return validationErrorResponse(c, parsed.error)
      }

      const options: PaginationOptions = { page: parsed.data.page, pageSize: parsed.data.pageSize }
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

      // Default preferredLanguage to the creating admin's language
      let preferredLanguage = parsed.data.preferredLanguage
      if (preferredLanguage === undefined) {
        const session = c.get('session') as SessionContext
        const adminUser = await this.userService.getUser(session.userId)
        preferredLanguage = adminUser.preferredLanguage
      }

      const createData = {
        username: parsed.data.username,
        password: parsed.data.password,
        role: parsed.data.role,
        preferredLanguage,
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
      const paramsParsed = userIdParamSchema.safeParse({ userId: c.req.param('userId') })
      if (!paramsParsed.success) {
        return validationErrorResponse(c, paramsParsed.error)
      }

      await this.userService.deleteUser(paramsParsed.data.userId)
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
      const paramsParsed = userIdParamSchema.safeParse({ userId: c.req.param('userId') })
      if (!paramsParsed.success) {
        return validationErrorResponse(c, paramsParsed.error)
      }

      const body = await c.req.json()
      const bodyParsed = changeRoleBodySchema.safeParse(body)
      if (!bodyParsed.success) {
        return validationErrorResponse(c, bodyParsed.error)
      }

      const { userId } = paramsParsed.data
      const { role } = bodyParsed.data

      await this.roleService.assignRole(userId, role)
      return c.json({ userId, role }, 200)
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
      const paramsParsed = userIdParamSchema.safeParse({ userId: c.req.param('userId') })
      if (!paramsParsed.success) {
        return validationErrorResponse(c, paramsParsed.error)
      }

      const tempPassword = await this.userService.resetPassword(paramsParsed.data.userId)
      return c.json({ userId: paramsParsed.data.userId, temporaryPassword: tempPassword }, 200)
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
      const paramsParsed = userIdParamSchema.safeParse({ userId: c.req.param('userId') })
      if (!paramsParsed.success) {
        return validationErrorResponse(c, paramsParsed.error)
      }

      const { userId } = paramsParsed.data
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
      const paramsParsed = userIdParamSchema.safeParse({ userId: c.req.param('userId') })
      if (!paramsParsed.success) {
        return validationErrorResponse(c, paramsParsed.error)
      }

      const { userId } = paramsParsed.data
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
      const paramsParsed = userIdParamSchema.safeParse({ userId: c.req.param('userId') })
      if (!paramsParsed.success) {
        return validationErrorResponse(c, paramsParsed.error)
      }

      const { userId } = paramsParsed.data

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
      const paramsParsed = sessionParamsSchema.safeParse({
        userId: c.req.param('userId'),
        sessionId: c.req.param('sessionId'),
      })
      if (!paramsParsed.success) {
        return validationErrorResponse(c, paramsParsed.error)
      }

      const { userId, sessionId } = paramsParsed.data

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
      const raw = c.req.query()
      const parsed = auditQuerySchema.safeParse(raw)

      if (!parsed.success) {
        return validationErrorResponse(c, parsed.error)
      }

      const filter: {
        action?: AuditAction
        startDate?: string
        endDate?: string
        page: number
        pageSize: number
      } = { page: parsed.data.page, pageSize: parsed.data.pageSize }

      if (parsed.data.action !== undefined) {
        filter.action = parsed.data.action as AuditAction
      }

      if (parsed.data.startDate !== undefined) {
        filter.startDate = parsed.data.startDate
      }

      if (parsed.data.endDate !== undefined) {
        filter.endDate = parsed.data.endDate
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
      const raw = c.req.query()
      const parsed = logsQuerySchema.safeParse(raw)

      if (!parsed.success) {
        return validationErrorResponse(c, parsed.error)
      }

      const filter: { level?: LogLevel; startDate?: string; endDate?: string; search?: string; page: number; pageSize: number } = {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      }

      if (parsed.data.level !== undefined) {
        filter.level = parsed.data.level as LogLevel
      }
      if (parsed.data.startDate !== undefined) {
        filter.startDate = parsed.data.startDate
      }
      if (parsed.data.endDate !== undefined) {
        filter.endDate = parsed.data.endDate
      }
      if (parsed.data.search !== undefined) {
        filter.search = parsed.data.search
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
