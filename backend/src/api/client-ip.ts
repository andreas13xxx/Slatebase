/**
 * Centralized client IP extraction with trusted proxy support.
 *
 * When Slatebase runs behind a reverse proxy (Nginx, Caddy, Traefik),
 * the direct connection IP is the proxy's address. The real client IP
 * is forwarded in the `X-Forwarded-For` header.
 *
 * This module only trusts `X-Forwarded-For` if the direct connection
 * comes from a configured trusted proxy address. Otherwise, it uses
 * the socket's remote address to prevent header spoofing.
 */

import type { Context, Next } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TrustedProxyConfig {
  /** List of trusted proxy IP addresses or CIDR ranges. Empty = trust none. */
  readonly trustedProxies: readonly string[]
}

// ─── CIDR Matching ───────────────────────────────────────────────────────────

/**
 * Parses a CIDR notation string into a base address (as number) and mask.
 * Supports IPv4 only. Returns null for invalid input.
 */
function parseCidr(cidr: string): { base: number; mask: number } | null {
  const parts = cidr.split('/')
  const ip = parts[0]
  const prefixStr = parts[1]

  if (ip === undefined) return null

  const ipNum = ipv4ToNumber(ip)
  if (ipNum === null) return null

  if (prefixStr === undefined) {
    // No prefix = exact match (/32)
    return { base: ipNum, mask: 0xffffffff }
  }

  const prefix = parseInt(prefixStr, 10)
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  return { base: (ipNum & mask) >>> 0, mask }
}

/**
 * Converts an IPv4 address string to a 32-bit unsigned integer.
 * Returns null for invalid addresses.
 */
function ipv4ToNumber(ip: string): number | null {
  const octets = ip.split('.')
  if (octets.length !== 4) return null

  let result = 0
  for (const octet of octets) {
    const num = parseInt(octet, 10)
    if (isNaN(num) || num < 0 || num > 255) return null
    result = (result << 8) | num
  }
  return result >>> 0
}

/**
 * Checks if an IP address matches a trusted proxy entry.
 * Supports exact match and CIDR notation (IPv4 only).
 * IPv6 loopback (::1) is matched against 127.0.0.1 for convenience.
 */
function matchesTrustedProxy(clientIp: string, proxyEntry: string): boolean {
  // Normalize IPv6 loopback to IPv4
  const normalizedIp = clientIp === '::1' ? '127.0.0.1' : clientIp

  // Special case: wildcard trusts everything
  if (proxyEntry === '*') return true

  // Try CIDR match
  const cidr = parseCidr(proxyEntry)
  if (cidr === null) {
    // Not a valid CIDR — try exact string match
    const normalizedEntry = proxyEntry === '::1' ? '127.0.0.1' : proxyEntry
    return normalizedIp === normalizedEntry
  }

  const ipNum = ipv4ToNumber(normalizedIp)
  if (ipNum === null) return false

  return ((ipNum & cidr.mask) >>> 0) === cidr.base
}

// ─── IP Extraction ───────────────────────────────────────────────────────────

/**
 * Extracts the real client IP address from a Hono request context.
 *
 * Logic:
 * 1. Get the direct connection IP from the socket (via getConnInfo).
 * 2. If the direct IP is in the trustedProxies list, parse X-Forwarded-For
 *    and return the leftmost (client) IP.
 * 3. If not trusted, return the direct connection IP (ignoring forwarded headers).
 * 4. Fallback: '0.0.0.0' if no IP can be determined.
 *
 * @param c - Hono request context
 * @param config - Trusted proxy configuration
 * @returns The resolved client IP address
 */
export function getClientIp(c: Context, config: TrustedProxyConfig): string {
  // Get direct connection IP from socket
  let remoteIp: string | undefined
  try {
    const connInfo = getConnInfo(c)
    remoteIp = connInfo.remote.address ?? undefined
  } catch {
    // getConnInfo may throw if not running on Node.js HTTP server (e.g., in tests)
    remoteIp = undefined
  }

  // If we have trusted proxies configured and the direct connection is from one
  if (config.trustedProxies.length > 0 && remoteIp !== undefined) {
    const isTrusted = config.trustedProxies.some((proxy) => matchesTrustedProxy(remoteIp, proxy))

    if (isTrusted) {
      // Trust X-Forwarded-For — take the leftmost IP (original client)
      const forwarded = c.req.header('X-Forwarded-For')
      if (forwarded !== undefined && forwarded.length > 0) {
        const firstIp = forwarded.split(',')[0]?.trim()
        if (firstIp !== undefined && firstIp.length > 0) {
          return firstIp
        }
      }

      // Fallback to X-Real-IP if X-Forwarded-For is absent
      const realIp = c.req.header('X-Real-IP')
      if (realIp !== undefined && realIp.length > 0) {
        return realIp.trim()
      }
    }
  }

  // Not behind a trusted proxy — use direct connection IP
  if (remoteIp !== undefined && remoteIp.length > 0) {
    return remoteIp
  }

  return '0.0.0.0'
}

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * Creates a Hono middleware that resolves the client IP and sets it on the context.
 * All downstream handlers can access it via `c.get('clientIp')`.
 *
 * @param config - Trusted proxy configuration
 * @returns A Hono middleware function
 */
export function createClientIpMiddleware(
  config: TrustedProxyConfig,
): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next): Promise<void> => {
    const ip = getClientIp(c, config)
    c.set('clientIp', ip)
    await next()
  }
}
