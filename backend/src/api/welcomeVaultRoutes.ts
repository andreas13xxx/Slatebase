// Welcome Vault Routes — Route module for manual welcome vault creation

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { IWelcomeVaultService } from '../welcome-vault/index.js'
import type { WelcomeVaultLanguage } from '../welcome-vault/types.js'
import type { IUserService } from '../user/index.js'
import type { IVaultService } from '../business/index.js'
import type { IFeatureToggleService } from '../feature-toggle/types.js'
import type { IConfigService } from '../config/index.js'
import { LinkIndexService } from '../link-index/index.js'

// --- Helper: API Error Response ---

interface ApiError {
  code: string
  message: string
  timestamp: string
}

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

// --- Rate Limiting ---

interface RateLimitEntry {
  /** Timestamps of requests within the current window. */
  timestamps: number[]
}

/** Maximum number of welcome vault creation requests per user per hour. */
const RATE_LIMIT_MAX_REQUESTS = 3

/** Rate limit window in milliseconds (1 hour). */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

/** In-memory rate limit store (userId → entry). Resets on restart. */
const rateLimitMap = new Map<string, RateLimitEntry>()

/**
 * Checks whether a user is rate-limited for welcome vault creation.
 * Automatically records the request if allowed.
 * Returns whether the request is allowed and the retry-after duration in seconds.
 */
function checkRateLimit(userId: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)

  if (!entry) {
    rateLimitMap.set(userId, { timestamps: [now] })
    return { allowed: true, retryAfter: 0 }
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS)

  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestTimestamp = entry.timestamps[0]
    const retryAfter = oldestTimestamp !== undefined
      ? Math.ceil((oldestTimestamp + RATE_LIMIT_WINDOW_MS - now) / 1000)
      : 3600
    return { allowed: false, retryAfter }
  }

  entry.timestamps.push(now)
  return { allowed: true, retryAfter: 0 }
}

// --- Name Deduplication ---

/**
 * Generates a unique vault name by appending a numeric suffix if the base name
 * already exists in the user's vault list.
 *
 * Algorithm: tries baseName, then baseName (2), (3), ... up to (99).
 * Falls back to a timestamp suffix if all numeric suffixes are taken.
 *
 * @param baseName - The desired vault name (from config)
 * @param existingNames - Array of vault names the user already has
 * @returns A unique vault name
 */
export function deduplicateVaultName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) {
    return baseName
  }

  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseName} (${String(i)})`
    if (!existingNames.includes(candidate)) {
      return candidate
    }
  }

  // Fallback: Timestamp suffix
  return `${baseName} (${String(Date.now())})`
}

// --- Route Factory ---

/**
 * Dependencies required by the welcome vault route factory.
 */
export interface WelcomeVaultRouteDependencies {
  welcomeVaultService: IWelcomeVaultService
  userService: IUserService
  vaultService: IVaultService
  featureToggleService: IFeatureToggleService
  configService: IConfigService
  linkIndexMap: Map<string, InstanceType<typeof LinkIndexService>>
  logger: ILogger
}

/**
 * Creates a Hono app with the welcome vault creation route.
 *
 * Route:
 * - `POST /welcome-vault` — Creates a welcome vault for the authenticated user
 *
 * Features:
 * - Auth: Session-Token required (via authMiddleware applied upstream)
 * - CSRF: Protected (via csrfMiddleware applied upstream)
 * - Rate-limiting: Max 3 calls per hour per user (in-memory)
 * - Name deduplication: Suffix (2), (3), ... if vault name already exists
 *
 * @returns A Hono instance with the welcome vault route registered.
 */
export function createWelcomeVaultRoutes(deps: WelcomeVaultRouteDependencies): Hono {
  const {
    welcomeVaultService,
    userService,
    vaultService,
    featureToggleService,
    configService,
    linkIndexMap,
    logger,
  } = deps
  const app = new Hono()

  /**
   * POST /welcome-vault
   *
   * Creates a welcome vault for the authenticated user.
   * Uses the user's preferred language to determine template and vault name.
   * Applies rate limiting (max 3 per hour per user).
   *
   * Response:
   * - 201 `{ vaultId, vaultName }` on success
   * - 403 `{ code, message, timestamp }` if feature is disabled
   * - 429 `{ code, message, timestamp }` if rate-limited
   * - 500 `{ code, message, timestamp }` on internal error
   */
  app.post('/welcome-vault', async (c: Context) => {
    const session = c.get('session') as SessionContext | undefined

    if (!session) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return c.json(error, 401)
    }

    // 1. Check feature toggle
    if (!featureToggleService.isEnabled('welcome-vault')) {
      const error = createApiError('FEATURE_DISABLED', 'The welcome vault feature is currently disabled')
      return c.json(error, 403)
    }

    // 2. Check rate limit
    const rateLimitResult = checkRateLimit(session.userId)
    if (!rateLimitResult.allowed) {
      c.header('Retry-After', String(rateLimitResult.retryAfter))
      const error = createApiError('RATE_LIMITED', `Too many requests. Retry after ${String(rateLimitResult.retryAfter)} seconds`)
      return c.json(error, 429)
    }

    try {
      // 3. Get user's preferred language
      const userInfo = await userService.getUser(session.userId)
      const language: WelcomeVaultLanguage = userInfo.preferredLanguage ?? 'de'

      // 4. Determine vault name from config and deduplicate
      // Check against all system vault names since VaultService.createVault
      // validates uniqueness globally (not just per-user).
      const welcomeVaultConfig = configService.getWelcomeVaultConfig()
      const baseName = welcomeVaultConfig.name[language]
      const allVaults = await vaultService.getVaultList()
      const existingNames = allVaults.map((v) => v.name)
      const deduplicatedName = deduplicateVaultName(baseName, existingNames)

      // 5. Create welcome vault via service
      // The service internally calls VaultService.createVault with this name.
      // Deduplication ensures the name doesn't collide.
      logger.debug('Creating welcome vault', { userId: session.userId, language, vaultName: deduplicatedName })
      const result = await welcomeVaultService.createWelcomeVault(session.userId, language, deduplicatedName)

      if (!result) {
        const error = createApiError('INTERNAL_ERROR', 'Failed to create welcome vault')
        return c.json(error, 500)
      }

      // 6. Fire-and-forget: rebuild link index for the new vault
      const linkIndex = new LinkIndexService(result.storagePath, result.vaultId, result.vaultName, logger)
      linkIndexMap.set(result.vaultId, linkIndex)
      linkIndex.rebuild().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn('Failed to rebuild link index for welcome vault', { vaultId: result.vaultId, error: message })
      })

      logger.info('Welcome vault created via API', {
        userId: session.userId,
        vaultId: result.vaultId,
        vaultName: result.vaultName,
      })

      // 7. Return success
      return c.json({ vaultId: result.vaultId, vaultName: result.vaultName }, 201)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Failed to create welcome vault via API', {
        userId: session.userId,
        error: message,
      })
      const apiError = createApiError('INTERNAL_ERROR', 'Failed to create welcome vault')
      return c.json(apiError, 500)
    }
  })

  return app
}
