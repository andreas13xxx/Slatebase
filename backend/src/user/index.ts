import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { hash, verify } from 'argon2'
import type { ISessionStore } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IAuditService } from '../audit/index.js'
import type { OnUserCreatedFn } from '../welcome-vault/types.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Available user roles in the system.
 */
export type UserRole = 'admin' | 'user'

/**
 * Full user record as stored in the filesystem.
 */
export interface UserRecord {
  userId: string
  username: string
  passwordHash: string
  role: UserRole
  displayName: string
  email: string
  avatarUrl: string
  preferredLanguage: 'de' | 'en'
  colorScheme: 'light' | 'dark' | 'system'
  suspended: boolean
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Public user information returned by the API (no sensitive data).
 */
export interface PublicUserInfo {
  userId: string
  username: string
  displayName: string
  email: string
  avatarUrl: string
  role: UserRole
  preferredLanguage: 'de' | 'en'
  colorScheme: 'light' | 'dark' | 'system'
  suspended: boolean
  mustChangePassword: boolean
  createdAt: string
}

/**
 * Data required to create a new user.
 */
export interface CreateUserData {
  username: string
  password: string
  role: UserRole
  displayName?: string
}

/**
 * Data for updating a user's profile. All fields are optional.
 */
export interface UpdateProfileData {
  displayName?: string
  email?: string
  avatarUrl?: string
  preferredLanguage?: 'de' | 'en'
  colorScheme?: 'light' | 'dark' | 'system'
}

/**
 * Options for paginated queries.
 */
export interface PaginationOptions {
  /** Page number (1-based). */
  page: number
  /** Number of items per page (max 100). */
  pageSize: number
}

/**
 * Generic paginated result wrapper.
 */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Data access layer for user records.
 * Persists users as JSON files under `data/users/`.
 */
export interface IUserRepository {
  /** Find a user by their unique ID. */
  findById(userId: string): Promise<UserRecord | null>

  /** Find a user by their username. */
  findByUsername(username: string): Promise<UserRecord | null>

  /** Search users by username prefix (case-insensitive). Returns up to `limit` results. */
  searchByUsernamePrefix(prefix: string, limit?: number): Promise<UserRecord[]>

  /** List all users with pagination, sorted by username ascending. */
  findAll(options?: PaginationOptions): Promise<PaginatedResult<UserRecord>>

  /** Save (create or update) a user record. */
  save(user: UserRecord): Promise<void>

  /** Delete a user record by ID. */
  delete(userId: string): Promise<void>

  /** Count total number of users. */
  count(): Promise<number>

  /** Count users with a specific role. */
  countByRole(role: UserRole): Promise<number>
}

/**
 * Business logic for user management operations.
 */
export interface IUserService {
  /** Create a new user account. */
  createUser(data: CreateUserData): Promise<PublicUserInfo>

  /** Delete a user account (admin action). */
  deleteUser(userId: string): Promise<void>

  /** Update a user's profile fields. */
  updateProfile(userId: string, data: UpdateProfileData): Promise<PublicUserInfo>

  /** Change a user's password (requires current password verification). */
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>

  /** Reset a user's password (admin action). Returns the generated temporary password. */
  resetPassword(userId: string): Promise<string>

  /** Get public user information by ID. */
  getUser(userId: string): Promise<PublicUserInfo>

  /** List users with pagination. */
  listUsers(options?: PaginationOptions): Promise<PaginatedResult<PublicUserInfo>>

  /** Search users by username prefix. Returns up to `limit` public user infos. */
  searchUsers(prefix: string, limit?: number): Promise<PublicUserInfo[]>

  /** Suspend a user account. */
  suspendUser(userId: string): Promise<void>

  /** Unsuspend a user account. */
  unsuspendUser(userId: string): Promise<void>

  /** Delete the current user's own account (requires password confirmation). */
  deleteSelf(userId: string, password: string): Promise<void>
}

/**
 * Service for managing user roles and permissions.
 */
export interface IRoleService {
  /** Assign a new role to a user. */
  assignRole(userId: string, role: UserRole): Promise<void>

  /** Get the current role of a user. */
  getRole(userId: string): Promise<UserRole>

  /** Check whether removing admin from this user would leave no admins. */
  canRemoveAdmin(userId: string): Promise<boolean>
}

// ─── Error Classes ───────────────────────────────────────────────────────────

/**
 * Thrown when a user cannot be found by ID or username.
 */
export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`User not found: ${userId}`)
    this.name = 'UserNotFoundError'
  }
}

/**
 * Thrown when attempting to create a user with a username that already exists.
 */
export class UserConflictError extends Error {
  constructor(public readonly username: string) {
    super(`Username already exists: ${username}`)
    this.name = 'UserConflictError'
  }
}

/**
 * Thrown when user input fails validation.
 */
export class UserValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'UserValidationError'
  }
}

/**
 * Thrown when an operation would remove the last administrator.
 */
export class LastAdminError extends Error {
  constructor() {
    super('Cannot remove the last administrator')
    this.name = 'LastAdminError'
  }
}

/**
 * Thrown when a suspended account attempts an action.
 */
export class AccountSuspendedError extends Error {
  constructor() {
    super('Account is suspended')
    this.name = 'AccountSuspendedError'
  }
}

/**
 * Thrown when a user lacks the required permissions for an action.
 */
export class InsufficientPermissionError extends Error {
  constructor(message: string = 'Insufficient permissions') {
    super(message)
    this.name = 'InsufficientPermissionError'
  }
}

/**
 * Thrown when a vault ownership constraint is violated.
 */
export class VaultOwnershipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultOwnershipError'
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

/**
 * Username-to-userId index stored in `_index.json`.
 */
interface UsernameIndex {
  [username: string]: string
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-based user repository.
 * Stores user records as individual JSON files under `data/users/<userId>.json`.
 * Maintains a `_index.json` file mapping usernames to user IDs for fast lookups.
 * All write operations use atomic temp-file-then-rename to prevent corruption.
 */
export class UserRepository implements IUserRepository {
  private readonly usersDir: string
  private readonly indexPath: string
  private initialized = false

  constructor(dataDir: string) {
    this.usersDir = path.join(dataDir, 'users')
    this.indexPath = path.join(this.usersDir, '_index.json')
  }

  /**
   * Ensures the users directory exists. Called lazily on first access.
   */
  private async ensureDirectory(): Promise<void> {
    if (this.initialized) return
    await fs.mkdir(this.usersDir, { recursive: true })
    this.initialized = true
  }

  /**
   * Reads the username→userId index from disk.
   * Returns an empty object if the file does not exist.
   */
  private async readIndex(): Promise<UsernameIndex> {
    try {
      const raw = await fs.readFile(this.indexPath, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {}
      }
      return parsed as UsernameIndex
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return {}
      }
      throw error
    }
  }

  /**
   * Writes the username→userId index to disk atomically.
   */
  private async writeIndex(index: UsernameIndex): Promise<void> {
    await this.ensureDirectory()
    const content = JSON.stringify(index, null, 2)
    const tempPath = this.indexPath + `.${crypto.randomBytes(8).toString('hex')}.tmp`

    await fs.writeFile(tempPath, content, 'utf-8')

    try {
      await fs.rename(tempPath, this.indexPath)
    } catch (renameError) {
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw renameError
    }
  }

  /**
   * Writes a user record to disk atomically.
   */
  private async writeUserFile(user: UserRecord): Promise<void> {
    await this.ensureDirectory()
    const filePath = path.join(this.usersDir, `${user.userId}.json`)
    const content = JSON.stringify(user, null, 2)
    const tempPath = filePath + `.${crypto.randomBytes(8).toString('hex')}.tmp`

    await fs.writeFile(tempPath, content, 'utf-8')

    try {
      await fs.rename(tempPath, filePath)
    } catch (renameError) {
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw renameError
    }
  }

  /**
   * Reads a user record from disk by user ID.
   * Returns null if the file does not exist.
   */
  private async readUserFile(userId: string): Promise<UserRecord | null> {
    const filePath = path.join(this.usersDir, `${userId}.json`)
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(raw) as UserRecord
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  /** Find a user by their unique ID. */
  async findById(userId: string): Promise<UserRecord | null> {
    await this.ensureDirectory()
    return this.readUserFile(userId)
  }

  /** Find a user by their username using the index for fast lookup. */
  async findByUsername(username: string): Promise<UserRecord | null> {
    await this.ensureDirectory()
    const index = await this.readIndex()
    const userId = index[username]
    if (userId === undefined) {
      return null
    }
    return this.readUserFile(userId)
  }

  /** Search users by username prefix (case-insensitive). Returns up to `limit` results. */
  async searchByUsernamePrefix(prefix: string, limit: number = 10): Promise<UserRecord[]> {
    await this.ensureDirectory()
    const index = await this.readIndex()
    const lowerPrefix = prefix.toLowerCase()
    const matchingUsernames = Object.keys(index)
      .filter((name) => name.toLowerCase().startsWith(lowerPrefix))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, limit)

    const results: UserRecord[] = []
    for (const username of matchingUsernames) {
      const userId = index[username]
      if (userId === undefined) continue
      const user = await this.readUserFile(userId)
      if (user !== null) {
        results.push(user)
      }
    }
    return results
  }

  /** List all users with pagination, sorted by username ascending. */
  async findAll(options?: PaginationOptions): Promise<PaginatedResult<UserRecord>> {
    await this.ensureDirectory()
    const index = await this.readIndex()
    const usernames = Object.keys(index).sort((a, b) => a.localeCompare(b))
    const total = usernames.length

    const page = options?.page ?? 1
    const pageSize = options?.pageSize ?? 100
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    const start = (page - 1) * pageSize
    const paginatedUsernames = usernames.slice(start, start + pageSize)

    const items: UserRecord[] = []
    for (const username of paginatedUsernames) {
      const userId = index[username]
      if (userId === undefined) continue
      const user = await this.readUserFile(userId)
      if (user !== null) {
        items.push(user)
      }
    }

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    }
  }

  /** Save (create or update) a user record atomically. */
  async save(user: UserRecord): Promise<void> {
    await this.ensureDirectory()

    // Read current index
    const index = await this.readIndex()

    // Check if this is an update with a username change
    const existingUser = await this.readUserFile(user.userId)
    if (existingUser !== null && existingUser.username !== user.username) {
      // Remove old username from index
      delete index[existingUser.username]
    }

    // Write user file atomically
    await this.writeUserFile(user)

    // Update index with current username → userId mapping
    index[user.username] = user.userId
    await this.writeIndex(index)
  }

  /** Delete a user record by ID and remove from index. */
  async delete(userId: string): Promise<void> {
    await this.ensureDirectory()

    // Read user to get username for index removal
    const user = await this.readUserFile(userId)
    if (user === null) {
      return // Nothing to delete
    }

    // Remove user file
    const filePath = path.join(this.usersDir, `${userId}.json`)
    try {
      await fs.unlink(filePath)
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        // Already deleted, continue to clean up index
      } else {
        throw error
      }
    }

    // Remove from index
    const index = await this.readIndex()
    delete index[user.username]
    await this.writeIndex(index)
  }

  /** Count total number of users. */
  async count(): Promise<number> {
    await this.ensureDirectory()
    const index = await this.readIndex()
    return Object.keys(index).length
  }

  /** Count users with a specific role. */
  async countByRole(role: UserRole): Promise<number> {
    await this.ensureDirectory()
    const index = await this.readIndex()
    const userIds = Object.values(index)

    let count = 0
    for (const userId of userIds) {
      const user = await this.readUserFile(userId)
      if (user !== null && user.role === role) {
        count++
      }
    }

    return count
  }
}

// ─── Startup ─────────────────────────────────────────────────────────────────

/**
 * Ensures a default admin account exists on first startup.
 * If no users exist in the repository, creates an admin user with
 * username "admin" and password "admin" (argon2id-hashed).
 * The account is flagged with `mustChangePassword: true` so the user
 * is forced to set a new password on first login.
 */
export async function ensureDefaultAdmin(userRepo: IUserRepository, logger: ILogger): Promise<void> {
  const count = await userRepo.count()
  if (count > 0) return

  const now = new Date().toISOString()
  const passwordHash = await hash('admin', {
    type: 2,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  })

  const admin: UserRecord = {
    userId: crypto.randomUUID(),
    username: 'admin',
    passwordHash,
    role: 'admin',
    displayName: 'Administrator',
    email: '',
    avatarUrl: '',
    preferredLanguage: 'de',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now,
  }

  await userRepo.save(admin)
  logger.info('Default admin account created', { userId: admin.userId })
}

// ─── RoleService Implementation ──────────────────────────────────────────────

/**
 * Service for managing user roles and permissions.
 * Handles role assignment, lookup, and admin-count invariant enforcement.
 * When a role is changed, all active sessions for the user are updated immediately.
 */
export class RoleService implements IRoleService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly sessionStore: ISessionStore,
    private readonly logger: ILogger,
    private readonly auditService?: IAuditService
  ) {}

  /**
   * Assign a new role to a user.
   * Updates the user record and all active sessions to reflect the new role immediately.
   * Throws UserNotFoundError if the user does not exist.
   * Throws LastAdminError if removing admin from the last administrator.
   */
  async assignRole(userId: string, role: UserRole): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }

    // If demoting from admin, check the last-admin invariant
    if (user.role === 'admin' && role !== 'admin') {
      const canRemove = await this.canRemoveAdmin(userId)
      if (!canRemove) {
        throw new LastAdminError()
      }
    }

    // Update the user record with the new role
    const updatedUser: UserRecord = {
      ...user,
      role,
      updatedAt: new Date().toISOString(),
    }
    await this.userRepository.save(updatedUser)

    // Update all active sessions for this user to reflect the new role
    const sessions = await this.sessionStore.findByUserId(userId)
    for (const session of sessions) {
      const updatedSession = { ...session, role }
      await this.sessionStore.update(updatedSession)
    }

    this.logger.info('Role assigned', { userId, role })

    await this.auditService?.log({
      userId,
      action: 'ROLE_CHANGED',
      target: userId,
      ipAddress: '0.0.0.0',
      success: true,
      details: JSON.stringify({ previousRole: user.role, newRole: role }),
    })
  }

  /**
   * Get the current role of a user.
   * Throws UserNotFoundError if the user does not exist.
   */
  async getRole(userId: string): Promise<UserRole> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }
    return user.role
  }

  /**
   * Check whether removing admin from this user would leave no admins.
   * Returns true if the admin role can be safely removed.
   * Returns false if the user is the last admin.
   * Throws UserNotFoundError if the user does not exist.
   */
  async canRemoveAdmin(userId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }

    // If the user is not an admin, removing admin is not applicable — return true
    if (user.role !== 'admin') {
      return true
    }

    const adminCount = await this.userRepository.countByRole('admin')
    // If this is the only admin, cannot remove
    return adminCount !== 1
  }
}


// ─── Argon2 Configuration ────────────────────────────────────────────────────

/** Argon2id hashing parameters (OWASP recommended). */
const ARGON2_OPTIONS = {
  type: 2 as const,       // argon2id
  memoryCost: 65536,      // 64 MB
  timeCost: 3,            // 3 iterations
  parallelism: 4,
}

/** Character set for temporary password generation (ambiguous chars removed). */
const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

/** Length of generated temporary passwords. */
const TEMP_PASSWORD_LENGTH = 12

// ─── Callback Type ───────────────────────────────────────────────────────────

/**
 * Callback to check whether a user owns any vaults.
 * Returns true if the user owns at least one vault.
 */
export type CheckVaultOwnershipFn = (userId: string) => Promise<boolean>

/**
 * Callback invoked when a user is deleted or suspended.
 * Used to invalidate external resources (e.g., MCP tokens).
 */
export type OnUserInvalidatedFn = (userId: string) => Promise<void>

// ─── UserService Implementation ──────────────────────────────────────────────

/**
 * Business logic for user management operations.
 * Handles user creation, deletion, profile updates, password management,
 * and account suspension. Enforces the last-admin invariant and validates
 * all input atomically.
 */
export class UserService implements IUserService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly sessionStore: ISessionStore,
    private readonly logger: ILogger,
    private readonly checkVaultOwnership?: CheckVaultOwnershipFn,
    private readonly auditService?: IAuditService,
    private readonly onUserInvalidated?: OnUserInvalidatedFn,
    private readonly onUserCreated?: OnUserCreatedFn
  ) {}

  /**
   * Create a new user account.
   * Validates input, checks username uniqueness, hashes password with argon2id,
   * and persists the user record.
   */
  async createUser(data: CreateUserData): Promise<PublicUserInfo> {
    // Validate username format
    this.validateUsername(data.username)

    // Validate password
    this.validatePassword(data.password)

    // Validate role
    if (data.role !== 'admin' && data.role !== 'user') {
      throw new UserValidationError('INVALID_ROLE', 'Role must be "admin" or "user"')
    }

    // Validate optional displayName
    if (data.displayName !== undefined) {
      this.validateDisplayName(data.displayName)
    }

    // Check username uniqueness
    const existing = await this.userRepository.findByUsername(data.username)
    if (existing !== null) {
      throw new UserConflictError(data.username)
    }

    // Hash password with argon2id
    const passwordHash = await hash(data.password, ARGON2_OPTIONS)

    const now = new Date().toISOString()
    const user: UserRecord = {
      userId: crypto.randomUUID(),
      username: data.username,
      passwordHash,
      role: data.role,
      displayName: data.displayName ?? data.username,
      email: '',
      avatarUrl: '',
      preferredLanguage: 'de',
      colorScheme: 'system',
      suspended: false,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
    }

    await this.userRepository.save(user)

    // Trigger post-creation callback (never throws)
    if (this.onUserCreated) {
      try {
        await this.onUserCreated(user.userId)
      } catch (error) {
        this.logger.error('onUserCreated callback failed', {
          userId: user.userId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    this.logger.info('User created', { userId: user.userId, username: user.username })

    await this.auditService?.log({
      userId: user.userId,
      action: 'USER_CREATED',
      target: user.userId,
      ipAddress: '0.0.0.0',
      success: true,
      details: JSON.stringify({ username: user.username, role: user.role }),
    })

    return this.toPublicInfo(user)
  }

  /**
   * Delete a user account (admin action).
   * Checks the last-admin invariant and invalidates all sessions.
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }

    // Check last admin invariant
    if (user.role === 'admin') {
      const adminCount = await this.userRepository.countByRole('admin')
      if (adminCount <= 1) {
        throw new LastAdminError()
      }
    }

    // Invalidate all sessions for this user
    await this.sessionStore.invalidateAllForUser(userId)

    // Notify external services (e.g., MCP token invalidation)
    await this.onUserInvalidated?.(userId)

    // Delete the user record
    await this.userRepository.delete(userId)
    this.logger.info('User deleted', { userId, username: user.username })

    await this.auditService?.log({
      userId,
      action: 'USER_DELETED',
      target: userId,
      ipAddress: '0.0.0.0',
      success: true,
      details: JSON.stringify({ username: user.username }),
    })
  }

  /**
   * Update a user's profile fields atomically.
   * If any field is invalid, the entire update is rejected.
   */
  async updateProfile(userId: string, data: UpdateProfileData): Promise<PublicUserInfo> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }

    // Validate all fields BEFORE applying any changes (atomic: all-or-nothing)
    if (data.displayName !== undefined) {
      this.validateDisplayName(data.displayName)
    }

    if (data.email !== undefined) {
      this.validateEmail(data.email)
    }

    if (data.avatarUrl !== undefined) {
      this.validateAvatarUrl(data.avatarUrl)
    }

    if (data.preferredLanguage !== undefined) {
      if (data.preferredLanguage !== 'de' && data.preferredLanguage !== 'en') {
        throw new UserValidationError('INVALID_LANGUAGE', 'Preferred language must be "de" or "en"')
      }
    }

    if (data.colorScheme !== undefined) {
      if (data.colorScheme !== 'light' && data.colorScheme !== 'dark' && data.colorScheme !== 'system') {
        throw new UserValidationError('INVALID_COLOR_SCHEME', 'Color scheme must be "light", "dark", or "system"')
      }
    }

    // Apply changes
    const updatedUser: UserRecord = {
      ...user,
      displayName: data.displayName !== undefined ? data.displayName : user.displayName,
      email: data.email !== undefined ? data.email : user.email,
      avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : user.avatarUrl,
      preferredLanguage: data.preferredLanguage !== undefined ? data.preferredLanguage : user.preferredLanguage,
      colorScheme: data.colorScheme !== undefined ? data.colorScheme : user.colorScheme,
      updatedAt: new Date().toISOString(),
    }

    await this.userRepository.save(updatedUser)
    this.logger.info('Profile updated', { userId })

    return this.toPublicInfo(updatedUser)
  }

  /**
   * Change a user's password.
   * Verifies the current password first, then validates the new password rules:
   * 8–128 chars, different from current. Sets mustChangePassword to false on success.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }

    // Verify current password
    let currentValid: boolean
    try {
      currentValid = await verify(user.passwordHash, currentPassword)
    } catch {
      throw new UserValidationError('VERIFICATION_FAILED', 'Password verification failed')
    }

    if (!currentValid) {
      throw new UserValidationError('INVALID_CURRENT_PASSWORD', 'Current password is incorrect')
    }

    // Validate new password length
    if (newPassword.length < 8) {
      throw new UserValidationError('PASSWORD_TOO_SHORT', 'Password must be at least 8 characters')
    }
    if (newPassword.length > 128) {
      throw new UserValidationError('PASSWORD_TOO_LONG', 'Password must be at most 128 characters')
    }

    // Check that new password differs from current
    if (currentPassword === newPassword) {
      throw new UserValidationError('PASSWORD_SAME_AS_CURRENT', 'New password must be different from current password')
    }

    // Hash new password
    const passwordHash = await hash(newPassword, ARGON2_OPTIONS)

    const updatedUser: UserRecord = {
      ...user,
      passwordHash,
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    }

    await this.userRepository.save(updatedUser)
    this.logger.info('Password changed', { userId })

    await this.auditService?.log({
      userId,
      action: 'PASSWORD_CHANGED',
      target: userId,
      ipAddress: '0.0.0.0',
      success: true,
    })
  }

  /**
   * Reset a user's password (admin action).
   * Generates a temporary password (12 chars), sets mustChangePassword to true.
   * Returns the generated temporary password.
   */
  async resetPassword(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }

    // Generate temporary password
    const tempPassword = this.generateTempPassword()

    // Hash the temporary password
    const passwordHash = await hash(tempPassword, ARGON2_OPTIONS)

    const updatedUser: UserRecord = {
      ...user,
      passwordHash,
      mustChangePassword: true,
      updatedAt: new Date().toISOString(),
    }

    await this.userRepository.save(updatedUser)
    this.logger.info('Password reset', { userId })

    await this.auditService?.log({
      userId,
      action: 'PASSWORD_RESET',
      target: userId,
      ipAddress: '0.0.0.0',
      success: true,
    })

    return tempPassword
  }

  /**
   * Get public user information by ID.
   */
  async getUser(userId: string): Promise<PublicUserInfo> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }
    return this.toPublicInfo(user)
  }

  /**
   * List users with pagination, sorted by username ascending.
   */
  async listUsers(options?: PaginationOptions): Promise<PaginatedResult<PublicUserInfo>> {
    const result = await this.userRepository.findAll(options)
    return {
      items: result.items.map(u => this.toPublicInfo(u)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    }
  }

  /**
   * Search users by username prefix (case-insensitive).
   * Returns up to `limit` public user infos matching the prefix.
   */
  async searchUsers(prefix: string, limit: number = 10): Promise<PublicUserInfo[]> {
    const users = await this.userRepository.searchByUsernamePrefix(prefix, limit)
    return users.map(u => this.toPublicInfo(u))
  }

  /**
   * Suspend a user account.
   * Checks the last-admin invariant and invalidates all sessions on suspend.
   */
  async suspendUser(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }

    // Check last admin invariant
    if (user.role === 'admin') {
      // Count non-suspended admins (excluding this user)
      const allUsers = await this.userRepository.findAll({ page: 1, pageSize: 100 })
      const activeAdmins = allUsers.items.filter(
        u => u.role === 'admin' && !u.suspended && u.userId !== userId
      )
      if (activeAdmins.length === 0) {
        throw new LastAdminError()
      }
    }

    const updatedUser: UserRecord = {
      ...user,
      suspended: true,
      updatedAt: new Date().toISOString(),
    }

    await this.userRepository.save(updatedUser)

    // Invalidate all sessions for the suspended user
    await this.sessionStore.invalidateAllForUser(userId)

    // Notify external services (e.g., MCP token invalidation)
    await this.onUserInvalidated?.(userId)

    this.logger.info('User suspended', { userId })

    await this.auditService?.log({
      userId,
      action: 'USER_SUSPENDED',
      target: userId,
      ipAddress: '0.0.0.0',
      success: true,
    })
  }

  /**
   * Unsuspend a user account.
   */
  async unsuspendUser(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }

    const updatedUser: UserRecord = {
      ...user,
      suspended: false,
      updatedAt: new Date().toISOString(),
    }

    await this.userRepository.save(updatedUser)
    this.logger.info('User unsuspended', { userId })

    await this.auditService?.log({
      userId,
      action: 'USER_UNSUSPENDED',
      target: userId,
      ipAddress: '0.0.0.0',
      success: true,
    })
  }

  /**
   * Delete the current user's own account.
   * Requires password confirmation and checks that the user owns no vaults.
   */
  async deleteSelf(userId: string, password: string): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (user === null) {
      throw new UserNotFoundError(userId)
    }

    // Verify password
    let passwordValid: boolean
    try {
      passwordValid = await verify(user.passwordHash, password)
    } catch {
      throw new UserValidationError('VERIFICATION_FAILED', 'Password verification failed')
    }

    if (!passwordValid) {
      throw new UserValidationError('INVALID_PASSWORD', 'Password is incorrect')
    }

    // Check last admin invariant
    if (user.role === 'admin') {
      const adminCount = await this.userRepository.countByRole('admin')
      if (adminCount <= 1) {
        throw new LastAdminError()
      }
    }

    // Check vault ownership if callback is provided
    if (this.checkVaultOwnership !== undefined) {
      const ownsVaults = await this.checkVaultOwnership(userId)
      if (ownsVaults) {
        throw new VaultOwnershipError('Cannot delete account while owning vaults. Transfer or delete all vaults first.')
      }
    }

    // Invalidate all sessions
    await this.sessionStore.invalidateAllForUser(userId)

    // Notify external services (e.g., MCP token invalidation)
    await this.onUserInvalidated?.(userId)

    // Delete the user record
    await this.userRepository.delete(userId)
    this.logger.info('User self-deleted', { userId })
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Validate username format: 3–64 chars, alphanumeric + hyphen + underscore.
   */
  private validateUsername(username: string): void {
    if (username.length < 3) {
      throw new UserValidationError('USERNAME_TOO_SHORT', 'Username must be at least 3 characters')
    }
    if (username.length > 64) {
      throw new UserValidationError('USERNAME_TOO_LONG', 'Username must be at most 64 characters')
    }
    if (!/^[a-zA-Z0-9\-_]+$/.test(username)) {
      throw new UserValidationError(
        'USERNAME_INVALID_CHARS',
        'Username must contain only alphanumeric characters, hyphens, and underscores',
      )
    }
  }

  /**
   * Validate password length: 8–128 characters.
   */
  private validatePassword(password: string): void {
    if (password.length < 8) {
      throw new UserValidationError('PASSWORD_TOO_SHORT', 'Password must be at least 8 characters')
    }
    if (password.length > 128) {
      throw new UserValidationError('PASSWORD_TOO_LONG', 'Password must be at most 128 characters')
    }
  }

  /**
   * Validate display name: 1–50 characters.
   */
  private validateDisplayName(displayName: string): void {
    if (displayName.length < 1) {
      throw new UserValidationError('DISPLAY_NAME_TOO_SHORT', 'Display name must be at least 1 character')
    }
    if (displayName.length > 50) {
      throw new UserValidationError('DISPLAY_NAME_TOO_LONG', 'Display name must be at most 50 characters')
    }
  }

  /**
   * Validate email: RFC 5322 format, max 254 characters.
   * Empty string is allowed (clears the email).
   */
  private validateEmail(email: string): void {
    if (email === '') return
    if (email.length > 254) {
      throw new UserValidationError('EMAIL_TOO_LONG', 'Email must be at most 254 characters')
    }
    // Basic RFC 5322 email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new UserValidationError('EMAIL_INVALID', 'Email must be a valid email address')
    }
  }

  /**
   * Validate avatar URL: max 2048 characters, must start with http:// or https://.
   * Empty string is allowed (clears the avatar URL).
   */
  private validateAvatarUrl(avatarUrl: string): void {
    if (avatarUrl === '') return
    if (avatarUrl.length > 2048) {
      throw new UserValidationError('AVATAR_URL_TOO_LONG', 'Avatar URL must be at most 2048 characters')
    }
    if (!/^https?:\/\//.test(avatarUrl)) {
      throw new UserValidationError('AVATAR_URL_INVALID', 'Avatar URL must start with http:// or https://')
    }
  }

  /**
   * Generate a cryptographically secure temporary password.
   * Uses 12 characters from a reduced character set (ambiguous chars removed).
   */
  private generateTempPassword(): string {
    const bytes = crypto.randomBytes(TEMP_PASSWORD_LENGTH)
    let result = ''
    for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
      const byte = bytes[i]
      if (byte === undefined) {
        // Should never happen with correct length, but satisfies noUncheckedIndexedAccess
        result += TEMP_PASSWORD_CHARS[0]
      } else {
        result += TEMP_PASSWORD_CHARS[byte % TEMP_PASSWORD_CHARS.length]
      }
    }
    return result
  }

  /**
   * Convert a UserRecord to PublicUserInfo (strips sensitive data).
   */
  private toPublicInfo(user: UserRecord): PublicUserInfo {
    return {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
      colorScheme: user.colorScheme,
      suspended: user.suspended,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
    }
  }
}
