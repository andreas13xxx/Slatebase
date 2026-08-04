// ─── Plugin Store Error Classes ───────────────────────────────────────────────

/**
 * Thrown when the GitHub API rate limit is exceeded.
 * Maps to HTTP 429 in the API layer.
 */
export class GitHubRateLimitError extends Error {
  constructor(
    public readonly retryAfter: number,
    public readonly remaining: number
  ) {
    super(`GitHub API rate limit exceeded. Retry after ${retryAfter} seconds (remaining: ${remaining})`)
    this.name = 'GitHubRateLimitError'
  }
}

/**
 * Thrown when a GitHub API request fails with an unexpected status code.
 * Maps to HTTP 502 in the API layer.
 */
export class GitHubFetchError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly url: string
  ) {
    super(`GitHub API request failed with status ${statusCode} for URL: ${url}`)
    this.name = 'GitHubFetchError'
  }
}

/**
 * Thrown when attempting to install a plugin that is marked as desktop-only.
 * Maps to HTTP 400 in the API layer.
 */
export class DesktopOnlyPluginError extends Error {
  constructor(public readonly pluginId: string) {
    super(`Plugin "${pluginId}" is desktop-only and cannot be installed in Slatebase`)
    this.name = 'DesktopOnlyPluginError'
  }
}

/**
 * Thrown when a release asset exceeds the maximum allowed size.
 * Maps to HTTP 400 in the API layer.
 */
export class AssetTooLargeError extends Error {
  constructor(
    public readonly assetName: string,
    public readonly actualSize: number,
    public readonly maxSize: number
  ) {
    super(`Asset "${assetName}" exceeds maximum size of ${maxSize} bytes (actual: ${actualSize})`)
    this.name = 'AssetTooLargeError'
  }
}

/**
 * Thrown when a plugin ID is not found in the community-plugins.json list.
 * Maps to HTTP 404 in the API layer.
 */
export class PluginNotInStoreError extends Error {
  constructor(public readonly pluginId: string) {
    super(`Plugin "${pluginId}" is not listed in the community plugin store`)
    this.name = 'PluginNotInStoreError'
  }
}

/**
 * Thrown when the upstream (GitHub) is unavailable and no cache fallback exists.
 * Maps to HTTP 502 in the API layer.
 */
export class UpstreamError extends Error {
  constructor(public readonly cause: string) {
    super(`Upstream unavailable: ${cause}`)
    this.name = 'UpstreamError'
  }
}
