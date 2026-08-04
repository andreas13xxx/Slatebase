// ─── GitHub API Client ────────────────────────────────────────────────────────

import type { ILogger } from '../logger/index.js'
import type {
  CommunityPluginEntry,
  RemotePluginManifest,
  PluginReleaseAssets,
  IPluginStoreConfig,
} from './types.js'
import {
  GitHubRateLimitError,
  GitHubFetchError,
  AssetTooLargeError,
} from './errors.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const COMMUNITY_PLUGINS_URL =
  'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json'

const ALLOWED_DOMAINS = new Set([
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
])

const REQUEST_TIMEOUT_MS = 30_000

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * GitHub API client for fetching community plugin data.
 * Handles rate limiting, domain allowlisting, and size limits.
 */
export interface IGitHubClient {
  /** Fetch community-plugins.json (the full list) */
  fetchCommunityPlugins(): Promise<CommunityPluginEntry[]>
  /** Fetch manifest.json from a plugin repo's default branch */
  fetchManifest(repo: string): Promise<RemotePluginManifest>
  /** Download release assets for a specific version (or latest) */
  downloadReleaseAssets(repo: string, version?: string): Promise<PluginReleaseAssets>
  /** Get remaining rate limit */
  getRateLimitRemaining(): number
}

// ─── GitHub Release API Types ────────────────────────────────────────────────

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  assets: GitHubReleaseAsset[]
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * GitHub API client that fetches community plugin data with
 * rate-limit tracking, domain allowlisting, and size limits.
 */
export class GitHubClient implements IGitHubClient {
  private rateLimitRemaining = -1
  private readonly config: IPluginStoreConfig
  private readonly logger: ILogger

  constructor(config: IPluginStoreConfig, logger: ILogger) {
    this.config = config
    this.logger = logger
  }

  /** Fetch the full community-plugins.json list from Obsidian releases repo */
  async fetchCommunityPlugins(): Promise<CommunityPluginEntry[]> {
    const response = await this.fetchWithGuards(COMMUNITY_PLUGINS_URL)
    const data: unknown = await response.json()

    if (!Array.isArray(data)) {
      throw new GitHubFetchError(502, COMMUNITY_PLUGINS_URL)
    }

    return data as CommunityPluginEntry[]
  }

  /** Fetch manifest.json from a plugin repo's default branch */
  async fetchManifest(repo: string): Promise<RemotePluginManifest> {
    const url = `https://raw.githubusercontent.com/${repo}/HEAD/manifest.json`
    const response = await this.fetchWithGuards(url)
    const data: unknown = await response.json()
    return data as RemotePluginManifest
  }

  /** Download release assets for a specific version (or latest) */
  async downloadReleaseAssets(repo: string, version?: string): Promise<PluginReleaseAssets> {
    const releaseUrl = version
      ? `https://api.github.com/repos/${repo}/releases/tags/${version}`
      : `https://api.github.com/repos/${repo}/releases/latest`

    const releaseResponse = await this.fetchWithGuards(releaseUrl)
    const release: unknown = await releaseResponse.json()
    const releaseData = release as GitHubRelease

    if (!releaseData.assets || !Array.isArray(releaseData.assets)) {
      throw new GitHubFetchError(502, releaseUrl)
    }

    const mainJsAsset = releaseData.assets.find((a) => a.name === 'main.js')
    const manifestAsset = releaseData.assets.find((a) => a.name === 'manifest.json')
    const stylesAsset = releaseData.assets.find((a) => a.name === 'styles.css')

    if (!mainJsAsset || !manifestAsset) {
      throw new GitHubFetchError(404, releaseUrl)
    }

    let totalDownloaded = 0

    const bundle = await this.downloadAsset(mainJsAsset, totalDownloaded)
    totalDownloaded += bundle.length

    const manifest = await this.downloadAsset(manifestAsset, totalDownloaded)
    totalDownloaded += manifest.length

    let styles: Buffer | null = null
    if (stylesAsset) {
      styles = await this.downloadAsset(stylesAsset, totalDownloaded)
    }

    return { manifest, bundle, styles }
  }

  /** Get the last known remaining rate limit from GitHub response headers */
  getRateLimitRemaining(): number {
    return this.rateLimitRemaining
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Download a single release asset with size limit enforcement.
   * @param asset - The GitHub release asset metadata
   * @param alreadyDownloaded - Bytes already downloaded in this batch (for total limit)
   */
  private async downloadAsset(asset: GitHubReleaseAsset, alreadyDownloaded: number): Promise<Buffer> {
    // Check individual asset size before download
    if (asset.size > this.config.maxAssetSize) {
      throw new AssetTooLargeError(asset.name, asset.size, this.config.maxAssetSize)
    }

    // Check total download size limit
    if (alreadyDownloaded + asset.size > this.config.maxTotalDownloadSize) {
      throw new AssetTooLargeError(
        asset.name,
        alreadyDownloaded + asset.size,
        this.config.maxTotalDownloadSize,
      )
    }

    const response = await this.fetchWithGuards(asset.browser_download_url)

    // Verify Content-Length if present
    const contentLength = response.headers.get('Content-Length')
    if (contentLength) {
      const size = parseInt(contentLength, 10)
      if (!isNaN(size) && size > this.config.maxAssetSize) {
        throw new AssetTooLargeError(asset.name, size, this.config.maxAssetSize)
      }
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Final size check after download (in case Content-Length was missing/wrong)
    if (buffer.length > this.config.maxAssetSize) {
      throw new AssetTooLargeError(asset.name, buffer.length, this.config.maxAssetSize)
    }

    return buffer
  }

  /**
   * Perform a fetch request with rate-limit guard, domain allowlist,
   * timeout, and response header tracking.
   */
  private async fetchWithGuards(url: string): Promise<Response> {
    // Domain allowlist check
    this.validateDomain(url)

    // Rate limit check before request
    if (this.rateLimitRemaining === 0) {
      throw new GitHubRateLimitError(60, 0)
    }

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Slatebase-Plugin-Store/1.0',
    }

    if (this.config.githubToken) {
      headers['Authorization'] = `Bearer ${this.config.githubToken}`
    }

    let response: Response

    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'follow',
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        this.logger.error('GitHub request timed out', { url, timeoutMs: REQUEST_TIMEOUT_MS })
      } else {
        this.logger.error('GitHub request failed', { url, error: err instanceof Error ? err.message : String(err) })
      }
      throw new GitHubFetchError(0, url)
    }

    // Track rate limit from response headers
    this.updateRateLimit(response)

    // Handle rate limit response
    if (response.status === 429 || response.status === 403) {
      const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') ?? '0', 10)
      if (remaining === 0 || response.status === 429) {
        const resetHeader = response.headers.get('X-RateLimit-Reset')
        const resetTime = resetHeader ? parseInt(resetHeader, 10) : 0
        const retryAfter = resetTime > 0
          ? Math.max(resetTime - Math.floor(Date.now() / 1000), 1)
          : 60
        throw new GitHubRateLimitError(retryAfter, 0)
      }
    }

    // Handle non-2xx responses
    if (!response.ok) {
      this.logger.error('GitHub API returned non-2xx status', { url, status: response.status })
      throw new GitHubFetchError(response.status, url)
    }

    return response
  }

  /**
   * Validate that a URL's domain is in the allowlist.
   * @throws GitHubFetchError if the domain is not allowed
   */
  private validateDomain(url: string): void {
    try {
      const parsedUrl = new URL(url)
      if (!ALLOWED_DOMAINS.has(parsedUrl.hostname)) {
        this.logger.error('Domain not in allowlist', { url, hostname: parsedUrl.hostname })
        throw new GitHubFetchError(403, url)
      }
    } catch (err: unknown) {
      if (err instanceof GitHubFetchError) throw err
      this.logger.error('Invalid URL', { url })
      throw new GitHubFetchError(400, url)
    }
  }

  /**
   * Update internal rate limit tracking from response headers.
   * Logs a warning when rate limit is approaching.
   */
  private updateRateLimit(response: Response): void {
    const remaining = response.headers.get('X-RateLimit-Remaining')
    if (remaining !== null) {
      const value = parseInt(remaining, 10)
      if (!isNaN(value)) {
        this.rateLimitRemaining = value

        if (value > 0 && value <= 10) {
          this.logger.warn('GitHub rate limit approaching', { remaining: value })
        }
      }
    }
  }
}
