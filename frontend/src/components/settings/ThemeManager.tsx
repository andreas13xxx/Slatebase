/**
 * ThemeManager — lists the vault's Obsidian themes, selects the active one and deletes. Importing lives in ThemeImport.
 * Embedded in ThemesSection.
 *
 * Themes live in the vault (`.obsidian/themes/`) and the selection in `.obsidian/appearance.json`,
 * so a choice applies to everyone who opens the vault. The server's `vault:change` event excludes
 * the user who made the change, so this component applies the result locally right away.
 */
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
      setError(extractErrorMessage(err, 'Themes konnten nicht geladen werden'))
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
      .catch((err: unknown) => { if (!cancelled) setError(extractErrorMessage(err, 'Themes konnten nicht geladen werden')) })
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
      throw new Error('Das Theme ist zu groß und wird nicht angezeigt (Grenze: 6 MB)')
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
      setError(extractErrorMessage(err, 'Theme konnte nicht aktiviert werden'))
      return
    }
    // The choice is saved. If showing it here fails, the selection must stay — rolling it back would
    // make the UI disagree with the vault. The next load of this tab applies it.
    try {
      await applyLocally(themeId)
    } catch (err) {
      setError(extractErrorMessage(err, 'Das Theme wurde gespeichert, konnte aber hier nicht angezeigt werden'))
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
      setError(extractErrorMessage(err, 'Theme konnte nicht gelöscht werden'))
    }
  }, [deleting, vaultId, apiClient, activeId, load])

  if (!vaultId) return null

  return (
    <div className="theme-manager">
      <p className="theme-manager__note">
        Das aktive Theme gilt für alle Nutzer dieses Vaults und liegt im Ordner <code>.obsidian/themes/</code>.
        Unterstützt werden Themes, die über Obsidian-CSS-Variablen arbeiten (Farben, Schriften, Überschriften);
        Layout-Anpassungen einzelner Themes greifen nicht.
      </p>

      {error && <p className="theme-manager__error" role="alert">{error}</p>}
      {!loading && anyStyleSettings && <StyleSettingsHint state={styleSettingsState} />}
      {loading && <p className="theme-manager__loading">Lädt…</p>}

      {!loading && (
        <fieldset className="theme-manager__list">
          <legend className="theme-manager__legend">Theme dieses Vaults</legend>

          <label className="theme-manager__item">
            <input
              type="radio"
              name="vault-theme"
              value={DEFAULT_VALUE}
              checked={activeId === null}
              onChange={() => void handleSelect(null)}
            />
            <span className="theme-manager__name">Slatebase (Standard)</span>
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
                  <span className="theme-manager__settings-icon" title="Hat eigene Einstellungen" aria-hidden="true">
                    <SlidersHorizontal size={13} />
                  </span>
                )}
                <span className="theme-manager__meta">
                  {[theme.manifest.version, theme.manifest.author, formatThemeSize(theme.size)].filter(Boolean).join(' · ')}
                </span>
              </label>
              {theme.externalHosts.length > 0 && (
                <p className="theme-manager__warning">
                  <AlertTriangle size={13} aria-hidden="true" /> Lädt Inhalte von: {theme.externalHosts.join(', ')}
                </p>
              )}
              {theme.hasStyleSettings && <span id={`theme-settings-${theme.id}`} className="theme-manager__sr-only">Hat eigene Einstellungen</span>}
              <button
                type="button"
                className="theme-manager__action-btn"
                onClick={() => setDeleting(theme)}
                aria-label={`${theme.manifest.name} löschen`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </fieldset>
      )}

      {!loading && themes.length === 0 && (
        <p className="theme-manager__empty">Keine Themes in diesem Vault. Importiere eine <code>theme.css</code> unter „Importieren“.</p>
      )}

      <ConfirmModal
        open={deleting !== null}
        title="Theme löschen"
        message={deleting ? `"${deleting.manifest.name}" wirklich löschen? Der Ordner wird aus dem Vault entfernt.` : ''}
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleting(null)}
      />

    </div>
  )
}
