import type { ILogger } from '../logger/index.js'
import { guardedFetch } from '../shared/guarded-fetch.js'
import type { GuardedFetchOptions, GuardedFetchResult } from '../shared/guarded-fetch.js'

const RELEASES_URL = 'https://api.github.com/repos/andreas13xxx/Slatebase/releases?per_page=30'
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_RELEASES = 5
const CACHE_TTL_MS = 60 * 60 * 1000
/** After a failed lookup GitHub is left alone for this long (the last known list, if any, is served meanwhile). */
const FAILURE_BACKOFF_MS = 5 * 60 * 1000

/** One published release, trimmed to what the UI shows. */
export interface ReleaseInfo {
  tagName: string
  name: string | null
  body: string | null
  htmlUrl: string
  prerelease: boolean
}

/** Result of {@link IReleaseInfoService.getReleases}. */
export interface ReleaseList {
  /** Newest published releases, newest first. */
  releases: ReleaseInfo[]
  /** Newest release that is not a pre-release, or null. */
  latest: ReleaseInfo | null
  /** True when GitHub could not be reached and the last known list is served. */
  stale: boolean
}

/** Thrown when there is neither a fresh nor a previously cached release list. */
export class ReleaseInfoUnavailableError extends Error {
  constructor() {
    super('Release information is currently unavailable')
    this.name = 'ReleaseInfoUnavailableError'
  }
}

/** Server-side lookup of Slatebase's own GitHub releases, so the browser never talks to GitHub. */
export interface IReleaseInfoService {
  /**
   * Returns the newest releases from a one-hour cache. When GitHub cannot be reached the last known list is returned
   * with `stale: true`.
   *
   * @throws ReleaseInfoUnavailableError if nothing has ever been fetched successfully.
   */
  getReleases(): Promise<ReleaseList>
}

type Fetcher = (url: string, options: GuardedFetchOptions) => Promise<GuardedFetchResult>

function toReleaseInfo(value: unknown): ReleaseInfo | null {
  if (typeof value !== 'object' || value === null) return null
  const r = value as Record<string, unknown>
  if (r['draft'] === true) return null
  if (typeof r['tag_name'] !== 'string' || typeof r['html_url'] !== 'string') return null
  if (!r['html_url'].startsWith('https://github.com/')) return null
  return {
    tagName: r['tag_name'],
    name: typeof r['name'] === 'string' ? r['name'] : null,
    body: typeof r['body'] === 'string' ? r['body'] : null,
    htmlUrl: r['html_url'],
    prerelease: r['prerelease'] === true,
  }
}

/**
 * Fetches releases from `api.github.com` through {@link guardedFetch} (host allowlist, size limit, no credentials)
 * and keeps them for an hour. Concurrent callers share one request.
 */
export class ReleaseInfoService implements IReleaseInfoService {
  private cached: { list: Omit<ReleaseList, 'stale'>; fetchedAt: number } | null = null
  private inflight: Promise<void> | null = null
  private failedAt: number | null = null

  constructor(
    private readonly logger: ILogger,
    private readonly fetcher: Fetcher = guardedFetch,
    private readonly now: () => number = Date.now,
  ) {}

  async getReleases(): Promise<ReleaseList> {
    if (this.cached !== null && this.now() - this.cached.fetchedAt < CACHE_TTL_MS) {
      return { ...this.cached.list, stale: false }
    }
    // After a failed lookup stay off GitHub for a while: it may be down, rate-limited (60/h unauthenticated) or blocked
    // by egress rules, and every retry would otherwise hold a request open for the full timeout.
    const backingOff = this.failedAt !== null && this.now() - this.failedAt < FAILURE_BACKOFF_MS
    if (!backingOff) {
      try {
        await this.refresh()
        if (this.cached !== null) return { ...this.cached.list, stale: false }
      } catch {
        // logged in refresh(); fall through to the last known list
      }
    }
    if (this.cached !== null) return { ...this.cached.list, stale: true }
    throw new ReleaseInfoUnavailableError()
  }

  /** One shared lookup for concurrent callers; the cache is written here, once, not by each caller. */
  private refresh(): Promise<void> {
    this.inflight ??= this.fetchReleases()
      .then((list) => {
        this.cached = { list, fetchedAt: this.now() }
        this.failedAt = null
      })
      .catch((error: unknown) => {
        this.failedAt = this.now()
        this.logger.warn('Release lookup failed', { error: error instanceof Error ? error.message : String(error) })
        throw error
      })
      .finally(() => { this.inflight = null })
    return this.inflight
  }

  private async fetchReleases(): Promise<Omit<ReleaseList, 'stale'>> {
    const result = await this.fetcher(RELEASES_URL, {
      allowedHosts: new Set(['api.github.com']),
      maxBytes: MAX_RESPONSE_BYTES,
      accept: 'application/vnd.github+json',
      userAgent: 'Slatebase-Release-Check/1.0',
    })
    if (result.status !== 200) throw new Error(`GitHub responded ${result.status}`)

    const data: unknown = JSON.parse(result.body.toString('utf8'))
    if (!Array.isArray(data)) throw new Error('Unexpected releases payload')

    const all = data.map(toReleaseInfo).filter((r): r is ReleaseInfo => r !== null)
    // `latest` is searched in the whole page, not in the shortened list: a run of pre-releases must not hide it.
    return { releases: all.slice(0, MAX_RELEASES), latest: all.find((r) => !r.prerelease) ?? null }
  }
}
