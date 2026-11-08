// Origin / relying-party resolution for WebAuthn and mailed links.
//
// The origin always comes from the browser-set `Origin` header and must be in
// the admin-managed `allowedOrigins` list. `Host` and `X-Forwarded-Host` are
// never consulted, so a proxy misconfiguration or a forged header cannot steer
// a passkey ceremony or a reset link to a foreign host.

export interface RelyingParty {
  origin: string
  rpId: string
}

/** HTTPS, or plain HTTP on localhost (development). */
export function isSecureOrigin(origin: string): boolean {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
}

/** Normalizes an origin string to `scheme://host[:port]`; null if it is not a plain origin. */
export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

/** True if `host` equals `parent` or is a subdomain of it (label boundary). */
export function isHostWithin(host: string, parent: string): boolean {
  return host === parent || host.endsWith(`.${parent}`)
}

/**
 * Resolves the relying party for a request origin. Returns null if the origin
 * is missing, not allowed, not secure, or incompatible with `passkeyRpId`.
 */
export function resolveRelyingParty(
  originHeader: string | undefined,
  allowedOrigins: readonly string[],
  passkeyRpId: string,
): RelyingParty | null {
  if (originHeader === undefined) return null
  const origin = normalizeOrigin(originHeader)
  if (origin === null) return null
  const allowed = allowedOrigins.map((o) => normalizeOrigin(o)).filter((o): o is string => o !== null)
  if (!allowed.includes(origin)) return null
  if (!isSecureOrigin(origin)) return null

  const hostname = new URL(origin).hostname
  const configured = passkeyRpId.trim().toLowerCase()
  if (configured === '') return { origin, rpId: hostname }
  if (!isHostWithin(hostname, configured)) return null
  return { origin, rpId: configured }
}

/**
 * Validates an admin-supplied `passkeyRpId` against the allowed origins.
 * Every allowed HTTPS origin must lie within the shared parent domain.
 */
export function validatePasskeyRpId(rpId: string, allowedOrigins: readonly string[]): string | null {
  const value = rpId.trim().toLowerCase()
  if (value === '') return null
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(value)) {
    return 'passkeyRpId must be a plain domain name'
  }
  for (const origin of allowedOrigins) {
    const normalized = normalizeOrigin(origin)
    // Only public HTTPS origins must share the parent domain; the localhost
    // development entry stays in the default list and simply gets no shared passkey.
    if (normalized === null || !normalized.startsWith('https:')) continue
    const host = new URL(normalized).hostname
    if (!isHostWithin(host, value)) {
      return `passkeyRpId "${value}" does not cover the allowed origin ${normalized}`
    }
  }
  return null
}

/**
 * Picks the base URL for mailed links: the configured `mailBaseUrl` if it is
 * an allowed origin, otherwise the first allowed HTTPS origin. Returns null if
 * none qualifies. Never derived from the request.
 */
export function resolveMailBaseUrl(mailBaseUrl: string, allowedOrigins: readonly string[]): string | null {
  const allowed = allowedOrigins.map((o) => normalizeOrigin(o)).filter((o): o is string => o !== null)
  if (mailBaseUrl.trim() !== '') {
    const configured = normalizeOrigin(mailBaseUrl)
    return configured !== null && allowed.includes(configured) ? configured : null
  }
  return allowed.find((o) => o.startsWith('https:')) ?? null
}
