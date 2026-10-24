import type { PublicNoteView } from './types'

/**
 * Outcome of loading a shared note. Only a server 404 means "this link is gone"; a network
 * failure or a 5xx is `error` (unknown), so a flaky connection never reads as a dead link.
 */
export type PublicLoadResult =
  | { status: 'ok'; view: PublicNoteView }
  | { status: 'password' }
  | { status: 'notfound' }
  | { status: 'limited' }
  | { status: 'error' }

/** Outcome of submitting a password. */
export type PublicUnlockResult = 'ok' | 'wrong' | 'limited' | 'notfound' | 'error'

function isPublicNoteView(value: unknown): value is PublicNoteView {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['title'] === 'string' && typeof v['markdown'] === 'string' && typeof v['embeds'] === 'object' && v['embeds'] !== null
}

/** Loads the shared note for a token. */
export async function loadPublicNote(token: string, fetchImpl: typeof fetch = fetch): Promise<PublicLoadResult> {
  try {
    const res = await fetchImpl(`/api/v1/public/s/${encodeURIComponent(token)}`, { credentials: 'same-origin' })
    if (res.status === 404) return { status: 'notfound' }
    if (res.status === 401) return { status: 'password' }
    if (res.status === 429) return { status: 'limited' }
    if (!res.ok) return { status: 'error' }
    const body: unknown = await res.json()
    return isPublicNoteView(body) ? { status: 'ok', view: body } : { status: 'error' }
  } catch {
    return { status: 'error' }
  }
}

/** Submits the password of a protected link; on success the server sets the unlock cookie. */
export async function unlockPublicNote(token: string, password: string, fetchImpl: typeof fetch = fetch): Promise<PublicUnlockResult> {
  try {
    const res = await fetchImpl(`/api/v1/public/s/${encodeURIComponent(token)}/unlock`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.status === 204 || res.ok) return 'ok'
    if (res.status === 401) return 'wrong'
    if (res.status === 429) return 'limited'
    if (res.status === 404) return 'notfound'
    return 'error'
  } catch {
    return 'error'
  }
}
