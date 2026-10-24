// ─── Theme Store Service ──────────────────────────────────────────────────────

import type { ILogger } from '../logger/index.js'
import type { IThemeService, ThemeManifestInput, ThemeMeta } from '../themes/index.js'
import { ThemeNotFoundError, toThemeId } from '../themes/index.js'
import { KeyedMutex } from '../shared/async-mutex.js'
import {
  ThemeAlreadyInstalledError,
  ThemeIdUnderivableError,
  ThemeManifestMismatchError,
  ThemeNotInCatalogError,
} from './errors.js'
import type { IThemeStoreCache } from './theme-store-cache.js'
import type {
  CommunityThemeEntry,
  InstallThemeOptions,
  IThemeStoreClient,
  IThemeStoreService,
  ThemeCatalogResult,
  ThemeScreenshot,
  ThemeStoreUpdate,
  ThemeUpdateCheckResult,
} from './types.js'
import { isNewerVersion, parseVersion } from './validation.js'

/** Remote manifests are fetched this many at a time during an update check. */
const MANIFEST_CONCURRENCY = 5

/** Screenshot memory cache: entries live 1 h (a missing or unusable image 5 min), at most 40 MB and 300 entries. */
const SCREENSHOT_TTL_MS = 60 * 60 * 1000
const SCREENSHOT_MISS_TTL_MS = 5 * 60 * 1000
const SCREENSHOT_CACHE_MAX_BYTES = 40 * 1024 * 1024
const SCREENSHOT_CACHE_MAX_ENTRIES = 300

const MANIFEST_TEXT_FIELDS = ['name', 'version', 'author', 'authorUrl', 'minAppVersion'] as const

/** Keeps only the string fields Slatebase stores; the remote manifest is untrusted JSON of unknown shape. */
function pickManifest(raw: Record<string, unknown>): ThemeManifestInput {
  const out: ThemeManifestInput = {}
  for (const key of MANIFEST_TEXT_FIELDS) {
    const value = raw[key]
    if (typeof value === 'string') out[key] = value
  }
  return out
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Runs `fn` over `items`, at most `limit` at a time, keeping the order of the results. */
async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Browse, install and update community themes. Delegates storage to {@link IThemeService}. */
export class ThemeStoreService implements IThemeStoreService {
  /** A catalog request already on its way, shared by concurrent callers. */
  private catalogInFlight: Promise<CommunityThemeEntry[]> | null = null
  /** Serializes "does it exist?" + save per vault, so two installs of one theme cannot both pass the check. */
  private readonly installLocks = new KeyedMutex()
  private readonly screenshots = new Map<string, { shot: ThemeScreenshot | null; expiresAt: number; bytes: number }>()
  private readonly screenshotsInFlight = new Map<string, Promise<ThemeScreenshot | null>>()
  private screenshotBytes = 0

  constructor(
    private readonly client: IThemeStoreClient,
    private readonly cache: IThemeStoreCache,
    private readonly themeService: IThemeService,
    private readonly logger: ILogger,
    private readonly now: () => number = Date.now,
  ) {}

  async listCatalog(): Promise<ThemeCatalogResult> {
    const fresh = this.cache.getCatalog()
    if (fresh !== null) return { themes: fresh, stale: false }

    try {
      return { themes: await this.refreshCatalog(), stale: false }
    } catch (error: unknown) {
      const stale = this.cache.getCatalogStale()
      if (stale === null) throw error
      this.logger.warn('Theme catalog unavailable, serving the last known list', { error: describeError(error) })
      return { themes: stale, stale: true }
    }
  }

  async install(vaultId: string, vaultPath: string, repo: string, options: InstallThemeOptions): Promise<ThemeMeta> {
    const entry = await this.findEntry(repo)
    const files = await this.client.fetchThemeFiles(repo)

    const manifestName = typeof files.manifest['name'] === 'string' ? files.manifest['name'].trim() : ''
    if (manifestName.toLowerCase() !== entry.name.toLowerCase()) {
      throw new ThemeManifestMismatchError(entry.name, manifestName)
    }
    return this.installLocks.runExclusive(vaultPath, async () => {
      const installed = await this.themeService.listThemes(vaultPath)
      let themeId: string
      if (options.targetThemeId !== undefined) {
        // An update goes to the folder the theme already lives in, whatever that folder is called.
        const target = installed.find((t) => t.id === options.targetThemeId)
        if (target === undefined) throw new ThemeNotFoundError(options.targetThemeId)
        if (target.manifest.name.toLowerCase() !== entry.name.toLowerCase()) {
          throw new ThemeManifestMismatchError(entry.name, target.manifest.name)
        }
        themeId = target.id
      } else {
        const derived = toThemeId(manifestName)
        if (derived === null) throw new ThemeIdUnderivableError(manifestName)
        if (!options.replace && installed.some((t) => t.id.toLowerCase() === derived.toLowerCase())) {
          throw new ThemeAlreadyInstalledError(derived)
        }
        themeId = derived
      }

      const meta = await this.themeService.saveTheme(vaultPath, themeId, files.css, pickManifest(files.manifest))
      if (options.activate) await this.themeService.setActiveThemeId(vaultPath, meta.id)
      // The cached update check predates this install (a just-updated theme would still be listed as outdated).
      this.cache.invalidateUpdateCheck(vaultId)
      this.logger.info('Theme installed from the community catalog', { repo, themeId: meta.id, size: meta.size, replace: options.replace })
      return meta
    })
  }

  async checkUpdates(vaultId: string, vaultPath: string): Promise<ThemeUpdateCheckResult> {
    const installed = await this.themeService.listThemes(vaultPath)
    // A cached result is only valid for the exact set of installed themes it was computed from. This also covers
    // changes that bypass the store (import, delete, a check that was still running while an install finished).
    const fingerprint = installed.map((t) => `${t.id}|${t.manifest.name}|${t.manifest.version ?? ''}|${t.updatedAt}`).join('\n')
    const cached = this.cache.getUpdateCheck<{ fingerprint: string; result: ThemeUpdateCheckResult }>(vaultId)
    if (cached !== null && cached.fingerprint === fingerprint) return cached.result

    const { themes: catalog } = await this.listCatalog()
    const byName = new Map(catalog.map((entry) => [entry.name.toLowerCase(), entry]))
    const candidates = installed.flatMap((theme) => {
      const entry = byName.get(theme.manifest.name.toLowerCase())
      return entry ? [{ theme, entry }] : []
    })

    const warnings: string[] = []
    const unknown: string[] = []
    const updates: ThemeStoreUpdate[] = []

    const outcomes = await mapLimited(candidates, MANIFEST_CONCURRENCY, async ({ theme, entry }) => {
      try {
        return { theme, entry, remote: await this.remoteManifest(entry.repo) }
      } catch (error: unknown) {
        warnings.push(`${entry.name}: ${describeError(error)}`)
        return null
      }
    })

    for (const outcome of outcomes) {
      if (outcome === null) continue
      const { theme, entry, remote } = outcome
      const installedVersion = theme.manifest.version
      const latest = remote['version']
      const newer = isNewerVersion(installedVersion, latest)
      if (newer === null) {
        unknown.push(entry.name)
      } else if (newer) {
        updates.push({
          themeId: theme.id,
          name: entry.name,
          repo: entry.repo,
          installedVersion: parseVersion(installedVersion) ?? String(installedVersion),
          latestVersion: parseVersion(latest) ?? String(latest),
        })
      }
    }

    const result: ThemeUpdateCheckResult = {
      updates: updates.sort((a, b) => a.name.localeCompare(b.name)),
      unknown: unknown.sort(),
      warnings: warnings.sort(),
      checked: candidates.length,
      checkedAt: new Date().toISOString(),
    }
    // A check with failed lookups is not worth remembering: the next click should retry them.
    if (warnings.length === 0) this.cache.setUpdateCheck(vaultId, { fingerprint, result })
    return result
  }

  async getScreenshot(repo: string): Promise<ThemeScreenshot | null> {
    const entry = await this.findEntry(repo)

    // 24+ cards ask at once, for every user: answer from memory and share one upstream request per repo.
    const cached = this.screenshots.get(entry.repo)
    if (cached !== undefined && cached.expiresAt > this.now()) return cached.shot
    const pending = this.screenshotsInFlight.get(entry.repo)
    if (pending !== undefined) return pending

    const request = this.client
      .fetchScreenshot(entry.repo, entry.screenshot)
      .then((shot) => {
        this.rememberScreenshot(entry.repo, shot)
        return shot
      })
      .finally(() => {
        this.screenshotsInFlight.delete(entry.repo)
      })
    this.screenshotsInFlight.set(entry.repo, request)
    return request
  }

  /** Stores a screenshot (or the fact that there is none) and evicts the oldest entries beyond the limits. */
  private rememberScreenshot(repo: string, shot: ThemeScreenshot | null): void {
    const previous = this.screenshots.get(repo)
    if (previous !== undefined) this.screenshotBytes -= previous.bytes
    this.screenshots.delete(repo) // re-insert at the end: Map keeps insertion order, so the first key is the oldest
    const bytes = shot?.data.length ?? 0
    this.screenshots.set(repo, { shot, bytes, expiresAt: this.now() + (shot === null ? SCREENSHOT_MISS_TTL_MS : SCREENSHOT_TTL_MS) })
    this.screenshotBytes += bytes
    for (const [key, entry] of this.screenshots) {
      if (this.screenshots.size <= SCREENSHOT_CACHE_MAX_ENTRIES && this.screenshotBytes <= SCREENSHOT_CACHE_MAX_BYTES) break
      if (key === repo) continue
      this.screenshots.delete(key)
      this.screenshotBytes -= entry.bytes
    }
  }

  /** Looks `repo` up in the catalog; only catalog repos are ever fetched. */
  private async findEntry(repo: string): Promise<CommunityThemeEntry> {
    const { themes } = await this.listCatalog()
    const entry = themes.find((t) => t.repo === repo)
    if (!entry) throw new ThemeNotInCatalogError(repo)
    return entry
  }

  private async remoteManifest(repo: string): Promise<Record<string, unknown>> {
    const cached = this.cache.getManifest(repo)
    if (cached !== null) return cached
    const manifest = await this.client.fetchManifest(repo)
    this.cache.setManifest(repo, manifest)
    return manifest
  }

  private refreshCatalog(): Promise<CommunityThemeEntry[]> {
    if (this.catalogInFlight === null) {
      this.catalogInFlight = Promise.all([this.client.fetchCatalog(), this.fetchCountsOrNull()])
        .then(([entries, counts]) => {
          const merged = this.withDownloads(entries, counts)
          this.cache.setCatalog(merged)
          return merged
        })
        .finally(() => {
          this.catalogInFlight = null
        })
    }
    return this.catalogInFlight
  }

  /** Download counts, or null when they cannot be loaded: the statistics are a nicety and never block the catalog. */
  private async fetchCountsOrNull(): Promise<Map<string, number> | null> {
    try {
      return await this.client.fetchDownloadCounts()
    } catch (error: unknown) {
      this.logger.warn('Theme download statistics unavailable', { error: describeError(error) })
      return null
    }
  }

  /**
   * Adds `downloads` to the entries. Without fresh counts the last known ones are kept, so a failed statistics
   * request does not wipe the numbers; a theme without any count simply has none ("unknown", not 0).
   */
  private withDownloads(entries: CommunityThemeEntry[], counts: Map<string, number> | null): CommunityThemeEntry[] {
    const previous = counts === null ? new Map((this.cache.getCatalogStale() ?? []).map((e) => [e.repo, e.downloads])) : null
    return entries.map((entry) => {
      const downloads = counts !== null ? counts.get(entry.name.toLowerCase()) : previous?.get(entry.repo)
      const { downloads: _drop, ...rest } = entry
      return downloads === undefined ? rest : { ...rest, downloads }
    })
  }
}
