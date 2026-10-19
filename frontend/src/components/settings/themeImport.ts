/**
 * Helpers for importing an Obsidian theme from files picked or dropped by the user.
 * Kept out of ThemeManager.tsx so they can be unit-tested (and because non-component
 * exports from a component module break fast refresh).
 */

/** Same limit as the backend (`MAX_THEME_CSS_SIZE`). */
export const MAX_THEME_CSS_BYTES = 2 * 1024 * 1024

/** The files that make up an importable theme. */
export interface ThemeFiles {
  css: File
  manifest: File | null
}

/** Result of reading the picked files: either an importable theme or a message for the user. */
export type ThemeFilesResult = { ok: true; files: ThemeFiles } | { ok: false; message: string }

/**
 * Finds the stylesheet and the optional manifest among the picked files.
 * `theme.css` wins if several stylesheets were picked; `manifest.json` is the only manifest name.
 */
export function pickThemeFiles(files: readonly File[]): ThemeFilesResult {
  const stylesheets = files.filter((f) => f.name.toLowerCase().endsWith('.css'))
  if (stylesheets.length === 0) {
    return { ok: false, message: 'Bitte eine theme.css auswählen (optional zusammen mit manifest.json).' }
  }
  const css = stylesheets.find((f) => f.name.toLowerCase() === 'theme.css') ?? stylesheets[0]!
  if (css.size > MAX_THEME_CSS_BYTES) {
    return { ok: false, message: 'Die Datei überschreitet die maximale Größe von 2 MB.' }
  }
  const manifest = files.find((f) => f.name.toLowerCase() === 'manifest.json') ?? null
  return { ok: true, files: { css, manifest } }
}

/**
 * Turns a theme name into a safe folder name (the backend allows letters, digits, space,
 * `_`, `.` and `-`, starting alphanumeric and not ending in `.` or space). Returns null if
 * nothing usable is left.
 */
export function toThemeId(rawName: string): string | null {
  const cleaned = rawName
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 _.-]/g, '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 120)
    .replace(/[. ]+$/, '')
  return cleaned === '' ? null : cleaned
}

/** Picks the theme folder name: manifest name first, then the stylesheet's file name (unless it is `theme.css`). */
export function deriveThemeId(manifestName: string | null, cssFileName: string): string | null {
  const fromManifest = manifestName === null ? null : toThemeId(manifestName)
  if (fromManifest !== null) return fromManifest
  const base = cssFileName.replace(/\.css$/i, '')
  return base.toLowerCase() === 'theme' ? null : toThemeId(base)
}

/** Reads `name`, `version`, `author` … from a manifest file; unreadable or invalid JSON yields an empty object. */
export async function readManifestFields(
  file: File | null,
): Promise<{ name?: string; version?: string; author?: string; authorUrl?: string; minAppVersion?: string }> {
  if (file === null) return {}
  try {
    const parsed: unknown = JSON.parse(await file.text())
    if (typeof parsed !== 'object' || parsed === null) return {}
    const record = parsed as Record<string, unknown>
    const out: { name?: string; version?: string; author?: string; authorUrl?: string; minAppVersion?: string } = {}
    for (const key of ['name', 'version', 'author', 'authorUrl', 'minAppVersion'] as const) {
      const value = record[key]
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

/** Formats a byte count for the theme list. */
export function formatThemeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}
