// ─── Theme Store Error Classes ────────────────────────────────────────────────

/** Thrown when GitHub could not be reached or answered with an unexpected status. Maps to HTTP 502. */
export class ThemeStoreFetchError extends Error {
  constructor(
    public readonly url: string,
    public readonly statusCode: number,
    detail?: string,
  ) {
    super(`Theme store request failed (${statusCode === 0 ? 'no response' : `status ${statusCode}`}) for ${url}${detail ? `: ${detail}` : ''}`)
    this.name = 'ThemeStoreFetchError'
  }
}

/** Thrown when a theme repo has no `theme.css` or `manifest.json` at its root. Maps to HTTP 422. */
export class ThemeFilesNotFoundError extends Error {
  constructor(
    public readonly repo: string,
    public readonly missing: 'manifest.json' | 'theme.css',
  ) {
    super(`Repository "${repo}" has no ${missing} at its root`)
    this.name = 'ThemeFilesNotFoundError'
  }
}

/** Thrown when a remote file is larger than the limit. Maps to HTTP 422. */
export class ThemeAssetTooLargeError extends Error {
  constructor(
    public readonly repo: string,
    public readonly file: 'manifest.json' | 'theme.css',
    public readonly maxBytes: number,
  ) {
    super(`${file} of "${repo}" exceeds the limit of ${maxBytes} bytes`)
    this.name = 'ThemeAssetTooLargeError'
  }
}

/** Thrown when a remote `manifest.json` is not a JSON object. Maps to HTTP 422. */
export class ThemeManifestInvalidError extends Error {
  constructor(public readonly repo: string) {
    super(`manifest.json of "${repo}" is not a valid JSON object`)
    this.name = 'ThemeManifestInvalidError'
  }
}

/** Thrown when a repo is not in the community catalog. Maps to HTTP 404. */
export class ThemeNotInCatalogError extends Error {
  constructor(public readonly repo: string) {
    super(`"${repo}" is not in the community theme catalog`)
    this.name = 'ThemeNotInCatalogError'
  }
}
