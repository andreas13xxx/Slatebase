/**
 * ThemeStoreBrowser — the "Entdecken" tab of the Themes section: browse Obsidian's community theme catalog,
 * install a theme into the vault and check the installed ones for updates.
 *
 * The catalog, the files and the screenshots all come through the Slatebase backend; this browser never contacts
 * GitHub itself. The list grows as the user scrolls (24 cards at a time); the "Mehr laden" button is the equivalent
 * for keyboard and screen-reader users and for browsers without IntersectionObserver.
 */
import { useTranslation, translateNow } from '../../i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAppContext } from '../../state'
import type { CommunityThemeCatalog, ThemeMeta, ThemeUpdateCheck } from '../../api'
import { themeInjector } from '../../plugins/appearance/theme-injector'
import { ConfirmModal } from '../ConfirmModal'
import { ThemeStoreCard } from './ThemeStoreCard'
import { Button } from './ui'
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  currentColorMode,
  filterCatalog,
  storeErrorMessage,
  updateNameSet,
  type ModeFilter,
  type SortOrder,
  type StoreFilters,
} from './themeStoreFilter'
import './ThemeStoreBrowser.css'

/** Browser-side memory that the third-party-CSS notice was shown once. A cache, not a setting. */
const NOTICE_SEEN_KEY = 'slatebase.themeStore.noticeSeen'
const SEARCH_DEBOUNCE_MS = 200

function noticeAlreadySeen(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function rememberNoticeSeen(): void {
  try {
    window.localStorage.setItem(NOTICE_SEEN_KEY, '1')
  } catch {
    // Private mode or blocked storage: the notice simply shows again next time.
  }
}

/** Whether the list should grow by itself while scrolling (not for reduced motion, not without the API). */
function canAutoLoad(): boolean {
  if (typeof IntersectionObserver === 'undefined') return false
  return !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

export function ThemeStoreBrowser() {
  const { t } = useTranslation()
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  const [catalog, setCatalog] = useState<CommunityThemeCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(() => Boolean(apiClient))
  const [reloadKey, setReloadKey] = useState(0)

  const [installed, setInstalled] = useState<ThemeMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [updates, setUpdates] = useState<ThemeUpdateCheck | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  const [filters, setFilters] = useState<StoreFilters>(() => ({ ...DEFAULT_FILTERS, mode: currentColorMode() }))
  const [queryInput, setQueryInput] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [replacing, setReplacing] = useState<{ repo: string; name: string } | null>(null)
  const [activateAfter, setActivateAfter] = useState(false)
  const [notice, setNotice] = useState('')
  const [showNotice, setShowNotice] = useState(() => !noticeAlreadySeen())
  const sentinelRef = useRef<HTMLDivElement>(null)
  /** The search text the filters currently use (the debounce timer compares against it). */
  const appliedQueryRef = useRef('')
  /** False once this browser unmounted (for example because the vault changed): late results are dropped. */
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  // Catalog: loaded on mount and whenever "Erneut versuchen" bumps reloadKey.
  useEffect(() => {
    if (!apiClient) return
    let cancelled = false
    apiClient.listStoreThemes()
      .then((result) => {
        if (cancelled) return
        setCatalog(result)
        setCatalogError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setCatalogError(storeErrorMessage(err, translateNow('settingsUi.catalogLoadFailed')))
      })
      .finally(() => { if (!cancelled) setLoadingCatalog(false) })
    return () => { cancelled = true }
  }, [apiClient, reloadKey])

  // Installed themes: needed for the "Installiert" state and the installed filter.
  useEffect(() => {
    if (!vaultId || !apiClient) return
    let cancelled = false
    apiClient.listThemes(vaultId)
      .then((result) => {
        if (cancelled) return
        setInstalled(result.themes)
        setActiveId(result.activeThemeId)
      })
      .catch(() => {
        // Without the list every card offers "Installieren"; the server answers 409 for one that exists.
      })
    return () => { cancelled = true }
  }, [vaultId, apiClient])

  // Search is applied 200 ms after the last keystroke. Only a changed text goes back to the first page; the timer also
  // fires once after mount, and it must not undo "Mehr laden" there.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (appliedQueryRef.current === queryInput) return
      appliedQueryRef.current = queryInput
      setFilters((f) => ({ ...f, query: queryInput }))
      setVisibleCount(PAGE_SIZE)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [queryInput])

  const installedByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const theme of installed) map.set(theme.manifest.name.toLowerCase(), theme.manifest.version ?? '')
    return map
  }, [installed])
  const updatesByName = useMemo(() => new Map((updates?.updates ?? []).map((u) => [u.name.toLowerCase(), u])), [updates])

  const filtered = useMemo(
    () => filterCatalog(catalog?.themes ?? [], filters, new Set(installedByName.keys()), updateNameSet(updates)),
    [catalog, filters, installedByName, updates],
  )
  const visible = filtered.slice(0, visibleCount)
  const hasMore = visible.length < filtered.length

  const changeFilters = useCallback((patch: Partial<StoreFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setVisibleCount(PAGE_SIZE)
  }, [])

  const loadMore = useCallback(() => setVisibleCount((n) => n + PAGE_SIZE), [])

  // Grow the list when the end marker scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || !canAutoLoad()) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore, visibleCount])

  const applyLocally = useCallback(async (themeId: string) => {
    if (!vaultId || !apiClient) return
    const { css } = await apiClient.loadTheme(vaultId, themeId)
    // Switched to another vault meanwhile: this theme belongs to the old one and must not be injected now.
    if (!aliveRef.current) return
    themeInjector.apply(themeId, css)
  }, [vaultId, apiClient])

  const runInstall = useCallback(async (repo: string, name: string, replace: boolean, themeId?: string) => {
    if (!vaultId || !apiClient) return
    setBusy((b) => ({ ...b, [repo]: true }))
    setErrors((e) => {
      const { [repo]: _removed, ...rest } = e
      return rest
    })
    try {
      const meta = await apiClient.installStoreTheme(vaultId, repo, { replace, activate: activateAfter, ...(themeId !== undefined ? { themeId } : {}) })
      // The vault was switched while the download ran: the install itself is done, but nothing here may show it.
      if (!aliveRef.current) return

      let nowActive = activateAfter ? meta.id : activeId
      try {
        const list = await apiClient.listThemes(vaultId)
        if (!aliveRef.current) return
        setInstalled(list.themes)
        setActiveId(list.activeThemeId)
        nowActive = list.activeThemeId
      } catch {
        // The install itself succeeded; show it even if the refresh failed.
        setInstalled((prev) => [...prev.filter((t) => t.id !== meta.id), meta])
      }
      setUpdates((u) => (u ? { ...u, updates: u.updates.filter((x) => x.repo !== repo) } : u))
      if (showNotice) {
        rememberNoticeSeen()
        setShowNotice(false)
      }

      // The installed or updated theme is the one in use: show it here right away (others follow via vault:change).
      if (nowActive === meta.id) {
        try {
          await applyLocally(meta.id)
          if (!aliveRef.current) return
        } catch {
          setNotice(`"${name}" wurde ${replace ? 'aktualisiert' : 'installiert'}, konnte hier aber nicht angezeigt werden.`)
          return
        }
      }
      setNotice(`"${name}" wurde ${replace ? 'aktualisiert' : 'installiert'}${activateAfter ? ' und aktiviert' : ''}.`)
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'THEME_ALREADY_INSTALLED') {
        setReplacing({ repo, name })
      } else {
        setErrors((e) => ({ ...e, [repo]: storeErrorMessage(err, `"${name}" konnte nicht installiert werden`) }))
      }
    } finally {
      setBusy((b) => {
        const { [repo]: _done, ...rest } = b
        return rest
      })
    }
  }, [vaultId, apiClient, activateAfter, activeId, applyLocally, showNotice])

  const checkUpdates = useCallback(async () => {
    if (!vaultId || !apiClient) return
    setCheckingUpdates(true)
    setUpdateError(null)
    try {
      setUpdates(await apiClient.checkStoreThemeUpdates(vaultId))
    } catch (err) {
      setUpdateError(storeErrorMessage(err, translateNow('settingsUi.updateCheckFailed')))
    } finally {
      setCheckingUpdates(false)
    }
  }, [vaultId, apiClient])

  if (!vaultId) return null

  const updateCount = updates?.updates.length ?? 0

  return (
    <div className="theme-store">
      {showNotice && (
        <p className="theme-store__notice">
          {t('settingsUi.storeNotice')}
        </p>
      )}

      {catalogError !== null && (
        <div className="theme-store__error" role="alert">
          <span>{catalogError}</span>
          <Button size="sm" onClick={() => { setLoadingCatalog(true); setCatalogError(null); setReloadKey((k) => k + 1) }}>
            {t('settingsUi.retry')}
          </Button>
        </div>
      )}
      {catalog?.stale === true && (
        <p className="theme-store__stale">{t('settingsUi.githubDown')}</p>
      )}
      {loadingCatalog && <p className="theme-store__loading" role="status">{t('settingsUi.catalogLoading')}</p>}

      {catalog !== null && (
        <>
          <div className="theme-store__controls">
            <label className="theme-store__field">
              <span>{t('settingsUi.searchLabel')}</span>
              <input
                type="search"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder={t('settingsUi.namePh')}
              />
            </label>
            <label className="theme-store__field">
              <span>{t('settingsUi.mode')}</span>
              <select value={filters.mode} onChange={(e) => changeFilters({ mode: e.target.value as ModeFilter })}>
                <option value="all">{t('settingsUi.all')}</option>
                <option value="light">{t('settingsUi.light')}</option>
                <option value="dark">{t('settingsUi.dark')}</option>
              </select>
            </label>
            {catalog.themes.some((t) => t.downloads !== undefined) && (
            <label className="theme-store__field">
              <span>{t('settingsUi.sortBy')}</span>
              <select value={filters.sort} onChange={(e) => changeFilters({ sort: e.target.value as SortOrder })}>
                <option value="downloads">{t('settingsUi.byDownloads')}</option>
                <option value="name">{t('settingsUi.byName')}</option>
              </select>
            </label>
            )}
            <label className="theme-store__check">
              <input type="checkbox" checked={filters.installedOnly} onChange={(e) => changeFilters({ installedOnly: e.target.checked })} />
              {t('settingsUi.filterInstalled')}
            </label>
            <label className="theme-store__check">
              <input type="checkbox" checked={filters.updatesOnly} onChange={(e) => changeFilters({ updatesOnly: e.target.checked })} />
              {t('settingsUi.filterUpdates')}
            </label>
            <label className="theme-store__check">
              <input type="checkbox" checked={filters.showLegacy} onChange={(e) => changeFilters({ showLegacy: e.target.checked })} />
              {t('settingsUi.showLegacy')}
            </label>
            <label className="theme-store__check">
              <input type="checkbox" checked={activateAfter} onChange={(e) => setActivateAfter(e.target.checked)} />
              {t('settingsUi.activateAfter')}
            </label>
          </div>

          <div className="theme-store__updates">
            <Button size="sm" onClick={() => void checkUpdates()} disabled={checkingUpdates}>
              <RefreshCw size={13} aria-hidden="true" /> {checkingUpdates ? t('settingsUi.checking') : t('settingsUi.checkUpdates')}
            </Button>
            <span className="theme-store__update-result" role="status">
              {updates !== null && updateCount > 0 && (updateCount === 1 ? t('settingsUi.updatesAvailableOne', { count: updateCount }) : t('settingsUi.updatesAvailableMany', { count: updateCount }))}
              {updates !== null && updateCount === 0 && updates.warnings.length === 0 && (
                updates.checked === 0 ? t('settingsUi.noneInCatalog') : t('settingsUi.allUpToDate')
              )}
              {updates !== null && updateCount === 0 && updates.warnings.length > 0 && t('settingsUi.someUnchecked')}
            </span>
          </div>
          {updateError !== null && <p className="theme-store__error-text" role="alert">{updateError}</p>}
          {updates !== null && updates.warnings.length > 0 && (
            <ul className="theme-store__warnings">
              {updates.warnings.map((w) => <li key={w}>{t('settingsUi.notChecked', { name: w })}</li>)}
            </ul>
          )}
          {updates !== null && updates.unknown.length > 0 && (
            <p className="theme-store__hint">{t('settingsUi.versionIncomparable', { list: updates.unknown.join(', ') })}</p>
          )}

          <p className="theme-store__count" aria-live="polite">
            {filtered.length === 0
              ? t('settingsUi.noThemesFound')
              : t('settingsUi.shownOf', { visible: visible.length, total: filtered.length, catalog: catalog.themes.length })}
          </p>
          {filtered.length === 0 && (
            <Button size="sm" onClick={() => { setQueryInput(''); appliedQueryRef.current = ''; setFilters({ ...DEFAULT_FILTERS, mode: 'all', sort: filters.sort }); setVisibleCount(PAGE_SIZE) }}>
              {t('settingsUi.resetFilters')}
            </Button>
          )}

          <ul className="theme-store__grid" aria-label={t('settingsUi.communityThemes')}>
            {visible.map((theme) => (
              <ThemeStoreCard
                key={theme.repo}
                theme={theme}
                installedVersion={installedByName.get(theme.name.toLowerCase())}
                update={updatesByName.get(theme.name.toLowerCase())}
                busy={busy[theme.repo] === true}
                error={errors[theme.repo]}
                onInstall={() => void runInstall(theme.repo, theme.name, false)}
                onUpdate={() => void runInstall(theme.repo, theme.name, true, updatesByName.get(theme.name.toLowerCase())?.themeId)}
              />
            ))}
          </ul>

          {hasMore && (
            <div className="theme-store__more" ref={sentinelRef}>
              <Button onClick={loadMore}>{t('settingsUi.loadMore')}</Button>
            </div>
          )}
        </>
      )}

      {/* Announces results without moving focus. */}
      <p className="theme-store__sr-status" role="status" aria-live="polite">{notice}</p>

      <ConfirmModal
        open={replacing !== null}
        title={t('settingsUi.replaceTitle')}
        message={replacing ? t('settingsUi.replaceMessage', { name: replacing.name }) : ''}
        confirmLabel={t('settingsUi.replace')}
        variant="danger"
        onConfirm={() => {
          const pending = replacing
          setReplacing(null)
          if (pending) void runInstall(pending.repo, pending.name, true)
        }}
        onCancel={() => setReplacing(null)}
      />
    </div>
  )
}
