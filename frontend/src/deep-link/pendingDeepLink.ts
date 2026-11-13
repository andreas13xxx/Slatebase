/**
 * Keeps a deep-link target across the login: the link is read before the app knows who the user is,
 * so the target waits in `sessionStorage` (tab-local, gone with the tab) until the signed-in app
 * consumes it. It holds only vault, path and anchor — never a token — and expires after ten minutes.
 *
 * @module deep-link/pendingDeepLink
 */
import { isSafeVaultPath, type DeepLinkAnchor, type DeepLinkTarget } from './deepLink'

/** `sessionStorage` key. */
export const PENDING_DEEP_LINK_KEY = 'slatebase:pending-deep-link'

/** How long a stored target stays valid. */
export const PENDING_DEEP_LINK_TTL_MS = 10 * 60 * 1000

interface StoredDeepLink {
  target: DeepLinkTarget
  savedAt: number
}

function isAnchor(value: unknown): value is DeepLinkAnchor {
  if (typeof value !== 'object' || value === null) return false
  const a = value as Record<string, unknown>
  return (a.kind === 'heading' && typeof a.text === 'string' && a.text.length > 0)
    || (a.kind === 'block' && typeof a.id === 'string' && a.id.length > 0)
}

/** Re-validates whatever came out of storage: it is only text a tab could have tampered with. */
function parseStored(raw: string | null): StoredDeepLink | null {
  if (raw === null) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const { target, savedAt } = data as { target?: unknown; savedAt?: unknown }
  if (typeof savedAt !== 'number' || typeof target !== 'object' || target === null) return null
  const t = target as Record<string, unknown>
  if (typeof t.vault !== 'string' || t.vault.length === 0) return null
  const path = t.path === null ? null : typeof t.path === 'string' && isSafeVaultPath(t.path) ? t.path : undefined
  if (path === undefined) return null
  const anchor = t.anchor === null ? null : isAnchor(t.anchor) ? t.anchor : undefined
  if (anchor === undefined || (path === null && anchor !== null)) return null
  return { target: { vault: t.vault, path, anchor }, savedAt }
}

/** Stores a target, replacing one that is still waiting. Storage failures are swallowed (private mode). */
export function storePendingDeepLink(
  target: DeepLinkTarget,
  now: number = Date.now(),
  storage: Pick<Storage, 'setItem'> = window.sessionStorage,
): void {
  try {
    storage.setItem(PENDING_DEEP_LINK_KEY, JSON.stringify({ target, savedAt: now } satisfies StoredDeepLink))
  } catch {
    // Without storage the link simply does not survive a login.
  }
}

/** Returns the waiting target (if fresh and well-formed) and removes it — it is consumed exactly once. */
export function consumePendingDeepLink(
  now: number = Date.now(),
  storage: Pick<Storage, 'getItem' | 'removeItem'> = window.sessionStorage,
): DeepLinkTarget | null {
  let raw: string | null
  try {
    raw = storage.getItem(PENDING_DEEP_LINK_KEY)
    storage.removeItem(PENDING_DEEP_LINK_KEY)
  } catch {
    return null
  }
  const stored = parseStored(raw)
  if (!stored) return null
  if (now - stored.savedAt > PENDING_DEEP_LINK_TTL_MS || stored.savedAt > now) return null
  return stored.target
}
