import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import type { Dirent, Stats } from 'node:fs'
import { KeyedMutex } from '../shared/async-mutex.js'
import { isNodeError } from '../shared/fs-utils.js'
import { writeJsonFileAtomic } from '../shared/json-file-store.js'
import { validateFilePath } from '../vault/index.js'
import { AppearanceFileInvalidError, InvalidThemeIdError, ThemeNotFoundError, ThemeTooLargeError } from './errors.js'
import type { IThemeService, ThemeManifest, ThemeManifestInput, ThemeMeta } from './types.js'
import { MAX_THEME_CSS_SIZE, extractExternalHosts, hasStyleSettingsBlock, isValidThemeId, normalizeManifest } from './validation.js'

const THEMES_DIR = '.obsidian/themes'
const APPEARANCE_FILE = '.obsidian/appearance.json'

/** Attempts for reads/renames that can hit transient Windows locks (OneDrive, antivirus). */
const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 50
const TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

/** Upper bound for the external-hosts cache; it is cleared when exceeded (entries are cheap to recompute). */
const ANALYSIS_CACHE_LIMIT = 500

/** Facts read from a stylesheet once per file version. */
type StylesheetAnalysis = Pick<ThemeMeta, 'externalHosts' | 'hasStyleSettings'>

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Runs `fn`, retrying a few times on transient lock errors. Other errors propagate at once. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn()
    } catch (error: unknown) {
      const transient = isNodeError(error) && error.code !== undefined && TRANSIENT_CODES.has(error.code)
      if (!transient || attempt >= RETRY_ATTEMPTS) throw error
      await delay(RETRY_DELAY_MS * attempt)
    }
  }
}

function isMissing(error: unknown): boolean {
  return isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

/** lstat that returns null for a missing path. Symlinks are reported as-is (never followed). */
async function lstatOrNull(filePath: string): Promise<Stats | null> {
  try {
    return await withRetry(() => fs.lstat(filePath))
  } catch (error: unknown) {
    if (isMissing(error)) return null
    throw error
  }
}

/**
 * Writes several files so that they change together as closely as the filesystem allows:
 * every file is first written to a temp file next to its target, and only then are the
 * renames done back to back (retrying transient lock errors). A failure while staging
 * leaves every target untouched; temp files are always cleaned up.
 */
async function writeFilesTogether(files: ReadonlyArray<{ path: string; content: string }>): Promise<void> {
  const staged: Array<{ temp: string; path: string }> = []
  try {
    for (const file of files) {
      const temp = `${file.path}.${randomBytes(8).toString('hex')}.tmp`
      await fs.writeFile(temp, file.content, 'utf-8')
      staged.push({ temp, path: file.path })
    }
    for (const entry of staged) {
      await withRetry(() => fs.rename(entry.temp, entry.path))
      entry.temp = ''
    }
  } finally {
    for (const entry of staged) {
      if (entry.temp !== '') await fs.unlink(entry.temp).catch(() => undefined)
    }
  }
}

/**
 * Filesystem implementation of {@link IThemeService} on top of
 * `<vault>/.obsidian/themes/<id>/{theme.css,manifest.json}` and
 * `<vault>/.obsidian/appearance.json`.
 *
 * Symlinks are never followed: a `theme.css` that is a link is treated as absent,
 * so a link planted in a synced vault cannot expose files outside the vault.
 */
export class ThemeService implements IThemeService {
  /** Serialises appearance.json read-modify-write cycles (and theme deletion) per vault. */
  private readonly appearanceMutex = new KeyedMutex()

  /** External hosts per stylesheet, keyed by path + mtime + size, so unchanged themes are not re-scanned on every listing. */
  private readonly analysisCache = new Map<string, StylesheetAnalysis>()

  private themeDir(vaultPath: string, themeId: string): string {
    if (!isValidThemeId(themeId)) throw new InvalidThemeIdError(themeId)
    return validateFilePath(vaultPath, `${THEMES_DIR}/${themeId}`)
  }

  private cssPath(vaultPath: string, themeId: string): string {
    return validateFilePath(vaultPath, `${THEMES_DIR}/${themeId}/theme.css`)
  }

  private manifestPath(vaultPath: string, themeId: string): string {
    return validateFilePath(vaultPath, `${THEMES_DIR}/${themeId}/manifest.json`)
  }

  /** Reads manifest.json; a missing or unparsable file yields the id-only default. */
  private async readManifest(vaultPath: string, themeId: string): Promise<ThemeManifest> {
    try {
      const stat = await lstatOrNull(this.manifestPath(vaultPath, themeId))
      if (stat === null || !stat.isFile()) return normalizeManifest(undefined, themeId)
      const raw = await withRetry(() => fs.readFile(this.manifestPath(vaultPath, themeId), 'utf-8'))
      return normalizeManifest(JSON.parse(raw) as unknown, themeId)
    } catch (error: unknown) {
      if (isNodeError(error)) throw error // I/O trouble is "unknown", not "no manifest"
      return normalizeManifest(undefined, themeId) // invalid JSON
    }
  }

  /** What the stylesheet loads and offers (hosts, Style Settings); cached per file version. `knownCss` avoids a second read. */
  private async analysisFor(cssFile: string, stat: Stats, knownCss?: string): Promise<StylesheetAnalysis> {
    const key = `${cssFile}|${stat.mtimeMs}|${stat.size}`
    const cached = this.analysisCache.get(key)
    if (cached !== undefined) return cached

    const css = knownCss ?? (stat.size <= MAX_THEME_CSS_SIZE ? await withRetry(() => fs.readFile(cssFile, 'utf-8')) : '')
    const analysis = { externalHosts: extractExternalHosts(css), hasStyleSettings: hasStyleSettingsBlock(css) }
    if (this.analysisCache.size >= ANALYSIS_CACHE_LIMIT) this.analysisCache.clear()
    this.analysisCache.set(key, analysis)
    return analysis
  }

  private async metaFor(vaultPath: string, themeId: string, stat: Stats, knownCss?: string): Promise<ThemeMeta> {
    const cssFile = this.cssPath(vaultPath, themeId)
    const [manifest, analysis] = await Promise.all([
      this.readManifest(vaultPath, themeId),
      this.analysisFor(cssFile, stat, knownCss),
    ])
    return { id: themeId, manifest, size: stat.size, updatedAt: stat.mtime.toISOString(), ...analysis }
  }

  /**
   * Returns the id of an existing theme folder whose name equals `themeId` ignoring case, or
   * `themeId` itself. On case-insensitive filesystems (Windows, macOS) `Minimal` and `minimal`
   * are the same folder, so an import must overwrite it rather than collide with it.
   */
  private async resolveExistingId(vaultPath: string, themeId: string): Promise<string> {
    let entries: Dirent[]
    try {
      entries = await withRetry(() => fs.readdir(validateFilePath(vaultPath, THEMES_DIR), { withFileTypes: true }))
    } catch (error: unknown) {
      if (isMissing(error)) return themeId
      throw error
    }
    const wanted = themeId.toLowerCase()
    return entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === wanted)?.name ?? themeId
  }

  async listThemes(vaultPath: string): Promise<ThemeMeta[]> {
    let entries: Dirent[]
    try {
      entries = await withRetry(() => fs.readdir(validateFilePath(vaultPath, THEMES_DIR), { withFileTypes: true }))
    } catch (error: unknown) {
      if (isMissing(error)) return []
      throw error
    }

    const found = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && isValidThemeId(entry.name))
        .map(async (entry): Promise<ThemeMeta | null> => {
          const stat = await lstatOrNull(this.cssPath(vaultPath, entry.name))
          if (stat === null || !stat.isFile()) return null
          return this.metaFor(vaultPath, entry.name, stat)
        }),
    )
    return found.filter((meta): meta is ThemeMeta => meta !== null).sort((a, b) => a.id.localeCompare(b.id))
  }

  async themeExists(vaultPath: string, themeId: string): Promise<boolean> {
    const stat = await lstatOrNull(this.cssPath(vaultPath, this.checkedId(themeId)))
    return stat !== null && stat.isFile()
  }

  async loadTheme(vaultPath: string, themeId: string): Promise<{ css: string; meta: ThemeMeta } | null> {
    const cssFile = this.cssPath(vaultPath, this.checkedId(themeId))
    const stat = await lstatOrNull(cssFile)
    if (stat === null || !stat.isFile()) return null
    if (stat.size > MAX_THEME_CSS_SIZE) throw new ThemeTooLargeError(MAX_THEME_CSS_SIZE, stat.size)
    const css = await withRetry(() => fs.readFile(cssFile, 'utf-8'))
    return { css, meta: await this.metaFor(vaultPath, themeId, stat, css) }
  }

  async saveTheme(
    vaultPath: string,
    requestedId: string,
    css: string,
    manifest?: ThemeManifestInput,
  ): Promise<ThemeMeta> {
    this.checkedId(requestedId)
    const size = Buffer.byteLength(css, 'utf-8')
    if (size > MAX_THEME_CSS_SIZE) throw new ThemeTooLargeError(MAX_THEME_CSS_SIZE, size)

    const themeId = await this.resolveExistingId(vaultPath, requestedId)
    await fs.mkdir(this.themeDir(vaultPath, themeId), { recursive: true })
    // The manifest is committed before the stylesheet: a folder only counts as a theme once theme.css exists.
    await writeFilesTogether([
      { path: this.manifestPath(vaultPath, themeId), content: `${JSON.stringify(normalizeManifest(manifest, themeId), null, 2)}\n` },
      { path: this.cssPath(vaultPath, themeId), content: css },
    ])

    const loaded = await this.loadTheme(vaultPath, themeId)
    if (loaded === null) throw new ThemeNotFoundError(themeId)
    return loaded.meta
  }

  async deleteTheme(vaultPath: string, themeId: string): Promise<void> {
    const dir = this.themeDir(vaultPath, themeId)
    // Remove the folder first and reset the selection only afterwards: if the removal fails (a lock
    // that outlives the retries), the vault must not lose its active theme. Both steps run under the
    // appearance mutex so a concurrent selection cannot be overwritten.
    await this.appearanceMutex.runExclusive(vaultPath, async () => {
      await withRetry(() => fs.rm(dir, { recursive: true, force: true }))

      let current: Record<string, unknown> | null
      try {
        current = await this.readAppearance(vaultPath)
      } catch (error: unknown) {
        if (error instanceof AppearanceFileInvalidError) return // never touch a file we cannot parse
        throw error
      }
      if (current !== null && current['cssTheme'] === themeId) {
        await writeJsonFileAtomic(validateFilePath(vaultPath, APPEARANCE_FILE), { ...current, cssTheme: '' })
      }
    })
  }

  async getActiveThemeId(vaultPath: string): Promise<string | null> {
    let appearance: Record<string, unknown> | null
    try {
      appearance = await this.readAppearance(vaultPath)
    } catch (error: unknown) {
      if (error instanceof AppearanceFileInvalidError) return null
      throw error
    }
    const value = appearance?.['cssTheme']
    return typeof value === 'string' && value !== '' ? value : null
  }

  async setActiveThemeId(vaultPath: string, themeId: string | null): Promise<void> {
    if (themeId !== null && !(await this.themeExists(vaultPath, themeId))) throw new ThemeNotFoundError(themeId)
    await this.appearanceMutex.runExclusive(vaultPath, async () => {
      const current = (await this.readAppearance(vaultPath)) ?? {}
      await writeJsonFileAtomic(validateFilePath(vaultPath, APPEARANCE_FILE), {
        ...current,
        cssTheme: themeId ?? '',
      })
    })
  }

  private checkedId(themeId: string): string {
    if (!isValidThemeId(themeId)) throw new InvalidThemeIdError(themeId)
    return themeId
  }

  /**
   * Reads appearance.json. Returns null if the file does not exist; throws
   * {@link AppearanceFileInvalidError} if it is not a JSON object, and the raw
   * I/O error if it cannot be read — never reports an unreadable file as absent.
   */
  private async readAppearance(vaultPath: string): Promise<Record<string, unknown> | null> {
    const file = validateFilePath(vaultPath, APPEARANCE_FILE)
    let raw: string
    try {
      raw = await withRetry(() => fs.readFile(file, 'utf-8'))
    } catch (error: unknown) {
      if (isMissing(error)) return null
      throw error
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new AppearanceFileInvalidError()
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new AppearanceFileInvalidError()
    }
    return parsed as Record<string, unknown>
  }
}
