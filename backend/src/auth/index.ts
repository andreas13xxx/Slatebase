import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes, randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import { hash, verify } from 'argon2'
import type { UserRole, PublicUserInfo, IUserRepository } from '../user/index.js'
import { AccountSuspendedError, ARGON2_OPTIONS } from '../user/index.js'
import type { ILogger } from '../logger/index.js'
import type { IAuditService } from '../audit/index.js'
import { isNodeError } from '../shared/fs-utils.js'

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
 * A secondary `Map<userId, Set<sessionId>>` enables O(1) user-session lookups.
 */
export class SessionStore implements ISessionStore {
  private readonly tokenIndex: Map<string, string> = new Map()
  private readonly userIndex: Map<string, Set<string>> = new Map()
  private readonly sessionsDir: string
  private dirEnsured = false
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    dataDir: string,
    private readonly logger: ILogger
  ) {
    this.sessionsDir = join(dataDir, 'sessions')
  }

  /**
   * Starts a periodic sweep that removes expired session files (see cleanup()).
   * Nothing calls cleanup() otherwise — findByToken() only prunes a session it
   * happens to be asked about, so a session nobody requests again (an
   * abandoned tab, a token that was never revisited) would sit on disk
   * forever. Left alone, `getSessions()`/`findByUserId()` — which is also what
   * the frontend's session-liveness probe hits — reads every leftover file for
   * that user on every call, so the backlog makes that check slower over time.
   *
   * Not part of ISessionStore: composition-root lifecycle concern only, same
   * as loadIndex().
   */
  startCleanup(intervalMs: number): void {
    if (this.cleanupTimer !== null) {
      return
    }
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err: unknown) => {
        this.logger.error('Periodic session cleanup failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
    }, intervalMs)
    // Allow the process to exit even if this timer is active.
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref()
    }
  }

  /** Stops the periodic cleanup sweep started by startCleanup(). */
  stopCleanup(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Load all existing sessions from the filesystem into the in-memory indexes.
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
          this.addToUserIndex(session.userId, session.sessionId)
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
    this.addToUserIndex(session.userId, session.sessionId)
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

    const result = await this.readSessionResult(sessionId)
    if (result.session === null) {
      if (result.gone) {
        // The file really is absent or unusable — the session no longer exists.
        this.tokenIndex.delete(token)
      } else {
        // A transient read failure (a lock held by antivirus, a synced folder,
        // a concurrent rewrite) is not evidence that the session is gone.
        // Dropping the token here would kill a valid session permanently: the
        // file stays on disk but nothing maps the token to it again until the
        // process restarts and rebuilds the index. Answer "not right now" and
        // keep the mapping, so the next request recovers.
        this.logger.warn('Session file temporarily unreadable — keeping token index entry', {
          sessionId,
          error: result.error,
        })
      }
      return null
    }
    const session = result.session

    // Check expiry
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      // Session expired — remove from indexes and filesystem
      this.tokenIndex.delete(token)
      this.removeFromUserIndex(session.userId, sessionId)
      await this.deleteSessionFile(sessionId)
      return null
    }

    return session
  }

  /**
   * Find all sessions belonging to a specific user.
   * Uses the secondary userId index for O(1) lookup of session IDs,
   * then reads each session from disk.
   */
  async findByUserId(userId: string): Promise<Session[]> {
    const sessionIds = this.userIndex.get(userId)
    if (sessionIds === undefined || sessionIds.size === 0) {
      return []
    }

    const sessions: Session[] = []
    for (const sessionId of sessionIds) {
      const session = await this.readSession(sessionId)
      if (session !== null) {
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

    // Read the session to get the userId for the user index
    const session = await this.readSession(sessionId)
    if (session !== null) {
      this.removeFromUserIndex(session.userId, sessionId)
    }

    this.tokenIndex.delete(token)
    await this.deleteSessionFile(sessionId)
  }

  /**
   * Invalidate all sessions for a user, optionally keeping one token active.
   */
  async invalidateAllForUser(userId: string, exceptToken?: string): Promise<void> {
    const sessionIds = this.userIndex.get(userId)
    if (sessionIds === undefined || sessionIds.size === 0) {
      return
    }

    // Find which tokens belong to these sessions
    const tokensToRemove: string[] = []
    for (const [token, sessionId] of this.tokenIndex) {
      if (exceptToken !== undefined && token === exceptToken) {
        continue
      }
      if (sessionIds.has(sessionId)) {
        tokensToRemove.push(token)
      }
    }

    for (const token of tokensToRemove) {
      const sessionId = this.tokenIndex.get(token)
      if (sessionId !== undefined) {
        this.tokenIndex.delete(token)
        this.removeFromUserIndex(userId, sessionId)
        await this.deleteSessionFile(sessionId)
      }
    }
  }

  /**
   * Remove expired sessions from both filesystem and in-memory indexes.
   * Returns the number of sessions removed.
   */
  async cleanup(): Promise<number> {
    const now = Date.now()
    const tokensToRemove: Array<{ token: string; sessionId: string; userId: string | null }> = []

    for (const [token, sessionId] of this.tokenIndex) {
      const session = await this.readSession(sessionId)
      if (session === null) {
        tokensToRemove.push({ token, sessionId, userId: null })
      } else if (new Date(session.expiresAt).getTime() <= now) {
        tokensToRemove.push({ token, sessionId, userId: session.userId })
      }
    }

    for (const { token, sessionId, userId } of tokensToRemove) {
      this.tokenIndex.delete(token)
      if (userId !== null) {
        this.removeFromUserIndex(userId, sessionId)
      }
      await this.deleteSessionFile(sessionId)
    }

    if (tokensToRemove.length > 0) {
      this.logger.info('Expired sessions cleaned up', { count: tokensToRemove.length })
    }

    return tokensToRemove.length
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Add a session to the userId secondary index.
   */
  private addToUserIndex(userId: string, sessionId: string): void {
    let sessionIds = this.userIndex.get(userId)
    if (sessionIds === undefined) {
      sessionIds = new Set()
      this.userIndex.set(userId, sessionIds)
    }
    sessionIds.add(sessionId)
  }

  /**
   * Remove a session from the userId secondary index.
   */
  private removeFromUserIndex(userId: string, sessionId: string): void {
    const sessionIds = this.userIndex.get(userId)
    if (sessionIds !== undefined) {
      sessionIds.delete(sessionId)
      if (sessionIds.size === 0) {
        this.userIndex.delete(userId)
      }
    }
  }

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
   * Callers that only need the session (not the gone/transient distinction)
   * use this; findByToken() uses readSessionResult() directly instead.
   */
  private async readSession(sessionId: string): Promise<Session | null> {
    return (await this.readSessionResult(sessionId)).session
  }

  /**
   * Read a session from the filesystem by its ID, distinguishing a confirmed
   * deletion from a transient read failure.
   *
   * `gone: true` means the file is provably absent (ENOENT) or its content is
   * provably not a session (parses but fails schema validation) — safe to
   * deindex. `gone: false` covers everything else: a lock held by antivirus or
   * a synced folder (EPERM/EBUSY on Windows), or a JSON parse failure that
   * could be a torn read of an in-progress write. None of those prove the
   * session doesn't exist, so the caller must not drop it from the index.
   */
  private async readSessionResult(sessionId: string): Promise<{ session: Session | null; gone: boolean; error?: string }> {
    const filePath = join(this.sessionsDir, `${sessionId}.json`)
    let content: string
    try {
      content = await readFile(filePath, 'utf-8')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return { session: null, gone: true, error: 'ENOENT' }
      }
      return { session: null, gone: false, error: err instanceof Error ? err.message : String(err) }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (err: unknown) {
      // Could be a torn read of a file mid-write via the non-atomic last-resort
      // fallback in atomicWrite() — not proof the session is gone.
      return { session: null, gone: false, error: err instanceof Error ? err.message : String(err) }
    }

    if (this.isValidSession(parsed)) {
      return { session: parsed, gone: false }
    }
    // Well-formed JSON that isn't a session — genuinely wrong content, not a race.
    return { session: null, gone: true, error: 'Session file content failed validation' }
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
   * On Windows, rename can fail with EPERM if the target is briefly locked
   * (e.g. by antivirus or file watchers). Retries with delay and unlink-before-rename.
   */
  private async atomicWrite(targetPath: string, data: string): Promise<void> {
    const tempName = `${randomBytes(16).toString('hex')}.tmp`
    const tempPath = join(this.sessionsDir, tempName)
    await writeFile(tempPath, data, 'utf-8')

    try {
      await rename(tempPath, targetPath)
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EPERM' || code === 'EACCES') {
        // Windows: target may be locked — wait briefly for lock release, then retry
        await new Promise(resolve => setTimeout(resolve, 50))
        try { await unlink(targetPath) } catch { /* may not exist */ }
        try {
          await rename(tempPath, targetPath)
        } catch {
          // Second retry after another short delay
          await new Promise(resolve => setTimeout(resolve, 100))
          try {
            await rename(tempPath, targetPath)
          } catch {
            // Last resort: direct overwrite (loses atomicity but avoids crash)
            await writeFile(targetPath, data, 'utf-8')
            try { await unlink(tempPath) } catch { /* cleanup */ }
          }
        }
      } else {
        // Clean up temp file and rethrow
        try { await unlink(tempPath) } catch { /* ignore */ }
        throw err
      }
    }
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

/** Default duration of a session in milliseconds (24 hours). */
const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000

/** Default max lifetime of a session in milliseconds (7 days). */
const DEFAULT_MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

/** Minimum interval between session file writes for sliding expiry (1 minute). */
const LAST_ACTIVITY_WRITE_INTERVAL_MS = 60 * 1000

/**
 * Core authentication service.
 * Handles login, logout, session validation, and CSRF token management.
 * Uses argon2id for password verification and HMAC-SHA256 for CSRF tokens.
 */
export class AuthService implements IAuthService {
  private readonly sessionDurationMs: number
  private readonly maxLifetimeMs: number

  constructor(
    private readonly sessionStore: ISessionStore,
    private readonly userRepository: IUserRepository,
    private readonly logger: ILogger,
    private readonly csrfSecret: string,
    private readonly auditService?: IAuditService,
    sessionDurationMs?: number,
    maxLifetimeMs?: number
  ) {
    this.sessionDurationMs = sessionDurationMs ?? DEFAULT_SESSION_DURATION_MS
    this.maxLifetimeMs = maxLifetimeMs ?? DEFAULT_MAX_LIFETIME_MS
  }

  /**
   * Authenticate a user with username and password.
   * Creates a new session on success.
   * Throws AuthenticationError for invalid credentials (same error regardless of cause).
   * Throws AccountSuspendedError if the account is suspended.
   */
  async login(username: string, password: string, meta: LoginMeta): Promise<LoginResult> {
    const user = await this.userRepository.findByUsername(username)

    if (user === null) {
      // Run a dummy Argon2 hash with the same cost parameters as a real verify()
      // below, so this branch takes roughly the same wall-clock time as the
      // "user found, wrong password" branch. Without this, an attacker can
      // enumerate valid usernames by measuring how much slower a login attempt
      // is for existing usernames (which pay for a real argon2 verify).
      try {
        await hash(password, ARGON2_OPTIONS)
      } catch {
        // Timing-only — ignore failures (e.g. an absurdly long password)
      }

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
    const expiresAt = new Date(now.getTime() + this.sessionDurationMs)

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
      avatarUrl: user.avatarUrl,
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
   * Implements sliding expiry: extends expiresAt on each validated request.
   * Enforces absolute max lifetime from createdAt.
   */
  async validateSession(token: string): Promise<SessionContext | null> {
    const session = await this.sessionStore.findByToken(token)
    if (session === null) {
      // Logged because a rejected session is invisible otherwise: the middleware
      // answers 401 without a trace, and the client reports "logged out for no
      // reason". The reason is always one of these four branches.
      this.logger.info('Session rejected', { reason: 'UNKNOWN_OR_EXPIRED_TOKEN' })
      return null
    }

    // Enforce absolute max lifetime
    const createdAt = new Date(session.createdAt).getTime()
    if (Date.now() - createdAt > this.maxLifetimeMs) {
      await this.sessionStore.invalidate(token)
      this.logger.info('Session rejected', {
        reason: 'MAX_LIFETIME_EXCEEDED',
        sessionId: session.sessionId,
        userId: session.userId,
        createdAt: session.createdAt,
      })
      return null
    }

    // Look up the user to get the current username and role
    const user = await this.userRepository.findById(session.userId)
    if (user === null) {
      // User was deleted — invalidate the session
      await this.sessionStore.invalidate(token)
      this.logger.info('Session rejected', {
        reason: 'USER_NOT_FOUND',
        sessionId: session.sessionId,
        userId: session.userId,
      })
      return null
    }

    // Sliding expiry: extend expiresAt and refresh lastActivity.
    //
    // Throttled on purpose. Writing the session file on every single request
    // produced a file write per API call — pure churn, and actively harmful when
    // the data directory sits in a synced folder (OneDrive) that locks files
    // behind our back. Second-level precision on lastActivity buys nothing
    // against a session lifetime measured in hours.
    const now = new Date()
    const lastWrite = new Date(session.lastActivity).getTime()
    const isStale = now.getTime() - lastWrite >= LAST_ACTIVITY_WRITE_INTERVAL_MS
    const roleChanged = session.role !== user.role

    if (isStale || roleChanged) {
      const newExpiresAt = new Date(now.getTime() + this.sessionDurationMs)
      const updatedSession: Session = {
        ...session,
        lastActivity: now.toISOString(),
        expiresAt: newExpiresAt.toISOString(),
        role: user.role, // Always use current role from user record
      }
      try {
        await this.sessionStore.update(updatedSession)
      } catch (err: unknown) {
        // On Windows, EPERM can occur if antivirus or file watchers lock the session file.
        // This is a non-critical update (only lastActivity/role sync) — log and continue.
        this.logger.warn('Failed to update session lastActivity', {
          sessionId: session.sessionId,
          error: (err as Error).message,
        })
      }
    }

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
