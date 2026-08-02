/**
 * Proxy routes module — CORS-free HTTP request proxy for Obsidian plugin compatibility.
 *
 * Obsidian's `requestUrl()` API allows plugins to make HTTP requests without CORS restrictions.
 * Since Slatebase is a web app, plugins cannot bypass browser CORS. This proxy route accepts
 * requests from authenticated users and forwards them server-side.
 *
 * Security:
 * - Requires authentication (session token)
 * - URL validated against an allowlist (global config + per-plugin networkAllowlist)
 * - Request body size limited (max 10 MB)
 * - Response body size limited (max 50 MB)
 * - Private/internal IPs blocked (127.x, 10.x, 192.168.x, 172.16-31.x, ::1)
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
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiError {
  code: string
  message: string
  timestamp: string
}

/** Dependencies for the proxy routes. */
export interface ProxyRoutesDeps {
  logger: ILogger
  /** Global allowlist of URL patterns (from server config). Empty = all allowed. */
  allowedOrigins: string[]
  /** Function to get per-plugin allowlists from the plugin registry. */
  getPluginAllowlists?: () => string[]
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createApiError(code: string, message: string): ApiError {
  return { code, message, timestamp: new Date().toISOString() }
}

/**
 * Check if a URL's hostname resolves to a private/internal IP range.
 * Blocks SSRF attacks against internal services.
 */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    const hostname = url.hostname

    // Block obvious private addresses
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true
    if (hostname.startsWith('10.')) return true
    if (hostname.startsWith('192.168.')) return true
    if (hostname.startsWith('169.254.')) return true
    if (hostname.startsWith('0.')) return true

    // Block 172.16.0.0 - 172.31.255.255
    const parts = hostname.split('.')
    if (parts[0] === '172') {
      const second = parseInt(parts[1] ?? '0', 10)
      if (second >= 16 && second <= 31) return true
    }

    return false
  } catch {
    return true // Invalid URL = block
  }
}

/**
 * Check if a URL is allowed by the combined allowlist.
 * If the allowlist is empty, all non-private URLs are allowed.
 * Allowlist entries are domain patterns (e.g. "*.couchdb.example.com", "fonts.googleapis.com").
 */
function isUrlAllowed(urlStr: string, allowlist: string[]): boolean {
  // If no allowlist configured, allow all non-private URLs
  if (allowlist.length === 0) return true

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

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app with the proxy route.
 * Requires authentication middleware to be applied upstream.
 */
export function createProxyRoutes(deps: ProxyRoutesDeps): Hono {
  const { logger, allowedOrigins, getPluginAllowlists } = deps
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

    // Security: Block private/internal URLs (SSRF protection)
    if (isPrivateUrl(url)) {
      logger.warn('Proxy request blocked: private URL', { userId: session.userId, url })
      return c.json(createApiError('PROXY_BLOCKED', 'Requests to private/internal addresses are not allowed'), 403)
    }

    // Security: Check against allowlist
    const combinedAllowlist = [
      ...allowedOrigins,
      ...(getPluginAllowlists?.() ?? []),
    ]
    if (!isUrlAllowed(url, combinedAllowlist)) {
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

    try {
      const response = await fetch(url, {
        method,
        headers: outgoingHeaders,
        body: (method !== 'GET' && method !== 'HEAD' && body) ? Buffer.from(body, 'utf-8') : null,
        signal: controller.signal,
        redirect: 'follow',
      })

      clearTimeout(timeoutId)

      // Read response body (with size limit)
      const responseBuffer = await response.arrayBuffer()
      if (responseBuffer.byteLength > MAX_RESPONSE_BODY) {
        return c.json(createApiError('RESPONSE_TOO_LARGE', 'Response body exceeds 50 MB limit'), 502)
      }

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
        const base64 = Buffer.from(responseBuffer).toString('base64')
        return c.json({
          status: response.status,
          headers: responseHeaders,
          arrayBuffer: base64,
        }, 200)
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('Proxy request timed out', { userId: session.userId, url })
        return c.json(createApiError('PROXY_TIMEOUT', 'Request timed out after 30 seconds'), 504)
      }

      const message = error instanceof Error ? error.message : String(error)
      logger.error('Proxy request failed', { userId: session.userId, url, error: message })
      return c.json(createApiError('PROXY_ERROR', 'Failed to fetch the remote URL'), 502)
    }
  })

  return app
}
