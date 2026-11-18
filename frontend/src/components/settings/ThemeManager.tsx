/**
 * ThemeManager — lists the vault's Obsidian themes, selects the active one and deletes. Importing lives in ThemeImport.
 * Embedded in ThemesSection.
 *
 * Themes live in the vault (`.obsidian/themes/`) and the selection in `.obsidian/appearance.json`,
 * so a choice applies to everyone who opens the vault. The server's `vault:change` event excludes
 * the user who made the change, so this component applies the result locally right away.
 */
import { useTranslation, translateNow } from '../../i18n'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useAppContext } from '../../state'
import type { ThemeMeta } from '../../api'
import { BUILTIN_THEMES, isBuiltinThemeId } from '../../plugins/appearance/builtin-themes'
import { themeInjector } from '../../plugins/appearance/theme-injector'
import { extractErrorMessage } from '../../utils/error'
import { ConfirmModal } from '../ConfirmModal'
import { StyleSettingsHint } from './StyleSettingsHint'
import { useStyleSettingsPluginState } from './useStyleSettingsPluginState'
import { formatThemeSize } from './themeImportUtils'
import './ThemeManager.css'

/** Radio value for "no theme" — cannot collide with a theme id (ids start alphanumeric). */
const DEFAULT_VALUE = ''

export function ThemeManager() {
  const { t } = useTranslation()
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  const [themes, setThemes] = useState<ThemeMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  // True when the mount effect below will actually fetch, so the first load needs no synchronous setState.
  const [loading, setLoading] = useState(() => Boolean(vaultId && apiClient))
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ThemeMeta | null>(null)
  const anyStyleSettings = themes.some((t) => t.hasStyleSettings)
  const styleSettingsState = useStyleSettingsPluginState(apiClient, vaultId, anyStyleSettings)

  const load = useCallback(async () => {
    if (!vaultId || !apiClient) return
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.listThemes(vaultId)
      setThemes(result.themes)
      setActiveId(result.activeThemeId)
    } catch (err) {
      setError(extractErrorMessage(err, translateNow('settingsUi.themesLoadFailed')))
    } finally {
      setLoading(false)
    }
  }, [vaultId, apiClient])

  // Not `void load()`: that sets state synchronously inside the effect and cannot be cancelled.
  useEffect(() => {
    if (!vaultId || !apiClient) return
    let cancelled = false
    apiClient.listThemes(vaultId)
      .then((result) => {
        if (cancelled) return
        setThemes(result.themes)
        setActiveId(result.activeThemeId)
      })
      .catch((err: unknown) => { if (!cancelled) setError(extractErrorMessage(err, translateNow('settingsUi.themesLoadFailed'))) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vaultId, apiClient])

  /** Applies the theme in this tab; other clients follow via `vault:change`. */
  const applyLocally = useCallback(async (themeId: string | null) => {
    if (!vaultId || !apiClient) return
    if (themeId === null) {
      themeInjector.remove()
      return
    }
    if (isBuiltinThemeId(themeId)) {
      themeInjector.applyBuiltin(themeId)
      return
    }
    const { css } = await apiClient.loadTheme(vaultId, themeId)
    if (!themeInjector.apply(themeId, css)) {
      // Refused (over the size limit): leave no previously applied theme behind that no longer matches the selection.
      themeInjector.remove()
      throw new Error(translateNow('settingsUi.themeTooLarge'))
    }
  }, [vaultId, apiClient])

  const handleSelect = useCallback(async (themeId: string | null) => {
    if (!vaultId || !apiClient || themeId === activeId) return
    const previous = activeId
    setActiveId(themeId)
    setError(null)
    try {
      await apiClient.setActiveTheme(vaultId, themeId)
    } catch (err) {
      // Nothing was saved: the vault still uses the previous theme, so the radio goes back.
      setActiveId(previous)
      setError(extractErrorMessage(err, translateNow('settingsUi.themeActivateFailed')))
      return
    }
    // The choice is saved. If showing it here fails, the selection must stay — rolling it back would
    // make the UI disagree with the vault. The next load of this tab applies it.
    try {
      await applyLocally(themeId)
    } catch (err) {
      setError(extractErrorMessage(err, translateNow('settingsUi.themeSavedNotShown')))
    }
  }, [vaultId, apiClient, activeId, applyLocally])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleting || !vaultId || !apiClient) return
    const target = deleting
    setDeleting(null)
    try {
      await apiClient.deleteTheme(vaultId, target.id)
      if (target.id === activeId) {
        themeInjector.remove()
        setActiveId(null)
      }
      await load()
    } catch (err) {
      setError(extractErrorMessage(err, translateNow('settingsUi.themeDeleteFailed')))
    }
  }, [deleting, vaultId, apiClient, activeId, load])

  if (!vaultId) return null

  return (
    <div className="theme-manager">
      <p className="theme-manager__note">
        {t('settingsUi.themeNote1')} <code>.obsidian/themes/</code>.
        {t('settingsUi.themeNote2')}
      </p>

      {error && <p className="theme-manager__error" role="alert">{error}</p>}
      {!loading && anyStyleSettings && <StyleSettingsHint state={styleSettingsState} />}
      {loading && <p className="theme-manager__loading">{t('settingsUi.loadingShort')}</p>}

      {!loading && (
        <fieldset className="theme-manager__list">
          <legend className="theme-manager__legend">{t('settingsUi.themeLegend')}</legend>

          <label className="theme-manager__item">
            <input
              type="radio"
              name="vault-theme"
              value={DEFAULT_VALUE}
              checked={activeId === null}
              onChange={() => void handleSelect(null)}
            />
            <span className="theme-manager__name">{t('settingsUi.themeDefault')}</span>
          </label>

          {BUILTIN_THEMES.map((theme) => (
            <label key={theme.id} className="theme-manager__item">
              <input
                type="radio"
                name="vault-theme"
                value={theme.id}
                checked={activeId === theme.id}
                onChange={() => void handleSelect(theme.id)}
              />
              <span className="theme-manager__name">{theme.name}</span>
              <span className="theme-manager__meta">{theme.description}</span>
            </label>
          ))}

          {themes.map((theme) => (
            <div key={theme.id} className="theme-manager__row">
              <label className="theme-manager__item">
                <input
                  type="radio"
                  name="vault-theme"
                  value={theme.id}
                  checked={activeId === theme.id}
                  onChange={() => void handleSelect(theme.id)}
                  aria-describedby={theme.hasStyleSettings ? `theme-settings-${theme.id}` : undefined}
                />
                <span className="theme-manager__name">{theme.manifest.name}</span>
                {theme.hasStyleSettings && (
                  <span className="theme-manager__settings-icon" title={t('settingsUi.hasOwnSettings')} aria-hidden="true">
                    <SlidersHorizontal size={13} />
                  </span>
                )}
                <span className="theme-manager__meta">
                  {[theme.manifest.version, theme.manifest.author, formatThemeSize(theme.size)].filter(Boolean).join(' · ')}
                </span>
              </label>
              {theme.externalHosts.length > 0 && (
                <p className="theme-manager__warning">
                  <AlertTriangle size={13} aria-hidden="true" /> {t('settingsUi.loadsFrom', { hosts: theme.externalHosts.join(', ') })}
                </p>
              )}
              {theme.hasStyleSettings && <span id={`theme-settings-${theme.id}`} className="theme-manager__sr-only">{t('settingsUi.hasOwnSettings')}</span>}
              <button
                type="button"
                className="theme-manager__action-btn"
                onClick={() => setDeleting(theme)}
                aria-label={t('settingsUi.deleteNamed', { name: theme.manifest.name })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </fieldset>
      )}

      {!loading && themes.length === 0 && (
        <p className="theme-manager__empty">{t('settingsUi.noThemes1')} <code>theme.css</code> {t('settingsUi.noThemes2')}</p>
      )}

      <ConfirmModal
        open={deleting !== null}
        title={t('settingsUi.themeDeleteTitle')}
        message={deleting ? t('settingsUi.themeDeleteMessage', { name: deleting.manifest.name }) : ''}
        confirmLabel={t('settingsUi.delete')}
        variant="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleting(null)}
      />

    </div>
  )
}
