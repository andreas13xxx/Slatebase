/** A published Slatebase release as delivered by `GET /api/v1/releases`. */
export interface ReleaseInfo {
  tagName: string
  name: string | null
  body: string | null
  htmlUrl: string
  prerelease: boolean
}

/** Response of `GET /api/v1/releases`. */
export interface ReleaseList {
  releases: ReleaseInfo[]
  /** Newest release that is not a pre-release, or null. */
  latest: ReleaseInfo | null
  /** True when the server could not reach GitHub and returned its last known list. */
  stale: boolean
}

const RELEASES_TIMEOUT_MS = 10000

function isRelease(value: unknown): value is ReleaseInfo {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return typeof r['tagName'] === 'string' && typeof r['htmlUrl'] === 'string'
}

/** Guards against a 200 answer of another shape (proxy, captive portal): callers index into it without checks. */
function isReleaseList(value: unknown): value is ReleaseList {
  if (typeof value !== 'object' || value === null) return false
  const list = value as Record<string, unknown>
  return Array.isArray(list['releases']) && list['releases'].every(isRelease) && (list['latest'] === null || isRelease(list['latest']))
}

/**
 * Loads Slatebase's own releases from the server, which looks them up on GitHub (the browser never calls GitHub).
 *
 * @throws Error if the server answers with a non-2xx status (502 when GitHub was never reachable), the request
 *         times out or the network fails. Callers treat that as "no update information", never as "up to date".
 */
export async function fetchReleaseList(): Promise<ReleaseList> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), RELEASES_TIMEOUT_MS)
  try {
    const res = await fetch('/api/v1/releases', { signal: controller.signal })
    if (!res.ok) throw new Error(`Releases responded ${res.status}`)
    const data: unknown = await res.json()
    if (!isReleaseList(data)) throw new Error('Unexpected releases response')
    return data
  } finally {
    clearTimeout(timeoutId)
  }
}
