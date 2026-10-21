// ─── Theme Store Types ────────────────────────────────────────────────────────

import type { ThemeMeta } from '../themes/index.js'

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

/** The catalog as served to clients. */
export interface ThemeCatalogResult {
  themes: CommunityThemeEntry[]
  /** True when GitHub could not be reached and the last known list is served. */
  stale: boolean
}

/** Options of {@link IThemeStoreService.install}. */
export interface InstallThemeOptions {
  /** Overwrite a theme with the same folder name. Without it an existing theme yields `ThemeAlreadyInstalledError`. */
  replace: boolean
  /** Make the installed theme the vault's active theme. */
  activate: boolean
}

/** An installed theme with a newer version in the catalog. */
export interface ThemeStoreUpdate {
  /** Folder name of the installed theme. */
  themeId: string
  name: string
  repo: string
  installedVersion: string
  latestVersion: string
}

/** Outcome of an update check. Failed lookups are warnings, never "up to date". */
export interface ThemeUpdateCheckResult {
  updates: ThemeStoreUpdate[]
  /** Installed catalog themes whose version could not be compared (missing or not a dotted number). */
  unknown: string[]
  /** One message per theme whose remote manifest could not be fetched. */
  warnings: string[]
  /** Installed themes that have a catalog entry and were looked at. */
  checked: number
  checkedAt: string
}

/**
 * Theme store use cases: browse the catalog, install a theme into a vault, check for updates, serve screenshots.
 * Vault paths are absolute storage paths, resolved by the caller.
 */
export interface IThemeStoreService {
  /** Catalog from cache, else from GitHub; on failure the last known list with `stale: true`, else the error. */
  listCatalog(): Promise<ThemeCatalogResult>
  /**
   * Downloads a catalog theme and saves it as `<vault>/.obsidian/themes/<id>/`. Returns the saved theme's metadata.
   * Drops the vault's cached update check, which the install has just made out of date.
   */
  install(vaultId: string, vaultPath: string, repo: string, options: InstallThemeOptions): Promise<ThemeMeta>
  /** Compares installed themes that match a catalog entry by name with the remote manifest version. */
  checkUpdates(vaultId: string, vaultPath: string): Promise<ThemeUpdateCheckResult>
  /** Screenshot of a catalog theme (path taken from the catalog, never from the caller); null if unavailable. */
  getScreenshot(repo: string): Promise<ThemeScreenshot | null>
}
