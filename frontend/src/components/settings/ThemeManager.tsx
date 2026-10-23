/**
 * ThemeManager — lists the vault's Obsidian themes, selects the active one, imports and deletes.
 * Embedded in ThemesSection.
 *
 * Themes live in the vault (`.obsidian/themes/`) and the selection in `.obsidian/appearance.json`,
 * so a choice applies to everyone who opens the vault. The server's `vault:change` event excludes
 * the user who made the change, so this component applies the result locally right away.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import { AlertTriangle, Trash2, Upload } from 'lucide-react'
import { useAppContext } from '../../state'
import type { ThemeMeta } from '../../api'
import { themeInjector } from '../../plugins/appearance/theme-injector'
import { extractErrorMessage } from '../../utils/error'
import { ConfirmModal } from '../ConfirmModal'
import { StyleSettingsHint } from './StyleSettingsHint'
import { useStyleSettingsPluginState } from './useStyleSettingsPluginState'
import { deriveThemeId, formatThemeSize, pickThemeFiles, readManifestFields } from './themeImport'
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
  const [overwrite, setOverwrite] = useState<{ themeId: string; css: string; manifest: Awaited<ReturnType<typeof readManifestFields>> } | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const styleSettingsState = useStyleSettingsPluginState(apiClient, vaultId, themes.some((t) => t.hasStyleSettings))

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
    const { css } = await apiClient.loadTheme(vaultId, themeId)
    themeInjector.apply(themeId, css)
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

  const saveTheme = useCallback(async (themeId: string, css: string, manifest: Awaited<ReturnType<typeof readManifestFields>>) => {
    if (!vaultId || !apiClient) return
    try {
      await apiClient.saveTheme(vaultId, themeId, css, manifest)
      // Re-applying keeps the screen in step when the overwritten theme is the active one.
      if (themeId === activeId) themeInjector.apply(themeId, css)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err, 'Theme konnte nicht importiert werden'))
    }
  }, [vaultId, apiClient, activeId, load])

  const importFiles = useCallback(async (files: File[]) => {
    setError(null)
    const picked = pickThemeFiles(files)
    if (!picked.ok) {
      setError(picked.message)
      return
    }
    const manifest = await readManifestFields(picked.files.manifest)
    const themeId = deriveThemeId(manifest.name ?? null, picked.files.css.name)
    if (themeId === null) {
      setError('Der Theme-Name fehlt: Bitte manifest.json mit "name" mitliefern oder die CSS-Datei umbenennen.')
      return
    }
    const css = await picked.files.css.text()
    // Case-insensitive: on Windows and macOS `Minimal` and `minimal` are the same folder.
    const existing = themes.find((t) => t.id.toLowerCase() === themeId.toLowerCase())
    if (existing !== undefined) {
      // Use the existing folder's spelling so the "is this the active theme" check below stays exact.
      setOverwrite({ themeId: existing.id, css, manifest })
      return
    }
    await saveTheme(themeId, css, manifest)
  }, [themes, saveTheme])

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) await importFiles(files)
  }, [importFiles])

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) await importFiles(files)
  }, [importFiles])

  const handleDropZoneKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fileInputRef.current?.click()
    }
  }, [])

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

          {themes.map((theme) => (
            <div key={theme.id} className="theme-manager__row">
              <label className="theme-manager__item">
                <input
                  type="radio"
                  name="vault-theme"
                  value={theme.id}
                  checked={activeId === theme.id}
                  onChange={() => void handleSelect(theme.id)}
                />
                <span className="theme-manager__name">{theme.manifest.name}</span>
                <span className="theme-manager__meta">
                  {[theme.manifest.version, theme.manifest.author, formatThemeSize(theme.size)].filter(Boolean).join(' · ')}
                </span>
              </label>
              {theme.hasStyleSettings && <StyleSettingsHint state={styleSettingsState} />}
              {theme.externalHosts.length > 0 && (
                <p className="theme-manager__warning">
                  <AlertTriangle size={13} aria-hidden="true" /> Lädt Inhalte von: {theme.externalHosts.join(', ')}
                </p>
              )}
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
        <p className="theme-manager__empty">Keine Themes in diesem Vault. Importiere eine <code>theme.css</code> aus Obsidian.</p>
      )}

      <div
        className={`theme-manager__dropzone${dragging ? ' theme-manager__dropzone--active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Theme importieren: theme.css und optional manifest.json auswählen oder hierher ziehen"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleDropZoneKey}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => void handleDrop(e)}
      >
        <Upload size={16} aria-hidden="true" />
        <span>theme.css (und optional manifest.json) auswählen oder hierher ziehen</span>
      </div>
      {/* Outside the role="button" zone: an input nested in an interactive control fails axe's nested-interactive rule. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".css,.json"
        multiple
        className="theme-manager__file-input"
        onChange={(e) => void handleFileInput(e)}
        aria-hidden="true"
        tabIndex={-1}
        data-testid="theme-file-input"
      />

      <ConfirmModal
        open={deleting !== null}
        title="Theme löschen"
        message={deleting ? `"${deleting.manifest.name}" wirklich löschen? Der Ordner wird aus dem Vault entfernt.` : ''}
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmModal
        open={overwrite !== null}
        title="Theme überschreiben"
        message={overwrite ? `Ein Theme "${overwrite.themeId}" existiert bereits. Überschreiben?` : ''}
        confirmLabel="Überschreiben"
        variant="danger"
        onConfirm={() => {
          const pending = overwrite
          setOverwrite(null)
          if (pending) void saveTheme(pending.themeId, pending.css, pending.manifest)
        }}
        onCancel={() => setOverwrite(null)}
      />
    </div>
  )
}
