/**
 * `obsidian://<action>?…` for a web app: `/obsidian?action=<action>&<param>=<value>…`.
 *
 * Plugins register handlers for such actions (`registerObsidianProtocolHandler`). The link is read
 * once before the first render, parked in `sessionStorage` so it survives the login (like a deep
 * link, see `pendingDeepLink`), and never runs by itself: the signed-in app shows the user which
 * plugin is about to act and with what, and only then calls the handler.
 *
 * @module deep-link/protocolAction
 */

/** Route of the link. */
export const PROTOCOL_ACTION_PATH = '/obsidian'

/** `sessionStorage` key. */
export const PENDING_PROTOCOL_ACTION_KEY = 'slatebase:pending-protocol-action'

/** How long a stored action stays valid. */
export const PENDING_PROTOCOL_ACTION_TTL_MS = 10 * 60 * 1000

const ACTION_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/
const MAX_PARAMS = 32
const MAX_KEY_LENGTH = 64
const MAX_VALUE_LENGTH = 4096

/** A parsed link: the action and its parameters (`action` itself is not repeated in `params`). */
export interface ProtocolActionRequest {
  action: string
  params: Record<string, string>
}

/**
 * Parses the query string of an `/obsidian` URL.
 *
 * @returns The request, or `null` when `action` is missing or malformed, or the parameters are
 *   too many or too large. Parameter keys that could reach `Object.prototype` are refused.
 */
export function parseProtocolAction(search: string): ProtocolActionRequest | null {
  const query = new URLSearchParams(search)
  const action = query.get('action')
  if (action === null || !ACTION_RE.test(action)) return null
  const params: Record<string, string> = Object.create(null) as Record<string, string>
  let count = 0
  for (const [key, value] of query) {
    if (key === 'action') continue
    if (++count > MAX_PARAMS) return null
    if (key === '' || key.length > MAX_KEY_LENGTH || value.length > MAX_VALUE_LENGTH) return null
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return null
    params[key] = value
  }
  return { action, params: { ...params } }
}

/** Set when the address bar held an `/obsidian` URL that could not be used; consumed once after login. */
let invalidSeen = false

/** Stores a request, replacing one that is still waiting. Storage failures are swallowed (private mode). */
export function storePendingProtocolAction(
  request: ProtocolActionRequest,
  now: number = Date.now(),
  storage: Pick<Storage, 'setItem'> = window.sessionStorage,
): void {
  try {
    storage.setItem(PENDING_PROTOCOL_ACTION_KEY, JSON.stringify({ request, savedAt: now }))
  } catch {
    // Without storage the link simply does not survive a login.
  }
}

/** Returns the waiting request (if fresh and well-formed) and removes it — it is consumed exactly once. */
export function consumePendingProtocolAction(
  now: number = Date.now(),
  storage: Pick<Storage, 'getItem' | 'removeItem'> = window.sessionStorage,
): ProtocolActionRequest | null {
  let raw: string | null
  try {
    raw = storage.getItem(PENDING_PROTOCOL_ACTION_KEY)
    storage.removeItem(PENDING_PROTOCOL_ACTION_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const { request, savedAt } = data as { request?: unknown; savedAt?: unknown }
  if (typeof savedAt !== 'number' || now - savedAt > PENDING_PROTOCOL_ACTION_TTL_MS || savedAt > now) return null
  if (typeof request !== 'object' || request === null) return null
  // Storage is only text a tab could have tampered with: run it through the same parser.
  const { action, params } = request as { action?: unknown; params?: unknown }
  if (typeof action !== 'string' || typeof params !== 'object' || params === null) return null
  const query = new URLSearchParams({ action })
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== 'string') return null
    query.append(key, value)
  }
  return parseProtocolAction(query.toString())
}

/**
 * Captures `/obsidian?…` from the location and cleans the address bar, so a reload does not run it
 * again and the parameters stay out of history and referrer. Any other URL is ignored.
 *
 * @param location - Injectable for tests.
 * @param history - Injectable for tests.
 */
export function captureProtocolActionFromLocation(
  location: Pick<Location, 'pathname' | 'search'> = window.location,
  history: Pick<History, 'replaceState'> = window.history,
): void {
  if (location.pathname !== PROTOCOL_ACTION_PATH) return
  const request = parseProtocolAction(location.search)
  if (request) storePendingProtocolAction(request)
  else invalidSeen = true
  history.replaceState(null, '', '/')
}

/** Whether an unusable `/obsidian` link was seen since the last call (true once, then false). */
export function consumeInvalidProtocolAction(): boolean {
  const seen = invalidSeen
  invalidSeen = false
  return seen
}
