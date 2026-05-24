import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes, randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import { verify } from 'argon2'
import type { UserRole, PublicUserInfo, IUserRepository } from '../user/index.js'
import { AccountSuspendedError } from '../user/index.js'
import type { ILogger } from '../logger/index.js'
import type { IAuditService } from '../audit/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Represents a stored session in the system.
 */
export interface Session {
  sessionId: string
  token: string
  csrfToken: string
  userId: string
  role: UserRole
  userAgent: string
  ipAddress: string
  createdAt: string
  expiresAt: string
  lastActivity: string
}

/**
 * Metadata about the login request environment.
 */
export interface LoginMeta {
  ipAddress: string
  userAgent: string
}

/**
 * Result returned after a successful login.
 */
export interface LoginResult {
  token: string
  csrfToken: string
  user: PublicUserInfo
  expiresAt: string
}

/**
 * Context extracted from a validated session, attached to authenticated requests.
 */
export interface SessionContext {
  userId: string
  username: string
  role: UserRole
  sessionId: string
}

/**
 * Public information about a session (no sensitive token data).
 */
export interface SessionInfo {
  sessionId: string
  userAgent: string
  ipAddress: string
  createdAt: string
  lastActivity: string
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Persistence layer for session management.
 * Stores sessions as JSON files and maintains an in-memory token index.
 */
export interface ISessionStore {
  /** Persist a new session to the store. */
  create(session: Session): Promise<void>

  /** Look up a session by its opaque token. Returns null if not found or expired. */
  findByToken(token: string): Promise<Session | null>

  /** Find all sessions belonging to a specific user. */
  findByUserId(userId: string): Promise<Session[]>

  /** Invalidate (delete) a single session by its token. */
  invalidate(token: string): Promise<void>

  /** Invalidate all sessions for a user, optionally keeping one token active. */
  invalidateAllForUser(userId: string, exceptToken?: string): Promise<void>

  /** Update an existing session in the store (e.g. lastActivity). */
  update(session: Session): Promise<void>

  /** Remove expired sessions from the store. Returns the number of sessions removed. */
  cleanup(): Promise<number>
}

/**
 * Core authentication service handling login, logout, session validation, and CSRF.
 */
export interface IAuthService {
  /** Authenticate a user with username and password. */
  login(username: string, password: string, meta: LoginMeta): Promise<LoginResult>

  /** Invalidate the session associated with the given token. */
  logout(token: string): Promise<void>

  /** Validate a session token and return the session context, or null if invalid/expired. */
  validateSession(token: string): Promise<SessionContext | null>

  /** Get all active sessions for a user (public info only). */
  getSessions(userId: string): Promise<SessionInfo[]>

  /** Invalidate a specific session belonging to a user. */
  invalidateSession(userId: string, sessionId: string): Promise<void>

  /** Invalidate all sessions for a user except the one identified by currentToken. */
  invalidateOtherSessions(userId: string, currentToken: string): Promise<void>

  /** Generate a CSRF token bound to a session. */
  generateCsrfToken(sessionId: string): string

  /** Validate a CSRF token against the expected value for a session. */
  validateCsrfToken(sessionId: string, token: string): boolean
}

// ─── Error Classes ───────────────────────────────────────────────────────────

/**
 * Thrown when authentication fails (invalid credentials).
 */
export class AuthenticationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

/**
 * Thrown when a session has expired.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired')
    this.name = 'SessionExpiredError'
  }
}

/**
 * Thrown when rate limiting is triggered.
 */
export class RateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds`)
    this.name = 'RateLimitError'
  }
}

/**
 * Thrown when a CSRF token is missing or invalid.
 */
export class CsrfError extends Error {
  constructor() {
    super('Invalid or missing CSRF token')
    this.name = 'CsrfError'
  }
}

// ─── SessionStore Implementation ─────────────────────────────────────────────

/**
 * Filesystem-backed session store with in-memory token index.
 * Sessions are persisted as individual JSON files under `data/sessions/`.
 * A `Map<token, sessionId>` is maintained in memory for fast lookups.
 */
export class SessionStore implements ISessionStore {
  private readonly tokenIndex: Map<string, string> = new Map()
  private readonly sessionsDir: string
  private dirEnsured = false

  constructor(
    dataDir: string,
    private readonly logger: ILogger
  ) {
    this.sessionsDir = join(dataDir, 'sessions')
  }

  /**
   * Load all existing sessions from the filesystem into the in-memory index.
   * Must be called once at startup before the store is used.
   */
  async loadIndex(): Promise<void> {
    await this.ensureDir()
    let files: string[]
    try {
      files = await readdir(this.sessionsDir)
    } catch {
      this.logger.warn('Could not read sessions directory during index load')
      return
    }

    const jsonFiles = files.filter(f => f.endsWith('.json'))
    let loaded = 0

    for (const file of jsonFiles) {
      try {
        const filePath = join(this.sessionsDir, file)
        const content = await readFile(filePath, 'utf-8')
        const session: unknown = JSON.parse(content)
        if (this.isValidSession(session)) {
          this.tokenIndex.set(session.token, session.sessionId)
          loaded++
        }
      } catch {
        this.logger.warn('Failed to load session file during index load', { file })
      }
    }

    this.logger.info('Session index loaded', { count: loaded })
  }

  /**
   * Persist a new session to the store.
   */
  async create(session: Session): Promise<void> {
    await this.ensureDir()
    const filePath = join(this.sessionsDir, `${session.sessionId}.json`)
    await this.atomicWrite(filePath, JSON.stringify(session, null, 2))
    this.tokenIndex.set(session.token, session.sessionId)
  }

  /**
   * Update an existing session in the store (e.g. lastActivity).
   */
  async update(session: Session): Promise<void> {
    await this.ensureDir()
    const filePath = join(this.sessionsDir, `${session.sessionId}.json`)
    await this.atomicWrite(filePath, JSON.stringify(session, null, 2))
  }

  /**
   * Look up a session by its opaque token.
   * Returns null if not found or if the session has expired.
   */
  async findByToken(token: string): Promise<Session | null> {
    const sessionId = this.tokenIndex.get(token)
    if (sessionId === undefined) {
      return null
    }

    const session = await this.readSession(sessionId)
    if (session === null) {
      this.tokenIndex.delete(token)
      return null
    }

    // Check expiry
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      // Session expired — remove from index and filesystem
      this.tokenIndex.delete(token)
      await this.deleteSessionFile(sessionId)
      return null
    }

    return session
  }

  /**
   * Find all sessions belonging to a specific user.
   */
  async findByUserId(userId: string): Promise<Session[]> {
    const sessions: Session[] = []

    for (const [, sessionId] of this.tokenIndex) {
      const session = await this.readSession(sessionId)
      if (session !== null && session.userId === userId) {
        sessions.push(session)
      }
    }

    return sessions
  }

  /**
   * Invalidate (delete) a single session by its token.
   */
  async invalidate(token: string): Promise<void> {
    const sessionId = this.tokenIndex.get(token)
    if (sessionId === undefined) {
      return
    }

    this.tokenIndex.delete(token)
    await this.deleteSessionFile(sessionId)
  }

  /**
   * Invalidate all sessions for a user, optionally keeping one token active.
   */
  async invalidateAllForUser(userId: string, exceptToken?: string): Promise<void> {
    const tokensToRemove: string[] = []

    for (const [token, sessionId] of this.tokenIndex) {
      if (exceptToken !== undefined && token === exceptToken) {
        continue
      }

      const session = await this.readSession(sessionId)
      if (session !== null && session.userId === userId) {
        tokensToRemove.push(token)
      }
    }

    for (const token of tokensToRemove) {
      const sessionId = this.tokenIndex.get(token)
      if (sessionId !== undefined) {
        this.tokenIndex.delete(token)
        await this.deleteSessionFile(sessionId)
      }
    }
  }

  /**
   * Remove expired sessions from both filesystem and in-memory index.
   * Returns the number of sessions removed.
   */
  async cleanup(): Promise<number> {
    const now = Date.now()
    const tokensToRemove: string[] = []

    for (const [token, sessionId] of this.tokenIndex) {
      const session = await this.readSession(sessionId)
      if (session === null) {
        tokensToRemove.push(token)
      } else if (new Date(session.expiresAt).getTime() <= now) {
        tokensToRemove.push(token)
      }
    }

    for (const token of tokensToRemove) {
      const sessionId = this.tokenIndex.get(token)
      if (sessionId !== undefined) {
        this.tokenIndex.delete(token)
        await this.deleteSessionFile(sessionId)
      }
    }

    if (tokensToRemove.length > 0) {
      this.logger.info('Expired sessions cleaned up', { count: tokensToRemove.length })
    }

    return tokensToRemove.length
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Ensure the sessions directory exists.
   */
  private async ensureDir(): Promise<void> {
    if (this.dirEnsured) {
      return
    }
    await mkdir(this.sessionsDir, { recursive: true })
    this.dirEnsured = true
  }

  /**
   * Read a session from the filesystem by its ID.
   */
  private async readSession(sessionId: string): Promise<Session | null> {
    const filePath = join(this.sessionsDir, `${sessionId}.json`)
    try {
      const content = await readFile(filePath, 'utf-8')
      const parsed: unknown = JSON.parse(content)
      if (this.isValidSession(parsed)) {
        return parsed
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Delete a session file from the filesystem.
   */
  private async deleteSessionFile(sessionId: string): Promise<void> {
    const filePath = join(this.sessionsDir, `${sessionId}.json`)
    try {
      await unlink(filePath)
    } catch {
      // File may already be deleted — ignore
    }
  }

  /**
   * Write data atomically: write to a temp file, then rename to target.
   */
  private async atomicWrite(targetPath: string, data: string): Promise<void> {
    const tempName = `${randomBytes(16).toString('hex')}.tmp`
    const tempPath = join(this.sessionsDir, tempName)
    await writeFile(tempPath, data, 'utf-8')
    await rename(tempPath, targetPath)
  }

  /**
   * Type guard to validate that a parsed JSON value is a valid Session object.
   */
  private isValidSession(value: unknown): value is Session {
    if (typeof value !== 'object' || value === null) {
      return false
    }
    const obj = value as Record<string, unknown>
    return (
      typeof obj['sessionId'] === 'string' &&
      typeof obj['token'] === 'string' &&
      typeof obj['csrfToken'] === 'string' &&
      typeof obj['userId'] === 'string' &&
      typeof obj['role'] === 'string' &&
      typeof obj['userAgent'] === 'string' &&
      typeof obj['ipAddress'] === 'string' &&
      typeof obj['createdAt'] === 'string' &&
      typeof obj['expiresAt'] === 'string' &&
      typeof obj['lastActivity'] === 'string'
    )
  }
}


// ─── AuthService Implementation ──────────────────────────────────────────────

/** Duration of a session in milliseconds (24 hours). */
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

/**
 * Core authentication service.
 * Handles login, logout, session validation, and CSRF token management.
 * Uses argon2id for password verification and HMAC-SHA256 for CSRF tokens.
 */
export class AuthService implements IAuthService {
  constructor(
    private readonly sessionStore: ISessionStore,
    private readonly userRepository: IUserRepository,
    private readonly logger: ILogger,
    private readonly csrfSecret: string,
    private readonly auditService?: IAuditService
  ) {}

  /**
   * Authenticate a user with username and password.
   * Creates a new session on success.
   * Throws AuthenticationError for invalid credentials (same error regardless of cause).
   * Throws AccountSuspendedError if the account is suspended.
   */
  async login(username: string, password: string, meta: LoginMeta): Promise<LoginResult> {
    const user = await this.userRepository.findByUsername(username)

    if (user === null) {
      this.logger.info('Login failed: user not found', { username })
      await this.auditService?.log({
        userId: null,
        action: 'LOGIN_FAILED',
        target: username,
        ipAddress: meta.ipAddress,
        success: false,
        details: 'User not found',
      })
      throw new AuthenticationError('INVALID_CREDENTIALS', 'Invalid username or password')
    }

    // Verify password with argon2id
    let passwordValid: boolean
    try {
      passwordValid = await verify(user.passwordHash, password)
    } catch {
      this.logger.error('Password verification failed', { userId: user.userId })
      await this.auditService?.log({
        userId: user.userId,
        action: 'LOGIN_FAILED',
        target: user.userId,
        ipAddress: meta.ipAddress,
        success: false,
        details: 'Password verification error',
      })
      throw new AuthenticationError('INVALID_CREDENTIALS', 'Invalid username or password')
    }

    if (!passwordValid) {
      this.logger.info('Login failed: invalid password', { userId: user.userId })
      await this.auditService?.log({
        userId: user.userId,
        action: 'LOGIN_FAILED',
        target: user.userId,
        ipAddress: meta.ipAddress,
        success: false,
        details: 'Invalid password',
      })
      throw new AuthenticationError('INVALID_CREDENTIALS', 'Invalid username or password')
    }

    // Check suspended status
    if (user.suspended) {
      this.logger.info('Login failed: account suspended', { userId: user.userId })
      await this.auditService?.log({
        userId: user.userId,
        action: 'LOGIN_FAILED',
        target: user.userId,
        ipAddress: meta.ipAddress,
        success: false,
        details: 'Account suspended',
      })
      throw new AccountSuspendedError()
    }

    // Generate session tokens
    const token = randomBytes(64).toString('hex') // 128 chars
    const sessionId = randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS)

    // CSRF token is HMAC-based (deterministic from sessionId + csrfSecret)
    const csrfToken = this.generateCsrfToken(sessionId)

    const session: Session = {
      sessionId,
      token,
      csrfToken,
      userId: user.userId,
      role: user.role,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActivity: now.toISOString(),
    }

    await this.sessionStore.create(session)

    this.logger.info('Login successful', { userId: user.userId, sessionId })

    await this.auditService?.log({
      userId: user.userId,
      action: 'LOGIN_SUCCESS',
      target: user.userId,
      ipAddress: meta.ipAddress,
      success: true,
    })

    const publicUser: PublicUserInfo = {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
      colorScheme: user.colorScheme,
      suspended: user.suspended,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
    }

    return {
      token,
      csrfToken,
      user: publicUser,
      expiresAt: expiresAt.toISOString(),
    }
  }

  /**
   * Invalidate the session associated with the given token.
   */
  async logout(token: string): Promise<void> {
    // Retrieve session info before invalidation for audit logging
    const session = await this.sessionStore.findByToken(token)
    await this.sessionStore.invalidate(token)
    this.logger.info('Logout successful')

    if (session !== null) {
      await this.auditService?.log({
        userId: session.userId,
        action: 'LOGOUT',
        target: session.userId,
        ipAddress: session.ipAddress,
        success: true,
      })
    }
  }

  /**
   * Validate a session token and return the session context.
   * Returns null if the token is invalid or the session has expired.
   * Updates the lastActivity timestamp on the session file.
   */
  async validateSession(token: string): Promise<SessionContext | null> {
    const session = await this.sessionStore.findByToken(token)
    if (session === null) {
      return null
    }

    // Look up the user to get the current username and role
    const user = await this.userRepository.findById(session.userId)
    if (user === null) {
      // User was deleted — invalidate the session
      await this.sessionStore.invalidate(token)
      return null
    }

    // Update lastActivity timestamp
    const updatedSession: Session = {
      ...session,
      lastActivity: new Date().toISOString(),
      role: user.role, // Always use current role from user record
    }
    await this.sessionStore.update(updatedSession)

    return {
      userId: user.userId,
      username: user.username,
      role: user.role,
      sessionId: session.sessionId,
    }
  }

  /**
   * Get all active sessions for a user (public info only, no tokens).
   */
  async getSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await this.sessionStore.findByUserId(userId)
    return sessions.map(s => ({
      sessionId: s.sessionId,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
    }))
  }

  /**
   * Invalidate a specific session belonging to a user.
   * Only invalidates if the session actually belongs to the specified user.
   */
  async invalidateSession(userId: string, sessionId: string): Promise<void> {
    const sessions = await this.sessionStore.findByUserId(userId)
    const target = sessions.find(s => s.sessionId === sessionId)
    if (target !== undefined) {
      await this.sessionStore.invalidate(target.token)
      this.logger.info('Session invalidated', { userId, sessionId })
    }
  }

  /**
   * Invalidate all sessions for a user except the one identified by currentToken.
   */
  async invalidateOtherSessions(userId: string, currentToken: string): Promise<void> {
    await this.sessionStore.invalidateAllForUser(userId, currentToken)
    this.logger.info('Other sessions invalidated', { userId })
  }

  /**
   * Generate a CSRF token bound to a session using HMAC-SHA256.
   * The token is deterministic for a given sessionId and csrfSecret.
   */
  generateCsrfToken(sessionId: string): string {
    const hmac = createHmac('sha256', this.csrfSecret)
    hmac.update(sessionId)
    return hmac.digest('hex')
  }

  /**
   * Validate a CSRF token against the expected value for a session.
   * Uses timing-safe comparison to prevent timing attacks.
   */
  validateCsrfToken(sessionId: string, token: string): boolean {
    const expected = this.generateCsrfToken(sessionId)
    if (token.length !== expected.length) {
      return false
    }
    try {
      return timingSafeEqual(Buffer.from(token, 'utf-8'), Buffer.from(expected, 'utf-8'))
    } catch {
      return false
    }
  }
}
