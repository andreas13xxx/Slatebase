/**
 * Pure filtering and mapping helpers for the theme store browser. Kept out of the component so they can be unit-tested
 * and because non-component exports from a component module break fast refresh.
 */
import type { CommunityTheme, ThemeUpdateCheck } from '../../api'

/** Which color modes a theme must support. */
export type ModeFilter = 'all' | 'dark' | 'light'

/** Order of the list: most downloaded first, or alphabetical. */
export type SortOrder = 'downloads' | 'name'

/** The browser's filter state. */
export interface StoreFilters {
  /** Search text; matched against name and author, case-insensitively. */
  query: string
  mode: ModeFilter
  installedOnly: boolean
  updatesOnly: boolean
  /** Old-style (`legacy`) themes are hidden unless this is on. */
  showLegacy: boolean
  sort: SortOrder
}

/** Initial filters; the mode is set from the user's current color mode by the caller. */
export const DEFAULT_FILTERS: StoreFilters = {
  query: '',
  mode: 'all',
  installedOnly: false,
  updatesOnly: false,
  showLegacy: false,
  sort: 'downloads',
}

/** Number of cards rendered at first and added per step of the infinite list. */
export const PAGE_SIZE = 24

/** The user's current color mode, read from the `theme-light` / `theme-dark` class on `<body>`; dark if unknown. */
export function currentColorMode(): 'dark' | 'light' {
  return document.body.classList.contains('theme-light') ? 'light' : 'dark'
}

/** Whether a theme supports `mode`. A theme that lists no modes is not hidden by the filter. */
function supportsMode(theme: CommunityTheme, mode: ModeFilter): boolean {
  if (mode === 'all' || theme.modes.length === 0) return true
  return theme.modes.includes(mode)
}

/**
 * Applies the filters to the catalog and returns the matches in the chosen order (themes without a download count come last, by name).
 * `installedNames` and `updateNames` hold lower-cased theme names (an installed theme is matched to the catalog by name).
 */
export function filterCatalog(
  themes: readonly CommunityTheme[],
  filters: StoreFilters,
  installedNames: ReadonlySet<string>,
  updateNames: ReadonlySet<string>,
): CommunityTheme[] {
  const query = filters.query.trim().toLowerCase()
  return themes
    .filter((theme) => {
      if (theme.legacy && !filters.showLegacy) return false
      if (!supportsMode(theme, filters.mode)) return false
      const key = theme.name.toLowerCase()
      if (filters.installedOnly && !installedNames.has(key)) return false
      if (filters.updatesOnly && !updateNames.has(key)) return false
      if (query === '') return true
      return key.includes(query) || theme.author.toLowerCase().includes(query)
    })
    .sort((a, b) => {
      if (filters.sort === 'downloads') {
        const diff = (b.downloads ?? -1) - (a.downloads ?? -1)
        if (diff !== 0) return diff
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
}

/** German short form of a download count: `842`, `12,3 Tsd.`, `1,2 Mio.`. */
export function formatDownloads(count: number): string {
  const short = (value: number, unit: string): string => `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${unit}`
  if (count >= 999_950) return short(count / 1_000_000, 'Mio.')
  if (count >= 10_000) return short(count / 1_000, 'Tsd.')
  return count.toLocaleString('de-DE')
}

/** Lower-cased names of the themes with a newer version, for the "update available" filter. */
export function updateNameSet(check: ThemeUpdateCheck | null): Set<string> {
  return new Set((check?.updates ?? []).map((u) => u.name.toLowerCase()))
}

/** German message for an error from the theme store routes; falls back to the server's own message. */
export function storeErrorMessage(err: unknown, fallback: string): string {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined
  switch (code) {
    case 'THEME_FILES_NOT_FOUND':
      return 'Das Theme-Repository enthält keine installierbaren Dateien (erwartet: theme.css oder die ältere obsidian.css im Hauptverzeichnis, bei theme.css zusätzlich manifest.json).'
    case 'THEME_TOO_LARGE':
      return 'Das Theme ist größer als 6 MB und kann nicht installiert werden.'
    case 'THEME_INVALID':
      return 'Das Manifest des Themes ist ungültig oder passt nicht zum Katalogeintrag.'
    case 'UPSTREAM_UNAVAILABLE':
      return 'GitHub ist nicht erreichbar. Bitte später erneut versuchen.'
    case 'THEME_NOT_IN_CATALOG':
      return 'Das Theme steht nicht mehr im Katalog. Bitte die Liste neu laden.'
    case 'APPEARANCE_FILE_INVALID':
      return 'Die Datei .obsidian/appearance.json ist ungültig. Das Theme wurde nicht aktiviert.'
    default: {
      if (typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string') {
        return (err as { message: string }).message
      }
      return fallback
    }
  }
}
