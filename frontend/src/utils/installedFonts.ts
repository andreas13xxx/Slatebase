/**
 * Which fonts the browser can use for the vault's font settings.
 *
 * Browsers do not list installed fonts without permission, so there are two sources: a curated list of
 * common fonts, filtered by measuring whether the browser really has them (no permission needed), and — in
 * Chromium — `queryLocalFonts()`, which lists everything installed after the user allows it.
 *
 * @module utils/installedFonts
 */

/** Fonts commonly found on Windows, macOS, Linux and Android, plus the CSS generic families. */
export const COMMON_FONTS: readonly string[] = [
  'Arial', 'Arial Narrow', 'Avenir', 'Avenir Next', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara',
  'Cantarell', 'Century Gothic', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'DejaVu Sans',
  'DejaVu Sans Mono', 'DejaVu Serif', 'Droid Sans', 'Fira Code', 'Fira Sans', 'Franklin Gothic Medium',
  'Garamond', 'Geneva', 'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Impact', 'Inter',
  'JetBrains Mono', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Lucida Console',
  'Lucida Sans Unicode', 'Menlo', 'Monaco', 'Noto Sans', 'Noto Serif', 'Open Sans', 'Optima',
  'Palatino Linotype', 'Roboto', 'Roboto Mono', 'SF Mono', 'Segoe UI', 'Source Code Pro', 'Source Sans Pro',
  'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Ubuntu', 'Verdana',
]

/** CSS generic families, always available. */
export const GENERIC_FONTS: readonly string[] = ['sans-serif', 'serif', 'monospace', 'system-ui']

const BASE_FAMILIES = ['monospace', 'serif', 'sans-serif'] as const
const SAMPLE = 'mmmmmmmmmmlliWQ@#0123456789'

/**
 * The entries of `candidates` the browser has installed, judged by whether text set in the font measures
 * differently from every fallback family. Returns an empty list where no canvas is available.
 */
export function detectInstalledFonts(candidates: readonly string[] = COMMON_FONTS): string[] {
  if (typeof document === 'undefined') return []
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return []
  const measure = (family: string): number => {
    context.font = `72px ${family}`
    return context.measureText(SAMPLE).width
  }
  const baseline = BASE_FAMILIES.map((base) => measure(base))
  return candidates.filter((name) =>
    BASE_FAMILIES.some((base, index) => measure(`"${name}", ${base}`) !== baseline[index]),
  )
}

interface LocalFontData { family: string }
type QueryLocalFonts = () => Promise<LocalFontData[]>

/** Whether the browser can list every installed font (Chromium, after a permission prompt). */
export function canQueryLocalFonts(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts === 'function'
}

/** All installed font families, sorted and without duplicates. Rejects when the user denies access. */
export async function queryAllInstalledFonts(): Promise<string[]> {
  const query = (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts
  if (!query) return []
  const fonts = await query.call(window)
  return [...new Set(fonts.map((font) => font.family))].sort((a, b) => a.localeCompare(b))
}
