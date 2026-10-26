import { afterEach, describe, expect, it } from 'vitest'
import type { CommunityTheme } from '../../api'
import {
  DEFAULT_FILTERS,
  currentColorMode,
  filterCatalog,
  formatDownloads,
  storeErrorMessage,
  updateNameSet,
  type StoreFilters,
} from './themeStoreFilter'

const theme = (name: string, extra: Partial<CommunityTheme> = {}): CommunityTheme => ({
  name, author: 'someone', repo: `o/${name.toLowerCase()}`, modes: ['dark', 'light'], legacy: false, ...extra,
})

const catalog: CommunityTheme[] = [
  theme('Things', { author: 'colineckert' }),
  theme('Minimal', { author: 'kepano', modes: ['dark', 'light'] }),
  theme('Night Owl', { modes: ['dark'] }),
  theme('Paper', { modes: ['light'] }),
  theme('Mystery', { modes: [] }),
  theme('Amethyst', { legacy: true }),
]

const names = (themes: CommunityTheme[]): string[] => themes.map((t) => t.name)
const withFilters = (patch: Partial<StoreFilters>): StoreFilters => ({ ...DEFAULT_FILTERS, ...patch })
const none = new Set<string>()

describe('filterCatalog', () => {
  it('sorts by downloads by default, themes without a count last and by name', () => {
    const counted = [theme('B', { downloads: 5 }), theme('Z'), theme('A', { downloads: 5 }), theme('C', { downloads: 900 }), theme('Y', { downloads: 0 })]
    expect(names(filterCatalog(counted, DEFAULT_FILTERS, none, none))).toEqual(['C', 'A', 'B', 'Y', 'Z'])
    expect(names(filterCatalog(counted, withFilters({ sort: 'name' }), none, none))).toEqual(['A', 'B', 'C', 'Y', 'Z'])
  })

  it('hides legacy themes by default, sorts by name and shows legacy on request', () => {
    expect(names(filterCatalog(catalog, withFilters({ sort: 'name' }), none, none))).toEqual(['Minimal', 'Mystery', 'Night Owl', 'Paper', 'Things'])
    expect(names(filterCatalog(catalog, withFilters({ showLegacy: true }), none, none))).toContain('Amethyst')
  })

  it('matches name and author case-insensitively', () => {
    expect(names(filterCatalog(catalog, withFilters({ query: 'THING' }), none, none))).toEqual(['Things'])
    expect(names(filterCatalog(catalog, withFilters({ query: 'kepano' }), none, none))).toEqual(['Minimal'])
    expect(names(filterCatalog(catalog, withFilters({ query: '  owl ' }), none, none))).toEqual(['Night Owl'])
    expect(filterCatalog(catalog, withFilters({ query: 'zzz' }), none, none)).toEqual([])
  })

  it('filters by color mode; a theme without listed modes is never hidden by it', () => {
    expect(names(filterCatalog(catalog, withFilters({ mode: 'light' }), none, none))).toEqual(['Minimal', 'Mystery', 'Paper', 'Things'])
    expect(names(filterCatalog(catalog, withFilters({ mode: 'dark' }), none, none))).toEqual(['Minimal', 'Mystery', 'Night Owl', 'Things'])
  })

  it('filters installed themes and themes with an update by lower-cased name', () => {
    const installed = new Set(['things', 'paper'])
    const updates = new Set(['paper'])
    expect(names(filterCatalog(catalog, withFilters({ installedOnly: true }), installed, updates))).toEqual(['Paper', 'Things'])
    expect(names(filterCatalog(catalog, withFilters({ updatesOnly: true }), installed, updates))).toEqual(['Paper'])
  })

  it('combines filters with AND', () => {
    const installed = new Set(['things', 'night owl'])
    expect(names(filterCatalog(catalog, withFilters({ installedOnly: true, mode: 'light', query: 'th' }), installed, none))).toEqual(['Things'])
  })

  it('does not modify its input', () => {
    const before = names(catalog)
    filterCatalog(catalog, DEFAULT_FILTERS, none, none)
    expect(names(catalog)).toEqual(before)
  })
})

describe('updateNameSet', () => {
  it('lower-cases the names of themes with an update and tolerates no check yet', () => {
    expect(updateNameSet(null).size).toBe(0)
    const check = { updates: [{ themeId: 'T', name: 'Things', repo: 'o/things', installedVersion: '1', latestVersion: '2' }], unknown: [], warnings: [], checked: 1, checkedAt: 'x' }
    expect([...updateNameSet(check)]).toEqual(['things'])
  })
})

describe('currentColorMode', () => {
  afterEach(() => { document.body.className = '' })

  it('reads theme-light from the body and defaults to dark', () => {
    expect(currentColorMode()).toBe('dark')
    document.body.classList.add('theme-light')
    expect(currentColorMode()).toBe('light')
  })
})

describe('storeErrorMessage', () => {
  it.each([
    ['THEME_FILES_NOT_FOUND', 'keine installierbaren Dateien'],
    ['THEME_TOO_LARGE', '6 MB'],
    ['THEME_INVALID', 'Manifest'],
    ['UPSTREAM_UNAVAILABLE', 'GitHub ist nicht erreichbar'],
    ['THEME_NOT_IN_CATALOG', 'nicht mehr im Katalog'],
    ['APPEARANCE_FILE_INVALID', 'appearance.json'],
  ])('translates %s', (code, fragment) => {
    expect(storeErrorMessage({ code, message: 'english' }, 'fallback')).toContain(fragment)
  })

  it('falls back to the server message, then to the fallback text', () => {
    expect(storeErrorMessage({ code: 'FORBIDDEN', message: 'Kein Zugriff' }, 'fallback')).toBe('Kein Zugriff')
    expect(storeErrorMessage(undefined, 'fallback')).toBe('fallback')
    expect(storeErrorMessage('boom', 'fallback')).toBe('fallback')
  })
})

describe('formatDownloads', () => {
  it('abbreviates large counts in German', () => {
    expect(formatDownloads(842)).toBe('842')
    expect(formatDownloads(1234)).toBe('1.234')
    expect(formatDownloads(567_524)).toBe('567,5 Tsd.')
    expect(formatDownloads(999_960)).toBe('1 Mio.')
    expect(formatDownloads(1_250_000)).toBe('1,3 Mio.')
  })
})
