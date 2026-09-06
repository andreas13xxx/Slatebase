/**
 * Session cookie constants and Secure-flag resolution.
 */

/** Name of the HttpOnly cookie carrying the raw session token. */
export const SESSION_COOKIE_NAME = 'slatebase_session'

/**
 * Resolves whether the session cookie should carry the `Secure` attribute.
 *
 * `'true'`/`'false'` are an explicit operator override (e.g. a pure-HTTP LAN
 * deployment that would otherwise never see the cookie again). `'auto'` (the
 * default) defers to whether the request actually arrived over HTTPS.
 */
export function resolveCookieSecure(mode: 'auto' | 'true' | 'false', isHttps: boolean): boolean {
  if (mode === 'true') return true
  if (mode === 'false') return false
  return isHttps
}
