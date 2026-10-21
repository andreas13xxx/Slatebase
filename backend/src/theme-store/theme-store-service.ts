// ─── Theme Store Service ──────────────────────────────────────────────────────

import type { ILogger } from '../logger/index.js'
import type { IThemeService, ThemeManifestInput, ThemeMeta } from '../themes/index.js'
import { toThemeId } from '../themes/index.js'
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

  constructor(
    private readonly client: IThemeStoreClient,
    private readonly cache: IThemeStoreCache,
    private readonly themeService: IThemeService,
    private readonly logger: ILogger,
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

  async install(vaultPath: string, repo: string, options: InstallThemeOptions): Promise<ThemeMeta> {
    const entry = await this.findEntry(repo)
    const files = await this.client.fetchThemeFiles(repo)

    const manifestName = typeof files.manifest['name'] === 'string' ? files.manifest['name'].trim() : ''
    if (manifestName.toLowerCase() !== entry.name.toLowerCase()) {
      throw new ThemeManifestMismatchError(entry.name, manifestName)
    }
    const themeId = toThemeId(manifestName)
    if (themeId === null) throw new ThemeIdUnderivableError(manifestName)

    if (!options.replace) {
      const taken = (await this.themeService.listThemes(vaultPath)).some((t) => t.id.toLowerCase() === themeId.toLowerCase())
      if (taken) throw new ThemeAlreadyInstalledError(themeId)
    }

    const meta = await this.themeService.saveTheme(vaultPath, themeId, files.css, pickManifest(files.manifest))
    if (options.activate) await this.themeService.setActiveThemeId(vaultPath, meta.id)
    this.logger.info('Theme installed from the community catalog', { repo, themeId: meta.id, size: meta.size, replace: options.replace })
    return meta
  }

  async checkUpdates(vaultId: string, vaultPath: string): Promise<ThemeUpdateCheckResult> {
    const cached = this.cache.getUpdateCheck<ThemeUpdateCheckResult>(vaultId)
    if (cached !== null) return cached

    const [{ themes: catalog }, installed] = await Promise.all([this.listCatalog(), this.themeService.listThemes(vaultPath)])
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
    if (warnings.length === 0) this.cache.setUpdateCheck(vaultId, result)
    return result
  }

  async getScreenshot(repo: string): Promise<ThemeScreenshot | null> {
    const entry = await this.findEntry(repo)
    return this.client.fetchScreenshot(entry.repo, entry.screenshot)
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
      this.catalogInFlight = this.client
        .fetchCatalog()
        .then((entries) => {
          this.cache.setCatalog(entries)
          return entries
        })
        .finally(() => {
          this.catalogInFlight = null
        })
    }
    return this.catalogInFlight
  }
}
