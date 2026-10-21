// ─── Theme Store Types ────────────────────────────────────────────────────────

/** Color modes a community theme supports, as listed in `community-css-themes.json`. */
export type ThemeMode = 'dark' | 'light'

/** One validated entry of Obsidian's `community-css-themes.json`. */
export interface CommunityThemeEntry {
  /** Display name; also the key that ties an installed theme to its catalog entry (case-insensitive). */
  name: string
  author: string
  /** GitHub `owner/repo`. */
  repo: string
  /** Repo-relative screenshot path as listed upstream (may be empty or irregular; see `normalizeScreenshotPath`). */
  screenshot: string
  modes: ThemeMode[]
  /** Old-style theme (`obsidian.css`); mostly has no `theme.css`/`manifest.json` to install. */
  legacy: boolean
}

/** Files of one theme repo, fetched from its default branch. */
export interface RemoteThemeFiles {
  css: string
  /** Parsed `manifest.json` (a JSON object; field types are not trusted). */
  manifest: Record<string, unknown>
}

/** A screenshot, sniffed by its leading bytes. */
export interface ThemeScreenshot {
  contentType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  data: Buffer
}

/** Tunables of the theme store. */
export interface IThemeStoreConfig {
  /** Catalog TTL in ms (default 1 h). */
  cacheTtlCatalog: number
  /** Remote manifest and update-check TTL in ms (default 15 min). */
  cacheTtlManifest: number
}

/**
 * Fetches theme data from GitHub. Talks to `raw.githubusercontent.com` only and sends no credentials.
 */
export interface IThemeStoreClient {
  /** Downloads and validates the community catalog; malformed entries are skipped. */
  fetchCatalog(): Promise<CommunityThemeEntry[]>
  /** Downloads `theme.css` and `manifest.json` of a theme repo. */
  fetchThemeFiles(repo: string): Promise<RemoteThemeFiles>
  /** Downloads only the remote manifest (for update checks). */
  fetchManifest(repo: string): Promise<Record<string, unknown>>
  /** Downloads a screenshot; null if the path is unusable or the file is missing or not a supported image. */
  fetchScreenshot(repo: string, screenshotPath: string): Promise<ThemeScreenshot | null>
}
