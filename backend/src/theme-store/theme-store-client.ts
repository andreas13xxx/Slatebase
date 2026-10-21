// ─── Theme Store Client ───────────────────────────────────────────────────────

import type { ILogger } from '../logger/index.js'
import { guardedFetch, GuardedFetchError, type GuardedFetchOptions, type GuardedFetchResult } from '../shared/guarded-fetch.js'
import { MAX_THEME_CSS_SIZE } from '../themes/validation.js'
import {
  ThemeAssetTooLargeError,
  ThemeFilesNotFoundError,
  ThemeManifestInvalidError,
  ThemeStoreFetchError,
} from './errors.js'
import type { CommunityThemeEntry, IThemeStoreClient, RemoteThemeFiles, ThemeScreenshot } from './types.js'
import {
  MAX_CATALOG_BYTES,
  MAX_CATALOG_ENTRIES,
  MAX_SCREENSHOT_BYTES,
  communityThemeEntrySchema,
  isValidRepo,
  normalizeScreenshotPath,
  sniffImageType,
} from './validation.js'

/** Production origin. Themes live in plain repo files, so no GitHub API (and no API rate limit or token) is involved. */
const DEFAULT_RAW_BASE_URL = 'https://raw.githubusercontent.com'
const CATALOG_PATH = 'obsidianmd/obsidian-releases/master/community-css-themes.json'
/** Size cap for a remote `manifest.json`. */
const MAX_MANIFEST_BYTES = 64 * 1024
const USER_AGENT = 'Slatebase-Theme-Store/1.0'

/** Options for {@link ThemeStoreClient}. */
export interface ThemeStoreClientOptions {
  /**
   * Origin that serves raw repo files. Only tests override this (with a local `http:` server); the allowlist and the
   * protocol are derived from it, so the client can never reach a second host.
   */
  rawBaseUrl?: string
}

/** Marker for a request that failed because the body was over the limit (as opposed to any other fetch failure). */
class BodyTooLargeError extends Error {}

/**
 * Fetches the community theme catalog and theme files from `raw.githubusercontent.com`.
 * Sends no credentials; every request goes through {@link guardedFetch}.
 */
export class ThemeStoreClient implements IThemeStoreClient {
  private readonly origin: string
  private readonly guards: Pick<GuardedFetchOptions, 'allowedHosts' | 'protocols' | 'userAgent'>

  constructor(
    private readonly logger: ILogger,
    options: ThemeStoreClientOptions = {},
  ) {
    const base = new URL(options.rawBaseUrl ?? DEFAULT_RAW_BASE_URL)
    this.origin = base.origin
    this.guards = { allowedHosts: new Set([base.host]), protocols: [base.protocol], userAgent: USER_AGENT }
  }

  async fetchCatalog(): Promise<CommunityThemeEntry[]> {
    const url = `${this.origin}/${CATALOG_PATH}`
    let result: GuardedFetchResult
    try {
      result = await this.get(url, MAX_CATALOG_BYTES, 'application/json')
    } catch (error: unknown) {
      if (error instanceof BodyTooLargeError) throw new ThemeStoreFetchError(url, 0, 'catalog is too large')
      throw error
    }
    if (result.status !== 200) throw new ThemeStoreFetchError(url, result.status)

    let data: unknown
    try {
      data = JSON.parse(result.body.toString('utf-8'))
    } catch {
      throw new ThemeStoreFetchError(url, result.status, 'catalog is not valid JSON')
    }
    if (!Array.isArray(data) || data.length > MAX_CATALOG_ENTRIES) {
      throw new ThemeStoreFetchError(url, result.status, 'catalog is not a list of reasonable size')
    }

    const entries: CommunityThemeEntry[] = []
    for (const raw of data) {
      const parsed = communityThemeEntrySchema.safeParse(raw)
      if (parsed.success) {
        entries.push(parsed.data)
      } else {
        this.logger.warn('Skipping malformed community theme entry', {
          entry: typeof raw === 'object' ? JSON.stringify(raw).slice(0, 200) : String(raw),
        })
      }
    }
    return entries
  }

  async fetchThemeFiles(repo: string): Promise<RemoteThemeFiles> {
    const [manifest, css] = await Promise.all([this.fetchManifest(repo), this.fetchCss(repo)])
    return { manifest, css }
  }

  async fetchManifest(repo: string): Promise<Record<string, unknown>> {
    const body = await this.getRepoFile(repo, 'manifest.json', MAX_MANIFEST_BYTES)
    let manifest: unknown
    try {
      manifest = JSON.parse(body.toString('utf-8').replace(/^\uFEFF/, ''))
    } catch {
      throw new ThemeManifestInvalidError(repo)
    }
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
      throw new ThemeManifestInvalidError(repo)
    }
    return manifest as Record<string, unknown>
  }

  async fetchScreenshot(repo: string, screenshotPath: string): Promise<ThemeScreenshot | null> {
    const path = normalizeScreenshotPath(screenshotPath)
    if (path === null || !isValidRepo(repo)) return null
    const url = `${this.origin}/${repo}/HEAD/${path}`
    let result: GuardedFetchResult
    try {
      result = await this.get(url, MAX_SCREENSHOT_BYTES)
    } catch (error: unknown) {
      // A missing, oversized or unreachable image never blocks anything; the card shows a placeholder.
      if (error instanceof BodyTooLargeError || error instanceof ThemeStoreFetchError) return null
      throw error
    }
    if (result.status !== 200) return null
    const contentType = sniffImageType(result.body)
    return contentType === null ? null : { contentType, data: result.body }
  }

  private async fetchCss(repo: string): Promise<string> {
    return (await this.getRepoFile(repo, 'theme.css', MAX_THEME_CSS_SIZE)).toString('utf-8')
  }

  /** GETs `<repo>/HEAD/<file>`; 404 and oversize get their own errors, anything else unexpected is a fetch error. */
  private async getRepoFile(repo: string, file: 'manifest.json' | 'theme.css', maxBytes: number): Promise<Buffer> {
    if (!isValidRepo(repo)) throw new ThemeStoreFetchError(`${this.origin}/${repo}`, 0, 'invalid repo')
    const url = `${this.origin}/${repo}/HEAD/${file}`
    let result: GuardedFetchResult
    try {
      result = await this.get(url, maxBytes)
    } catch (error: unknown) {
      if (error instanceof BodyTooLargeError) throw new ThemeAssetTooLargeError(repo, file, maxBytes)
      throw error
    }
    if (result.status === 404) throw new ThemeFilesNotFoundError(repo, file)
    if (result.status !== 200) throw new ThemeStoreFetchError(url, result.status)
    return result.body
  }

  private async get(url: string, maxBytes: number, accept?: string): Promise<GuardedFetchResult> {
    try {
      return await guardedFetch(url, { ...this.guards, maxBytes, ...(accept ? { accept } : {}) })
    } catch (error: unknown) {
      if (error instanceof GuardedFetchError) {
        if (error.kind === 'too-large') throw new BodyTooLargeError(url)
        this.logger.warn('Theme store request failed', { url, kind: error.kind })
        throw new ThemeStoreFetchError(url, 0, error.kind)
      }
      throw error
    }
  }
}
