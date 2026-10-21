// ─── Guarded fetch ────────────────────────────────────────────────────────────
//
// Outgoing HTTP for features that fetch third-party files (the theme store). Unlike a bare `fetch` it
//  - only talks to an explicit host allowlist, re-checked on every redirect hop (`redirect: 'manual'`),
//  - stops reading as soon as `maxBytes` is exceeded instead of buffering the whole body first,
//  - has a timeout and a redirect limit,
//  - never sends credentials: no Authorization or cookie headers, whatever the caller's environment holds.

/** Why a guarded request failed. A failed request is "unknown", never "empty" — callers must not treat it as 404. */
export type GuardedFetchErrorKind = 'host-not-allowed' | 'too-many-redirects' | 'too-large' | 'timeout' | 'network'

/** Thrown when a guarded request could not be completed (as opposed to completing with a non-2xx status). */
export class GuardedFetchError extends Error {
  constructor(
    public readonly kind: GuardedFetchErrorKind,
    public readonly url: string,
    detail?: string,
  ) {
    super(`Guarded fetch failed (${kind}) for ${url}${detail ? `: ${detail}` : ''}`)
    this.name = 'GuardedFetchError'
  }
}

/** Options for {@link guardedFetch}. */
export interface GuardedFetchOptions {
  /** `host[:port]` values the request and every redirect hop may target; the default port is written without one. */
  allowedHosts: ReadonlySet<string>
  /** Maximum body size in bytes; exceeding it aborts the read. */
  maxBytes: number
  /** Allowed URL protocols. Defaults to `['https:']`; tests use a local `http:` server. */
  protocols?: readonly string[]
  /** Request timeout in milliseconds (default 30 s). */
  timeoutMs?: number
  /** Maximum number of redirects to follow (default 5). */
  maxRedirects?: number
  /** `Accept` header value. */
  accept?: string
  /** `User-Agent` header value. */
  userAgent?: string
}

/** Result of a completed request. `body` is empty for non-2xx statuses. */
export interface GuardedFetchResult {
  status: number
  headers: Headers
  body: Buffer
  /** URL that served the response, after redirects. */
  finalUrl: string
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_REDIRECTS = 5

function checkUrl(url: string, options: GuardedFetchOptions): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new GuardedFetchError('host-not-allowed', url, 'invalid URL')
  }
  const protocols = options.protocols ?? ['https:']
  if (!protocols.includes(parsed.protocol) || !options.allowedHosts.has(parsed.host)) {
    throw new GuardedFetchError('host-not-allowed', url)
  }
  return parsed
}

async function readLimited(response: Response, url: string, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new GuardedFetchError('too-large', url, `${declared} bytes declared, limit ${maxBytes}`)
  }
  if (!response.body) return Buffer.alloc(0)

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new GuardedFetchError('too-large', url, `more than ${maxBytes} bytes`)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks, total)
}

/**
 * GETs `url` under the guards described at the top of this file.
 *
 * @throws GuardedFetchError for a disallowed host/protocol (also on a redirect), too many redirects, a body over
 *         `maxBytes`, a timeout or a network failure. A completed response with any status is returned, not thrown.
 */
export async function guardedFetch(url: string, options: GuardedFetchOptions): Promise<GuardedFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const headers: Record<string, string> = { 'User-Agent': options.userAgent ?? 'Slatebase/1.0' }
  if (options.accept) headers['Accept'] = options.accept

  const signal = AbortSignal.timeout(timeoutMs)
  let current = checkUrl(url, options).toString()

  for (let hop = 0; ; hop++) {
    let response: Response
    try {
      response = await fetch(current, { headers, signal, redirect: 'manual' })
    } catch (error: unknown) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new GuardedFetchError('timeout', current)
      }
      throw new GuardedFetchError('network', current, error instanceof Error ? error.message : String(error))
    }

    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined)
      if (hop >= maxRedirects) throw new GuardedFetchError('too-many-redirects', current)
      current = checkUrl(new URL(location, current).toString(), options).toString()
      continue
    }

    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel().catch(() => undefined)
      return { status: response.status, headers: response.headers, body: Buffer.alloc(0), finalUrl: current }
    }

    try {
      const body = await readLimited(response, current, options.maxBytes)
      return { status: response.status, headers: response.headers, body, finalUrl: current }
    } catch (error: unknown) {
      if (error instanceof GuardedFetchError) throw error
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new GuardedFetchError('timeout', current)
      }
      throw new GuardedFetchError('network', current, error instanceof Error ? error.message : String(error))
    }
  }
}
