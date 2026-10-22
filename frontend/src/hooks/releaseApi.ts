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
    return await res.json() as ReleaseList
  } finally {
    clearTimeout(timeoutId)
  }
}
