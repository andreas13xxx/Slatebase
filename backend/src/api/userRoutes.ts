/**
 * User routes module — profile management, password change, and self-deletion.
 * All routes require authentication (session context set by auth middleware).
 */

import type { Context } from 'hono'
import type { Hono } from 'hono'
import type { IUserService, UpdateProfileData } from '../user/index.js'
import { UserNotFoundError, UserValidationError, VaultOwnershipError } from '../user/index.js'
import type { ILogger } from '../logger/index.js'
import { updateProfileSchema, changePasswordSchema } from '../user/validation.js'
import type { SessionContext } from '../auth/index.js'
import type { RouteModule } from './index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── UserController ──────────────────────────────────────────────────────────

/**
 * Controller handling user profile operations.
 * Maps HTTP requests to UserService calls and domain errors to HTTP responses.
 */
export class UserController {
  constructor(
    private readonly userService: IUserService,
    private readonly logger: ILogger,
  ) {}

  /**
   * GET /users/me — Returns the current user's profile.
   */
  async getProfile(c: Context): Promise<Response> {
    const session = c.get('session') as SessionContext
    try {
      const user = await this.userService.getUser(session.userId)
      return c.json(user, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * PUT /users/me — Validates and updates the current user's profile fields.
   */
  async updateProfile(c: Context): Promise<Response> {
    const session = c.get('session') as SessionContext

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      const apiError = createApiError('VALIDATION_ERROR', 'Invalid JSON body')
      return c.json(apiError, 400)
    }

    // Validate input with Zod schema
    const result = updateProfileSchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      const apiError = createApiError('VALIDATION_ERROR', message)
      return c.json(apiError, 400)
    }

    try {
      // Strip undefined values to satisfy exactOptionalPropertyTypes
      const profileData: Record<string, unknown> = {}
      if (result.data.displayName !== undefined) {
        profileData['displayName'] = result.data.displayName
      }
      if (result.data.email !== undefined) {
        profileData['email'] = result.data.email
      }
      if (result.data.avatarUrl !== undefined) {
        profileData['avatarUrl'] = result.data.avatarUrl
      }
      if (result.data.preferredLanguage !== undefined) {
        profileData['preferredLanguage'] = result.data.preferredLanguage
      }
      if (result.data.colorScheme !== undefined) {
        profileData['colorScheme'] = result.data.colorScheme
      }

      const updatedUser = await this.userService.updateProfile(
        session.userId,
        profileData as UpdateProfileData,
      )
      return c.json(updatedUser, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * PUT /users/me/password — Changes the current user's password.
   * Requires current password confirmation.
   */
  async changePassword(c: Context): Promise<Response> {
    const session = c.get('session') as SessionContext

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      const apiError = createApiError('VALIDATION_ERROR', 'Invalid JSON body')
      return c.json(apiError, 400)
    }

    // Validate input with Zod schema
    const result = changePasswordSchema.safeParse(body)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid input'
      const apiError = createApiError('VALIDATION_ERROR', message)
      return c.json(apiError, 400)
    }

    try {
      await this.userService.changePassword(
        session.userId,
        result.data.currentPassword,
        result.data.newPassword,
      )
      return c.json({ message: 'Password changed successfully' }, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * DELETE /users/me — Deletes the current user's account.
   * Requires password confirmation in the request body.
   */
  async deleteSelf(c: Context): Promise<Response> {
    const session = c.get('session') as SessionContext

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      const apiError = createApiError('VALIDATION_ERROR', 'Invalid JSON body')
      return c.json(apiError, 400)
    }

    // Validate password field is present
    if (body === null || typeof body !== 'object' || !('password' in body)) {
      const apiError = createApiError('VALIDATION_ERROR', 'Missing required field: password')
      return c.json(apiError, 400)
    }

    const { password } = body as { password: unknown }
    if (typeof password !== 'string' || password.length === 0) {
      const apiError = createApiError('VALIDATION_ERROR', 'Password must be a non-empty string')
      return c.json(apiError, 400)
    }

    try {
      await this.userService.deleteSelf(session.userId, password)
      return c.body(null, 204)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  // ─── Error Mapping ───────────────────────────────────────────────────────────

  /**
   * Maps domain errors to HTTP status codes and structured API error responses.
   */
  private handleError(c: Context, error: unknown): Response {
    if (error instanceof UserNotFoundError) {
      this.logger.warn('User not found', { userId: error.userId })
      const apiError = createApiError('USER_NOT_FOUND', error.message)
      return c.json(apiError, 404)
    }

    if (error instanceof UserValidationError) {
      this.logger.warn('User validation error', { code: error.code, message: error.message })
      const apiError = createApiError(error.code, error.message)
      return c.json(apiError, 400)
    }

    if (error instanceof VaultOwnershipError) {
      this.logger.warn('Vault ownership conflict', { message: error.message })
      const apiError = createApiError('VAULT_OWNERSHIP_CONFLICT', error.message)
      return c.json(apiError, 409)
    }

    // Unknown / internal errors
    this.logger.error('Unexpected error in UserController', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    const apiError = createApiError('INTERNAL_ERROR', 'Internal server error')
    return c.json(apiError, 500)
  }
}

// ─── UserRouteModule ─────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with all user profile routes.
 * Routes are mounted under /users and require authentication.
 */
export class UserRouteModule implements RouteModule {
  constructor(private readonly controller: UserController) {}

  /**
   * Registers user routes on the provided Hono router.
   */
  register(router: Hono): void {
    router.get('/users/me', (c) => this.controller.getProfile(c))
    router.put('/users/me', (c) => this.controller.updateProfile(c))
    router.put('/users/me/password', (c) => this.controller.changePassword(c))
    router.delete('/users/me', (c) => this.controller.deleteSelf(c))
  }
}
