import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import type { Dirent, Stats } from 'node:fs'
import { KeyedMutex } from '../shared/async-mutex.js'
import { isNodeError } from '../shared/fs-utils.js'
import { writeJsonFileAtomic } from '../shared/json-file-store.js'
import { validateFilePath } from '../vault/index.js'
import { AppearanceFileInvalidError, InvalidThemeIdError, ThemeNotFoundError, ThemeTooLargeError } from './errors.js'
import type { IThemeService, ThemeManifest, ThemeManifestInput, ThemeMeta } from './types.js'
import { MAX_THEME_CSS_SIZE, extractExternalHosts, isValidThemeId, normalizeManifest } from './validation.js'

const THEMES_DIR = '.obsidian/themes'
const APPEARANCE_FILE = '.obsidian/appearance.json'

/** Attempts for reads/renames that can hit transient Windows locks (OneDrive, antivirus). */
const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 50
const TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

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

/** Writes `content` via temp file + rename, retrying the rename on transient lock errors. */
async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${randomBytes(8).toString('hex')}.tmp`
  await fs.writeFile(tempPath, content, 'utf-8')
  try {
    await withRetry(() => fs.rename(tempPath, filePath))
  } catch (error: unknown) {
    await fs.unlink(tempPath).catch(() => undefined)
    throw error
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
  /** Serialises appearance.json read-modify-write cycles per vault. */
  private readonly appearanceMutex = new KeyedMutex()

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

  private async metaFor(vaultPath: string, themeId: string, stat: Stats, css: string): Promise<ThemeMeta> {
    return {
      id: themeId,
      manifest: await this.readManifest(vaultPath, themeId),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      externalHosts: extractExternalHosts(css),
    }
  }

  async listThemes(vaultPath: string): Promise<ThemeMeta[]> {
    let entries: Dirent[]
    try {
      entries = await withRetry(() => fs.readdir(validateFilePath(vaultPath, THEMES_DIR), { withFileTypes: true }))
    } catch (error: unknown) {
      if (isMissing(error)) return []
      throw error
    }

    const themes: ThemeMeta[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidThemeId(entry.name)) continue
      const cssFile = this.cssPath(vaultPath, entry.name)
      const stat = await lstatOrNull(cssFile)
      if (stat === null || !stat.isFile()) continue
      const css = stat.size <= MAX_THEME_CSS_SIZE ? await withRetry(() => fs.readFile(cssFile, 'utf-8')) : ''
      themes.push(await this.metaFor(vaultPath, entry.name, stat, css))
    }
    return themes.sort((a, b) => a.id.localeCompare(b.id))
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
    themeId: string,
    css: string,
    manifest?: ThemeManifestInput,
  ): Promise<ThemeMeta> {
    const dir = this.themeDir(vaultPath, themeId)
    const size = Buffer.byteLength(css, 'utf-8')
    if (size > MAX_THEME_CSS_SIZE) throw new ThemeTooLargeError(MAX_THEME_CSS_SIZE, size)

    await fs.mkdir(dir, { recursive: true })
    await writeFileAtomic(this.cssPath(vaultPath, themeId), css)
    await writeJsonFileAtomic(this.manifestPath(vaultPath, themeId), normalizeManifest(manifest, themeId))

    const loaded = await this.loadTheme(vaultPath, themeId)
    if (loaded === null) throw new ThemeNotFoundError(themeId)
    return loaded.meta
  }

  async deleteTheme(vaultPath: string, themeId: string): Promise<void> {
    const dir = this.themeDir(vaultPath, themeId)
    if ((await this.getActiveThemeId(vaultPath)) === themeId) {
      await this.setActiveThemeId(vaultPath, null)
    }
    await withRetry(() => fs.rm(dir, { recursive: true, force: true }))
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
    if (themeId !== null) {
      const stat = await lstatOrNull(this.cssPath(vaultPath, this.checkedId(themeId)))
      if (stat === null || !stat.isFile()) throw new ThemeNotFoundError(themeId)
    }
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
