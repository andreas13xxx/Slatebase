/**
 * Central rate limit for authenticated (session) write requests.
 *
 * Until this module existed only login and a handful of routes carried their own limit; a
 * hijacked or CSRF-driven session could hammer every other state-changing endpoint without
 * bound. This middleware closes that gap in ONE place:
 *
 * - a default bucket for every POST/PUT/PATCH/DELETE on `/api/v1/*`, keyed by `session.userId`;
 * - a higher, separate bucket for the editor autosave (`PUT /vaults/:id/files`);
 * - a declarative table ({@link EXPENSIVE_ROUTE_RULES}) of stricter limits for costly or
 *   dangerous routes. A request matching table rules is checked against those IN ADDITION to
 *   its default/autosave bucket; the first blocked bucket decides.
 *
 * Routes that already own a limit (login, password change, MCP, chat, proxy, transcription,
 * welcome vault) are exempt so requests are not counted twice.
 *
 * Mode (`SLATEBASE_WRITE_RATE_LIMIT_MODE`): `log-only` (default) counts and logs "would block"
 * (throttled to one warning per user and bucket per minute) but lets the request through; `enforce` answers 429; `off` disables the middleware.
 *
 * Single-process by design (see AGENTS.md): the counters live in memory.
 */

import type { Context, Next } from 'hono'
import type { SessionContext } from './index.js'
import type { ILogger } from '../logger/index.js'
import { SlidingWindowRateLimiter } from '../shared/sliding-window-rate-limiter.js'

/** Operating mode of the middleware. */
export type WriteRateLimitMode = 'enforce' | 'log-only' | 'off'

/** Mode used when the environment variable is unset or invalid. */
export const DEFAULT_WRITE_RATE_LIMIT_MODE: WriteRateLimitMode = 'log-only'

/** Default bucket: writes per user per minute. Estimate, to be validated with log-only data. */
export const DEFAULT_WRITE_LIMIT = { limit: 600, windowMs: 60_000 } as const

/** Autosave bucket (`PUT /vaults/:id/files`): ~40/min per tab, many tabs/plugins. */
export const AUTOSAVE_WRITE_LIMIT = { limit: 1500, windowMs: 60_000 } as const

const MINUTE = 60_000

/** log-only: at most one warning per user and bucket set within this interval. */
const LOG_ONLY_WARN_INTERVAL_MS = MINUTE

/** A stricter limit for a set of routes; all matching routes share one bucket per user. */
export interface RouteRateRule {
  /** Short name used in logs. */
  name: string
  /** HTTP methods the rule applies to. */
  methods: readonly string[]
  /** Matches the full request path (including `/api/v1`). */
  pattern: RegExp
  /** Requests allowed per window and user. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

const V = String.raw`/api/v1/vaults/[^/]+`

/**
 * Costly or dangerous routes. Paths verified against the mounts in `index.ts`:
 * plugin store routes are mounted both per vault and globally (`/plugin-store`),
 * themes only per vault for installs.
 */
export const EXPENSIVE_ROUTE_RULES: readonly RouteRateRule[] = [
  {
    name: 'sync-now',
    methods: ['POST'],
    pattern: new RegExp(`^${V}/(?:git-sync/remotes/[^/]+/sync-now|mail-import/[^/]+/import-now)$`),
    limit: 6,
    windowMs: MINUTE,
  },
  {
    name: 'plugin-theme-install',
    methods: ['POST'],
    pattern: new RegExp(
      `^(?:${V}/plugins|/api/v1/plugin-store)(?:/store-install|/update-all|/[^/]+/update)?$` +
        `|^${V}/theme-store/install$|^/api/v1/theme-store/install$`,
    ),
    limit: 10,
    windowMs: 10 * MINUTE,
  },
  {
    name: 'check-updates',
    methods: ['POST'],
    pattern: new RegExp(`^(?:${V}/plugins|/api/v1/plugin-store)/check-updates$`),
    limit: 6,
    windowMs: 10 * MINUTE,
  },
  {
    name: 'vault-destructive',
    methods: ['DELETE', 'POST', 'PUT'],
    pattern: new RegExp(`^${V}$|^${V}/transfer$|^${V}/shares(?:/[^/]+)?$`),
    limit: 10,
    windowMs: 15 * MINUTE,
  },
  {
    name: 'admin-users',
    methods: ['POST', 'PUT', 'DELETE'],
    pattern: /^\/api\/v1\/admin\/(?:users|users\/[^/]+(?:\/(?:role|password|suspend|unsuspend))?|restart)$/,
    limit: 20,
    windowMs: 15 * MINUTE,
  },
  {
    name: 'import-upload',
    methods: ['POST'],
    pattern: new RegExp(`^${V}/(?:import/file|import/folder|upload)$`),
    limit: 30,
    windowMs: MINUTE,
  },
  {
    name: 'replace',
    methods: ['POST'],
    pattern: new RegExp(`^${V}/replace$`),
    limit: 20,
    windowMs: MINUTE,
  },
  {
    name: 'search',
    // HEAD is answered by the GET handler, so it must not bypass the rule.
    methods: ['GET', 'HEAD'],
    pattern: new RegExp(`^${V}/search$|^/api/v1/search$`),
    limit: 240,
    windowMs: MINUTE,
  },
  {
    name: 'generate-ssh-key',
    methods: ['POST'],
    pattern: new RegExp(`^${V}/git-sync/generate-ssh-key$`),
    limit: 5,
    windowMs: 15 * MINUTE,
  },
  {
    name: 'mail-send',
    methods: ['PUT', 'POST'],
    pattern: /^\/api\/v1\/(?:users\/me\/email|admin\/account-settings\/test)$/,
    limit: 5,
    windowMs: 15 * MINUTE,
  },
  {
    name: 'chat-create',
    methods: ['POST'],
    pattern: /^\/api\/v1\/chat\/conversations$/,
    limit: 30,
    windowMs: 10 * MINUTE,
  },
  {
    name: 'mcp-token-revoke',
    methods: ['DELETE'],
    pattern: /^\/api\/v1\/mcp\/tokens\/[^/]+$/,
    limit: 20,
    windowMs: 10 * MINUTE,
  },
  {
    name: 'admin-config',
    methods: ['PUT'],
    pattern: /^\/api\/v1\/admin\/config$/,
    limit: 20,
    windowMs: 15 * MINUTE,
  },
  {
    name: 'passkeys',
    methods: ['POST', 'PUT', 'DELETE'],
    pattern: /^\/api\/v1\/(?:auth\/passkey\/register\/(?:options|verify)|users\/me\/passkeys\/[^/]+|admin\/users\/[^/]+\/passkeys)$/,
    limit: 20,
    windowMs: 15 * MINUTE,
  },
  {
    name: 'public-share-regenerate',
    methods: ['POST'],
    pattern: new RegExp(`^${V}/public-shares/[^/]+/regenerate$`),
    limit: 10,
    windowMs: 15 * MINUTE,
  },
]

/** Methods counted by the default bucket. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Autosave route: gets its own, higher bucket instead of the default one. */
const AUTOSAVE_PATTERN = /^\/api\/v1\/vaults\/[^/]+\/files$/

/**
 * Write routes that carry their own limit (or their own auth) and are therefore not counted
 * here: login, password change, MCP transport + token creation, chat messages, plugin proxy,
 * transcription, welcome vault. Everything else under `/mcp` and `/chat` (token revocation,
 * conversation creation, leaving) is counted again.
 */
const EXEMPT_PATTERNS: readonly RegExp[] = [
  /^\/api\/v1\/auth\/login$/,
  /^\/api\/v1\/users\/me\/password$/,
  /^\/api\/v1\/mcp$/,
  /^\/api\/v1\/mcp\/tokens$/,
  /^\/api\/v1\/chat\/conversations\/[^/]+\/messages$/,
  /^\/api\/v1\/proxy$/,
  /^\/api\/v1\/vaults\/[^/]+\/transcribe$/,
  /^\/api\/v1\/welcome-vault$/,
]

/**
 * Parses the mode from an environment value.
 * @param value - Raw value of `SLATEBASE_WRITE_RATE_LIMIT_MODE`.
 * @returns The mode; the default for unset or unknown values.
 */
export function parseWriteRateLimitMode(value: string | undefined): WriteRateLimitMode {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'enforce' || normalized === 'log-only' || normalized === 'off') {
    return normalized
  }
  return DEFAULT_WRITE_RATE_LIMIT_MODE
}

/**
 * Warns about an unusable mode value so a typo does not silently change behaviour.
 * @param value - Raw value of `SLATEBASE_WRITE_RATE_LIMIT_MODE`.
 * @param logger - Logger for the warning.
 * @returns The effective mode (same as {@link parseWriteRateLimitMode}).
 */
export function resolveWriteRateLimitMode(value: string | undefined, logger: ILogger): WriteRateLimitMode {
  const mode = parseWriteRateLimitMode(value)
  const raw = value?.trim()
  if (raw !== undefined && raw !== '' && raw.toLowerCase() !== mode) {
    logger.warn('Invalid SLATEBASE_WRITE_RATE_LIMIT_MODE, falling back to default', {
      value: raw,
      fallback: mode,
      allowed: ['enforce', 'log-only', 'off'],
    })
  }
  return mode
}

/** Options for {@link createSessionWriteRateLimit}. */
export interface SessionWriteRateLimitOptions {
  /** Operating mode. */
  mode: WriteRateLimitMode
  /** Logger for "would block" / "blocked" entries. */
  logger: ILogger
  /** Override of the default bucket (tests). */
  defaultLimit?: { limit: number; windowMs: number }
  /** Override of the autosave bucket (tests). */
  autosaveLimit?: { limit: number; windowMs: number }
  /** Override of the route rules (tests). */
  rules?: readonly RouteRateRule[]
}

/** The middleware plus a shutdown hook. */
export interface SessionWriteRateLimit {
  /** Hono middleware; mount behind auth and CSRF. */
  middleware: (c: Context, next: Next) => Promise<Response | void>
  /** Stops the cleanup timers of all limiters. */
  destroy: () => void
}

interface Bucket {
  name: string
  limiter: SlidingWindowRateLimiter
}

/**
 * Creates the session write rate-limit middleware.
 * @param options - Mode, logger and optional limit overrides.
 * @returns The middleware and a `destroy()` for graceful shutdown.
 */
export function createSessionWriteRateLimit(options: SessionWriteRateLimitOptions): SessionWriteRateLimit {
  const { mode, logger } = options
  const rules = options.rules ?? EXPENSIVE_ROUTE_RULES
  const def = options.defaultLimit ?? DEFAULT_WRITE_LIMIT
  const auto = options.autosaveLimit ?? AUTOSAVE_WRITE_LIMIT

  const defaultBucket: Bucket = { name: 'default', limiter: new SlidingWindowRateLimiter(def.limit, def.windowMs) }
  const autosaveBucket: Bucket = { name: 'autosave', limiter: new SlidingWindowRateLimiter(auto.limit, auto.windowMs) }
  const ruleBuckets = rules.map((rule) => ({
    rule,
    bucket: { name: rule.name, limiter: new SlidingWindowRateLimiter(rule.limit, rule.windowMs) } as Bucket,
  }))

  // log-only: one warning per user + bucket set and minute, with a count of the suppressed ones.
  const lastWarn = new Map<string, { at: number; suppressed: number }>()
  const shouldWarn = (key: string): number | undefined => {
    const now = Date.now()
    const entry = lastWarn.get(key)
    if (entry !== undefined && now - entry.at < LOG_ONLY_WARN_INTERVAL_MS) {
      entry.suppressed++
      return undefined
    }
    const suppressed = entry?.suppressed ?? 0
    for (const [k, e] of lastWarn) if (now - e.at >= LOG_ONLY_WARN_INTERVAL_MS) lastWarn.delete(k)
    lastWarn.set(key, { at: now, suppressed: 0 })
    return suppressed
  }

  const middleware = async (c: Context, next: Next): Promise<Response | void> => {
    if (mode === 'off') return next()

    const method = c.req.method
    const path = c.req.path
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) return next()
    if (EXEMPT_PATTERNS.some((p) => p.test(path))) return next()

    const buckets: Bucket[] = []
    if (WRITE_METHODS.has(method)) {
      buckets.push(AUTOSAVE_PATTERN.test(path) && method === 'PUT' ? autosaveBucket : defaultBucket)
    }
    for (const { rule, bucket } of ruleBuckets) {
      if (rule.methods.includes(method) && rule.pattern.test(path)) buckets.push(bucket)
    }
    if (buckets.length === 0) return next()

    const key = session.userId
    const blocked = buckets
      .map((b) => ({ b, result: b.limiter.checkLimit(key) }))
      .filter((x) => !x.result.allowed)

    if (blocked.length > 0) {
      const retryAfter = Math.max(1, ...blocked.map((x) => x.result.retryAfter))
      const names = blocked.map((x) => x.b.name)
      const suppressed = mode === 'enforce' ? 0 : shouldWarn(`${key}|${names.join(',')}`)
      if (suppressed !== undefined) {
        logger.warn(mode === 'enforce' ? 'Write rate limit: blocked' : 'Write rate limit: would block', {
          userId: key,
          method,
          path,
          buckets: names,
          retryAfter,
          mode,
          ...(mode === 'log-only' ? { suppressedSinceLastWarning: suppressed } : {}),
        })
      }
      if (mode === 'enforce') {
        // Blocked requests are not recorded, so the window drains while the client backs off.
        c.header('Retry-After', String(retryAfter))
        return c.json(
          {
            code: 'RATE_LIMITED',
            message: `Too many requests. Retry after ${retryAfter} seconds`,
            timestamp: new Date().toISOString(),
          },
          429,
        )
      }
    }

    for (const b of buckets) b.limiter.recordRequest(key)
    return next()
  }

  const destroy = (): void => {
    defaultBucket.limiter.destroy()
    autosaveBucket.limiter.destroy()
    for (const { bucket } of ruleBuckets) bucket.limiter.destroy()
  }

  return { middleware, destroy }
}
