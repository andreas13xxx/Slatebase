import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../../state'
import { themeInjector } from '../../plugins/appearance/theme-injector'
import { ThemeStoreBrowser } from './ThemeStoreBrowser'
import type { CommunityTheme, IApiClient, ThemeMeta, ThemeUpdateCheck } from '../../api'

const theme = (name: string, extra: Partial<CommunityTheme> = {}): CommunityTheme => ({
  name, author: 'author', repo: `owner/${name.toLowerCase().replace(/\s/g, '-')}`, modes: ['dark', 'light'], legacy: false, ...extra,
})

const THINGS = theme('Things', { author: 'colineckert' })
const MINIMAL = theme('Minimal', { author: 'kepano' })
const NIGHT_OWL = theme('Night Owl', { modes: ['dark'] })
const PAPER = theme('Paper', { modes: ['light'] })
const AMETHYST = theme('Amethyst', { legacy: true })

const installedThings: ThemeMeta = {
  id: 'Things', manifest: { name: 'Things', version: '1.0.0' }, size: 100, updatedAt: '2026-10-21T00:00:00.000Z', externalHosts: [],
}

const noUpdates: ThemeUpdateCheck = { updates: [], unknown: [], warnings: [], checked: 0, checkedAt: 'x' }

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    listStoreThemes: vi.fn().mockResolvedValue({ themes: [THINGS, MINIMAL, NIGHT_OWL, PAPER, AMETHYST], stale: false }),
    listThemes: vi.fn().mockResolvedValue({ themes: [], activeThemeId: null }),
    installStoreTheme: vi.fn().mockResolvedValue(installedThings),
    checkStoreThemeUpdates: vi.fn().mockResolvedValue(noUpdates),
    loadTheme: vi.fn().mockResolvedValue({ css: 'body { color: red; }', meta: installedThings }),
    ...overrides,
  } as unknown as IApiClient
}

function VaultSeeder() {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: [{ id: 'vault1', name: 'My Vault' }] })
    dispatch({ type: 'VAULT_SELECTED', payload: 'vault1' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderBrowser(apiClient: IApiClient) {
  return render(
    <AppProvider apiClient={apiClient}>
      <VaultSeeder />
      <ThemeStoreBrowser />
    </AppProvider>,
  )
}

/** Names of the cards currently listed, in order. */
const cardNames = (): string[] => screen.queryAllByRole('heading', { level: 4 }).map((h) => h.textContent ?? '')
/** Cheap card count for long lists (role queries over 60 cards are slow on a loaded machine). */
const cardCount = (): number => document.querySelectorAll('li.theme-store-card').length
const themeTag = (): Element | null => document.head.querySelector('style[data-slatebase-theme]')
const cardOf = (name: string): HTMLElement => screen.getByRole('heading', { level: 4, name }).closest('li') as HTMLElement

describe('ThemeStoreBrowser', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.body.className = 'theme-dark'
  })

  afterEach(() => {
    themeInjector.remove()
    document.body.className = ''
  })

  it('lists the catalog sorted by name, without legacy themes, for the current color mode', async () => {
    renderBrowser(createMockApiClient())

    await screen.findByText('3 von 3 angezeigt (Katalog: 5)')
    // dark mode: "Paper" (light only) is filtered out, "Amethyst" is legacy
    expect(cardNames()).toEqual(['Minimal', 'Night Owl', 'Things'])
  })

  it('starts in light mode when the interface is light', async () => {
    document.body.className = 'theme-light'
    renderBrowser(createMockApiClient())

    await screen.findByText(/angezeigt/)
    expect(cardNames()).toEqual(['Minimal', 'Paper', 'Things'])
  })

  it('shows the screenshot through the Slatebase backend, never GitHub, and a placeholder if it fails', async () => {
    renderBrowser(createMockApiClient())
    await screen.findByText(/angezeigt/)

    const image = within(cardOf('Things')).getByRole('img', { name: /Vorschau von Things/ })
    expect(image.getAttribute('src')).toBe('/api/v1/theme-store/screenshot?repo=owner%2Fthings')

    fireEvent.error(image)
    expect(within(cardOf('Things')).getByText('Keine Vorschau')).toBeInTheDocument()
  })

  it('filters by the search text after the debounce', async () => {
    renderBrowser(createMockApiClient())
    await screen.findByText(/angezeigt/)

    fireEvent.change(screen.getByLabelText('Suchen'), { target: { value: 'kepano' } })

    await waitFor(() => expect(cardNames()).toEqual(['Minimal']))
  })

  it('shows the empty state and resets the filters from it', async () => {
    renderBrowser(createMockApiClient())
    await screen.findByText(/angezeigt/)

    fireEvent.change(screen.getByLabelText('Suchen'), { target: { value: 'zzzz' } })
    expect(await screen.findByText('Keine Themes gefunden')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }))
    await waitFor(() => expect(cardNames()).toEqual(['Minimal', 'Night Owl', 'Paper', 'Things']))
    expect(screen.getByLabelText('Suchen')).toHaveValue('')
  })

  it('reveals legacy themes on request', async () => {
    renderBrowser(createMockApiClient())
    await screen.findByText(/angezeigt/)

    fireEvent.click(screen.getByLabelText('Veraltete anzeigen'))

    expect(cardNames()).toContain('Amethyst')
    expect(within(cardOf('Amethyst')).getByText(/Veraltet/)).toBeInTheDocument()
  })

  it('marks installed themes with their version and offers Installieren for the rest', async () => {
    renderBrowser(createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [installedThings], activeThemeId: null }),
    }))
    await screen.findByText(/angezeigt/)

    expect(await within(cardOf('Things')).findByText(/Installiert \(1\.0\.0\)/)).toBeInTheDocument()
    expect(within(cardOf('Minimal')).getByRole('button', { name: 'Minimal installieren' })).toBeInTheDocument()
  })

  it('installs a theme, refreshes the list and announces it', async () => {
    const apiClient = createMockApiClient({
      listThemes: vi.fn()
        .mockResolvedValueOnce({ themes: [], activeThemeId: null })
        .mockResolvedValue({ themes: [installedThings], activeThemeId: null }),
    })
    renderBrowser(apiClient)
    await screen.findByText(/angezeigt/)

    fireEvent.click(screen.getByRole('button', { name: 'Things installieren' }))

    await waitFor(() => expect(apiClient.installStoreTheme).toHaveBeenCalledWith('vault1', 'owner/things', { replace: false, activate: false }))
    expect(await within(cardOf('Things')).findByText(/Installiert \(1\.0\.0\)/)).toBeInTheDocument()
    expect(screen.getByText('"Things" wurde installiert.')).toBeInTheDocument()
    expect(themeTag()).toBeNull() // not activated, so nothing is applied
  })

  it('activates the theme and applies it right away when asked to', async () => {
    const apiClient = createMockApiClient({
      listThemes: vi.fn()
        .mockResolvedValueOnce({ themes: [], activeThemeId: null })
        .mockResolvedValue({ themes: [installedThings], activeThemeId: 'Things' }),
    })
    renderBrowser(apiClient)
    await screen.findByText(/angezeigt/)

    fireEvent.click(screen.getByLabelText('Nach der Installation aktivieren'))
    fireEvent.click(screen.getByRole('button', { name: 'Things installieren' }))

    await waitFor(() => expect(apiClient.installStoreTheme).toHaveBeenCalledWith('vault1', 'owner/things', { replace: false, activate: true }))
    await waitFor(() => expect(themeTag()?.textContent).toBe('body { color: red; }'))
    expect(screen.getByText('"Things" wurde installiert und aktiviert.')).toBeInTheDocument()
  })

  it('asks before replacing a theme that already exists, then replaces it', async () => {
    const installStoreTheme = vi.fn()
      .mockRejectedValueOnce({ code: 'THEME_ALREADY_INSTALLED', message: 'exists' })
      .mockResolvedValue(installedThings)
    const apiClient = createMockApiClient({ installStoreTheme })
    renderBrowser(apiClient)
    await screen.findByText(/angezeigt/)

    fireEvent.click(screen.getByRole('button', { name: 'Things installieren' }))
    expect(await screen.findByText(/bereits installiert/)).toBeInTheDocument()
    expect(installStoreTheme).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Ersetzen' }))

    await waitFor(() => expect(installStoreTheme).toHaveBeenLastCalledWith('vault1', 'owner/things', { replace: true, activate: false }))
  })

  it('does not replace anything when the question is cancelled', async () => {
    const installStoreTheme = vi.fn().mockRejectedValue({ code: 'THEME_ALREADY_INSTALLED', message: 'exists' })
    renderBrowser(createMockApiClient({ installStoreTheme }))
    await screen.findByText(/angezeigt/)

    fireEvent.click(screen.getByRole('button', { name: 'Things installieren' }))
    await screen.findByText(/bereits installiert/)
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(installStoreTheme).toHaveBeenCalledTimes(1)
  })

  it('shows the reason on the card when an install fails, and keeps the button for another try', async () => {
    renderBrowser(createMockApiClient({
      installStoreTheme: vi.fn().mockRejectedValue({ code: 'THEME_FILES_NOT_FOUND', message: 'missing' }),
    }))
    await screen.findByText(/angezeigt/)

    fireEvent.click(screen.getByRole('button', { name: 'Things installieren' }))

    expect(await within(cardOf('Things')).findByRole('alert')).toHaveTextContent(/keine installierbaren Dateien/)
    expect(screen.getByRole('button', { name: 'Things installieren' })).toBeEnabled()
  })

  it('checks for updates, shows old → new and updates with replace', async () => {
    const check: ThemeUpdateCheck = {
      updates: [{ themeId: 'Things', name: 'Things', repo: 'owner/things', installedVersion: '1.0.0', latestVersion: '1.1.0' }],
      unknown: [], warnings: [], checked: 1, checkedAt: 'x',
    }
    const apiClient = createMockApiClient({
      listThemes: vi.fn().mockResolvedValue({ themes: [installedThings], activeThemeId: null }),
      checkStoreThemeUpdates: vi.fn().mockResolvedValue(check),
    })
    renderBrowser(apiClient)
    await screen.findByText(/angezeigt/)

    fireEvent.click(screen.getByRole('button', { name: /Nach Updates suchen/ }))

    expect(await screen.findByText('1 Update verfügbar')).toBeInTheDocument()
    expect(within(cardOf('Things')).getByText('1.0.0 → 1.1.0')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Things aktualisieren' }))

    await waitFor(() => expect(apiClient.installStoreTheme).toHaveBeenCalledWith('vault1', 'owner/things', { replace: true, activate: false }))
    await waitFor(() => expect(screen.queryByText('1.0.0 → 1.1.0')).not.toBeInTheDocument())
  })

  it('says everything is up to date only when nothing failed', async () => {
    const apiClient = createMockApiClient({
      checkStoreThemeUpdates: vi.fn().mockResolvedValue({ ...noUpdates, checked: 2 }),
    })
    renderBrowser(apiClient)
    await screen.findByText(/angezeigt/)

    fireEvent.click(screen.getByRole('button', { name: /Nach Updates suchen/ }))

    expect(await screen.findByText('Alle Themes sind aktuell.')).toBeInTheDocument()
  })

  it('lists themes that could not be checked instead of claiming they are up to date', async () => {
    renderBrowser(createMockApiClient({
      checkStoreThemeUpdates: vi.fn().mockResolvedValue({ ...noUpdates, checked: 1, warnings: ['Minimal: Theme store request failed'] }),
    }))
    await screen.findByText(/angezeigt/)

    fireEvent.click(screen.getByRole('button', { name: /Nach Updates suchen/ }))

    expect(await screen.findByText(/nicht alle Themes ließen sich prüfen/)).toBeInTheDocument()
    expect(screen.getByText(/Nicht geprüft: Minimal/)).toBeInTheDocument()
    expect(screen.queryByText('Alle Themes sind aktuell.')).not.toBeInTheDocument()
  })

  it('shows an error when the update check itself fails', async () => {
    renderBrowser(createMockApiClient({
      checkStoreThemeUpdates: vi.fn().mockRejectedValue({ code: 'UPSTREAM_UNAVAILABLE', message: 'x' }),
    }))
    await screen.findByText(/angezeigt/)

    fireEvent.click(screen.getByRole('button', { name: /Nach Updates suchen/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub ist nicht erreichbar')
  })

  it('reports an unreachable catalog and loads it again on "Erneut versuchen"', async () => {
    const listStoreThemes = vi.fn()
      .mockRejectedValueOnce({ code: 'UPSTREAM_UNAVAILABLE', message: 'x' })
      .mockResolvedValue({ themes: [THINGS], stale: false })
    renderBrowser(createMockApiClient({ listStoreThemes }))

    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub ist nicht erreichbar')
    expect(cardNames()).toEqual([]) // an error is not an empty catalog

    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    await waitFor(() => expect(cardNames()).toEqual(['Things']))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tells the user when the last known list is shown', async () => {
    renderBrowser(createMockApiClient({
      listStoreThemes: vi.fn().mockResolvedValue({ themes: [THINGS], stale: true }),
    }))

    expect(await screen.findByText(/zuletzt bekannte Liste/)).toBeInTheDocument()
  })

  it('grows the list 24 at a time with the "Mehr laden" button', async () => {
    const many = Array.from({ length: 60 }, (_, i) => theme(`Theme ${String(i).padStart(2, '0')}`))
    renderBrowser(createMockApiClient({ listStoreThemes: vi.fn().mockResolvedValue({ themes: many, stale: false }) }))

    expect(await screen.findByText('24 von 60 angezeigt (Katalog: 60)')).toBeInTheDocument()
    expect(cardCount()).toBe(24)

    fireEvent.click(screen.getByRole('button', { name: 'Mehr laden' }))
    expect(await screen.findByText('48 von 60 angezeigt (Katalog: 60)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mehr laden' }))
    expect(await screen.findByText('60 von 60 angezeigt (Katalog: 60)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mehr laden' })).not.toBeInTheDocument()
    expect(cardCount()).toBe(60)
  }, 20_000)

  it('keeps the grown list when nothing about the search changed (the debounce timer must not undo it)', async () => {
    const many = Array.from({ length: 60 }, (_, i) => theme(`Theme ${String(i).padStart(2, '0')}`))
    renderBrowser(createMockApiClient({ listStoreThemes: vi.fn().mockResolvedValue({ themes: many, stale: false }) }))
    await screen.findByText(/24 von 60/)
    fireEvent.click(screen.getByRole('button', { name: 'Mehr laden' }))
    await screen.findByText(/48 von 60/)

    await new Promise((resolve) => setTimeout(resolve, 400)) // longer than the 200 ms debounce

    expect(screen.getByText(/48 von 60/)).toBeInTheDocument()
  }, 20_000)

  it('goes back to the first page when a filter changes', async () => {
    const many = Array.from({ length: 60 }, (_, i) => theme(`Theme ${String(i).padStart(2, '0')}`))
    renderBrowser(createMockApiClient({ listStoreThemes: vi.fn().mockResolvedValue({ themes: many, stale: false }) }))
    await screen.findByText(/24 von 60/)
    fireEvent.click(screen.getByRole('button', { name: 'Mehr laden' }))
    await screen.findByText(/48 von 60/)

    fireEvent.click(screen.getByLabelText('Installiert'))
    fireEvent.click(screen.getByLabelText('Installiert'))

    expect(await screen.findByText(/24 von 60/)).toBeInTheDocument()
  }, 20_000)

  it('shows the third-party-CSS notice until the first install, then never again', async () => {
    const { unmount } = renderBrowser(createMockApiClient())
    expect(await screen.findByText(/Themes sind fremdes CSS/)).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Things installieren' }))
    await waitFor(() => expect(screen.queryByText(/Themes sind fremdes CSS/)).not.toBeInTheDocument())
    expect(window.localStorage.getItem('slatebase.themeStore.noticeSeen')).toBe('1')

    unmount()
    renderBrowser(createMockApiClient())
    await screen.findByText(/angezeigt/)
    expect(screen.queryByText(/Themes sind fremdes CSS/)).not.toBeInTheDocument()
  })
})
