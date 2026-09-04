/**
 * Proxy routes module — CORS-free HTTP request proxy for Obsidian plugin compatibility.
 *
 * Obsidian's `requestUrl()` API allows plugins to make HTTP requests without CORS restrictions.
 * Since Slatebase is a web app, plugins cannot bypass browser CORS. This proxy route accepts
 * requests from authenticated users and forwards them server-side.
 *
 * Security:
 * - Requires authentication (session token)
 * - Default-deny: an empty `allowedOrigins` disables the route entirely (`PROXY_NOT_CONFIGURED`) —
 *   there is no "allow everything public" fallback, an admin must opt in per origin
 * - URL validated against `allowedOrigins` (`SLATEBASE_PROXY_ALLOWED_ORIGINS`)
 * - Rate-limited per user (`rateLimiter` — 60 requests/minute, configured where this
 *   module is wired up in `index.ts`)
 * - Request body size limited (max 10 MB)
 * - Response body size limited (max 50 MB), enforced while streaming — the response is never
 *   buffered in full before the limit is checked
 * - Private/internal IPs blocked (127.x, 10.x, 192.168.x, 172.16-31.x, ::1)
 * - DNS-rebinding protection: the hostname is resolved and validated once, and the resulting
 *   IP is pinned for the actual connection via a per-request `undici.Agent` with a custom
 *   `connect.lookup` — closing the window between validation and `fetch()` doing its own,
 *   unpinned resolution
 * - Timeout: 30 seconds
 *
 * Route:
 *   POST /api/v1/proxy — Forward an HTTP request
 *
 * @module proxy-routes
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import dns from 'node:dns/promises'
import net from 'node:net'
import type { LookupFunction } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { SlidingWindowRateLimiter } from '../shared/sliding-window-rate-limiter.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiError {
  code: string
  message: string
  timestamp: string
}

/** Dependencies for the proxy routes. */
export interface ProxyRoutesDeps {
  logger: ILogger
  /** Allowlist of URL patterns (from `SLATEBASE_PROXY_ALLOWED_ORIGINS`). Empty = proxy disabled. */
  allowedOrigins: string[]
  /** Per-user rate limiter — shared instance so `destroy()` can be called during shutdown. */
  rateLimiter: SlidingWindowRateLimiter
}

// ─── Validation ──────────────────────────────────────────────────────────────

const proxyRequestSchema = z.object({
  url: z.string().url().max(2048),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).optional().default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  contentType: z.string().optional(),
})

/** Max request body size in bytes (10 MB). */
const MAX_REQUEST_BODY = 10 * 1024 * 1024

/** Max response body size in bytes (50 MB). */
const MAX_RESPONSE_BODY = 50 * 1024 * 1024

/** Request timeout in milliseconds. */
const PROXY_TIMEOUT_MS = 30_000

/** Maximum number of redirects the proxy will follow before giving up. */
const MAX_PROXY_REDIRECTS = 5

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createApiError(code: string, message: string): ApiError {
  return { code, message, timestamp: new Date().toISOString() }
}

/** Thrown when a URL (initial or post-redirect) is blocked by SSRF/allowlist checks. */
class ProxyBlockedError extends Error {
  constructor(public readonly apiCode: string, message: string) {
    super(message)
    this.name = 'ProxyBlockedError'
  }
}

/** Thrown when a streamed response body exceeds `MAX_RESPONSE_BODY`. */
class ProxyResponseTooLargeError extends Error {
  constructor() {
    super('Response body exceeds 50 MB limit')
    this.name = 'ProxyResponseTooLargeError'
  }
}

/** Checks whether a raw IP address falls within a private/loopback/link-local IPv4 range. */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true
  const [a, b] = parts as [number, number, number, number]
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 10) return true // 10.0.0.0/8
  if (a === 0) return true // 0.0.0.0/8
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 carrier-grade NAT
  if (a >= 224) return true // multicast (224-239) and reserved (240-255)
  return false
}

/** Checks whether a raw IP address falls within a private/loopback/link-local IPv6 range. */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === '::1' || normalized === '::') return true
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true // fe80::/10 link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true // fc00::/7 unique local
  // IPv4-mapped IPv6 addresses, e.g. ::ffff:127.0.0.1
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)
  if (mapped?.[1]) return isPrivateIPv4(mapped[1])
  return false
}

function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip)
  if (family === 4) return isPrivateIPv4(ip)
  if (family === 6) return isPrivateIPv6(ip)
  return true // Not a recognizable IP — block defensively
}

/** A validated, resolved connection target: the exact IP to pin the socket to. */
interface SafeAddress {
  ip: string
  family: 4 | 6
}

/**
 * Resolves a URL's hostname and validates that it (and, for a DNS name, every address it
 * resolves to) is not a private/internal/loopback address. Returns the specific address to
 * pin the actual connection to, or `null` if the URL is blocked.
 *
 * Resolving here — once — and reusing the result for the connection itself (instead of
 * letting `fetch()` resolve again independently) is what closes the DNS-rebinding window:
 * a hostname that resolves to a public IP at validation time and a private one moments later
 * (e.g. a low-TTL record swapped between the two lookups) can no longer slip through.
 */
async function resolveSafeAddress(urlStr: string): Promise<SafeAddress | null> {
  let hostname: string
  try {
    hostname = new URL(urlStr).hostname
  } catch {
    return null // Invalid URL = block
  }

  if (hostname.toLowerCase() === 'localhost') return null

  // Literal IP in the URL — no DNS lookup needed, pin to itself
  const literalFamily = net.isIP(hostname)
  if (literalFamily !== 0) {
    if (isPrivateIp(hostname)) return null
    return { ip: hostname, family: literalFamily as 4 | 6 }
  }

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true })
    if (records.length === 0) return null
    if (records.some((record) => isPrivateIp(record.address))) return null
    const chosen = records[0]
    if (chosen === undefined) return null
    return { ip: chosen.address, family: chosen.family as 4 | 6 }
  } catch {
    return null // Unresolvable hostname = block
  }
}

/**
 * Check if a URL is allowed by the allowlist. The caller guarantees the allowlist is
 * non-empty (an empty allowlist disables the whole route before this is ever reached) —
 * an empty list here is treated as deny, not allow, to fail closed defensively.
 * Allowlist entries are domain patterns (e.g. "*.couchdb.example.com", "fonts.googleapis.com").
 */
function isUrlAllowed(urlStr: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false

  try {
    const url = new URL(urlStr)
    const hostname = url.hostname.toLowerCase()

    for (const pattern of allowlist) {
      const lower = pattern.toLowerCase().trim()
      if (!lower) continue

      if (lower.startsWith('*.')) {
        // Wildcard pattern: *.example.com matches sub.example.com
        const suffix = lower.slice(2)
        if (hostname === suffix || hostname.endsWith('.' + suffix)) return true
      } else {
        // Exact match
        if (hostname === lower) return true
      }
    }

    return false
  } catch {
    return false
  }
}

/** Builds a `net.LookupFunction` that ignores the requested hostname and always returns the pinned address. */
function createPinnedLookup(pinned: SafeAddress): LookupFunction {
  return (_hostname, _options, callback) => {
    callback(null, pinned.ip, pinned.family)
  }
}

/** Creates a per-hop undici Agent whose connections are pinned to a single validated IP. */
function createPinnedDispatcher(pinned: SafeAddress): Agent {
  return new Agent({ connect: { lookup: createPinnedLookup(pinned) } })
}

/**
 * Reads a fetch Response body while enforcing `maxBytes`, aborting the stream (rather than
 * buffering the whole response first) as soon as the limit is exceeded.
 */
async function readLimitedBody(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)

  const chunks: Buffer[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new ProxyResponseTooLargeError()
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with the proxy route.
 * Requires authentication middleware to be applied upstream.
 */
export function createProxyRoutes(deps: ProxyRoutesDeps): Hono {
  const { logger, allowedOrigins, rateLimiter } = deps
  const app = new Hono()

  /**
   * POST /proxy
   *
   * Forward an HTTP request server-side, bypassing browser CORS.
   * Body: { url, method?, headers?, body?, contentType? }
   * Response: { status, headers, text?, arrayBuffer? }
   */
  app.post('/proxy', async (c: Context) => {
    const session = c.get('session') as SessionContext

    if (allowedOrigins.length === 0) {
      return c.json(
        createApiError(
          'PROXY_NOT_CONFIGURED',
          'The plugin request proxy is disabled. An administrator must set SLATEBASE_PROXY_ALLOWED_ORIGINS to enable it for specific origins.',
        ),
        403,
      )
    }

    const limit = rateLimiter.checkLimit(session.userId)
    if (!limit.allowed) {
      c.header('Retry-After', String(limit.retryAfter))
      return c.json(
        createApiError('RATE_LIMITED', `Too many proxy requests. Retry after ${limit.retryAfter} seconds`),
        429,
      )
    }
    rateLimiter.recordRequest(session.userId)

    // Parse request body
    let rawBody: unknown
    try {
      rawBody = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = proxyRequestSchema.safeParse(rawBody)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const message = firstIssue !== undefined ? firstIssue.message : 'Invalid proxy request'
      return c.json(createApiError('VALIDATION_ERROR', message), 400)
    }

    const { url, method, headers, body, contentType } = result.data

    // Ensure Content-Type is set from headers if contentType field is missing
    const effectiveContentType = contentType
      ?? (headers ? (headers['Content-Type'] ?? headers['content-type']) : undefined)

    // Security: Resolve + validate the initial URL, and check it against the allowlist
    const initialAddress = await resolveSafeAddress(url)
    if (initialAddress === null) {
      logger.warn('Proxy request blocked: private URL', { userId: session.userId, url })
      return c.json(createApiError('PROXY_BLOCKED', 'Requests to private/internal addresses are not allowed'), 403)
    }
    if (!isUrlAllowed(url, allowedOrigins)) {
      logger.warn('Proxy request blocked: URL not in allowlist', { userId: session.userId, url })
      return c.json(createApiError('PROXY_BLOCKED', 'URL is not in the allowed origins list'), 403)
    }

    // Security: Check body size
    if (body && Buffer.byteLength(body, 'utf-8') > MAX_REQUEST_BODY) {
      return c.json(createApiError('PAYLOAD_TOO_LARGE', 'Request body exceeds 10 MB limit'), 413)
    }

    // Build outgoing request
    const outgoingHeaders: Record<string, string> = {}
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        // Strip security-sensitive headers that must not leak to external servers
        const lowerKey = key.toLowerCase()
        if (lowerKey === 'host' || lowerKey === 'cookie') continue
        // Strip the Slatebase session token (Bearer) but forward other auth headers
        // (e.g. Basic Auth credentials for CouchDB that the plugin explicitly set)
        if (lowerKey === 'authorization' && value.startsWith('Bearer ')) continue
        // Skip content-type from headers map — we set it explicitly below
        if (lowerKey === 'content-type') continue
        outgoingHeaders[key] = value
      }
    }
    if (effectiveContentType) {
      outgoingHeaders['Content-Type'] = effectiveContentType
    }

    // Execute the proxied request with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)
    const dispatchers: Agent[] = []

    try {
      let currentUrl = url
      let currentAddress = initialAddress
      let response: Response

      // Follow redirects manually, re-validating (and re-pinning) each hop against the
      // SSRF/allowlist checks above — a compromised or malicious server could otherwise
      // redirect the request to a private address or an off-allowlist origin after the
      // initial check, or to a hostname whose DNS answer changes between hops.
      for (let redirectCount = 0; ; redirectCount++) {
        if (redirectCount > MAX_PROXY_REDIRECTS) {
          throw new ProxyBlockedError('PROXY_BLOCKED', 'Too many redirects')
        }

        const dispatcher = createPinnedDispatcher(currentAddress)
        dispatchers.push(dispatcher)

        response = await undiciFetch(currentUrl, {
          method,
          headers: outgoingHeaders,
          body: (method !== 'GET' && method !== 'HEAD' && body) ? Buffer.from(body, 'utf-8') : null,
          signal: controller.signal,
          redirect: 'manual',
          dispatcher,
        })

        if (response.status < 300 || response.status >= 400) break

        const location = response.headers.get('location')
        if (!location) break

        const nextUrl = new URL(location, currentUrl).toString()
        const nextAddress = await resolveSafeAddress(nextUrl)
        if (nextAddress === null) {
          throw new ProxyBlockedError('PROXY_BLOCKED', 'Redirect target is a private/internal address')
        }
        if (!isUrlAllowed(nextUrl, allowedOrigins)) {
          throw new ProxyBlockedError('PROXY_BLOCKED', 'Redirect target is not in the allowed origins list')
        }
        currentUrl = nextUrl
        currentAddress = nextAddress
      }

      clearTimeout(timeoutId)

      // Read response body while streaming, enforcing the size limit as bytes arrive
      // rather than buffering the whole response before checking it.
      const responseBuffer = await readLimitedBody(response, MAX_RESPONSE_BODY)

      // Build response headers map
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      // Determine content type to decide response format
      const responseContentType = response.headers.get('content-type') ?? ''
      const isTextResponse = responseContentType.includes('text/') ||
        responseContentType.includes('application/json') ||
        responseContentType.includes('application/xml') ||
        responseContentType.includes('application/javascript')

      if (isTextResponse) {
        const text = new TextDecoder().decode(responseBuffer)
        return c.json({
          status: response.status,
          headers: responseHeaders,
          text,
        }, 200)
      } else {
        // Binary response: encode as base64
        const base64 = responseBuffer.toString('base64')
        return c.json({
          status: response.status,
          headers: responseHeaders,
          arrayBuffer: base64,
        }, 200)
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof ProxyBlockedError) {
        logger.warn('Proxy request blocked during redirect', { userId: session.userId, url, reason: error.message })
        return c.json(createApiError(error.apiCode, error.message), 403)
      }

      if (error instanceof ProxyResponseTooLargeError) {
        return c.json(createApiError('RESPONSE_TOO_LARGE', error.message), 502)
      }

      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('Proxy request timed out', { userId: session.userId, url })
        return c.json(createApiError('PROXY_TIMEOUT', 'Request timed out after 30 seconds'), 504)
      }

      const message = error instanceof Error ? error.message : String(error)
      logger.error('Proxy request failed', { userId: session.userId, url, error: message })
      return c.json(createApiError('PROXY_ERROR', 'Failed to fetch the remote URL'), 502)
    } finally {
      await Promise.all(dispatchers.map((dispatcher) => dispatcher.close().catch(() => {})))
    }
  })

  return app
}
