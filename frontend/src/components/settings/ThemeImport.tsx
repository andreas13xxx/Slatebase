/**
 * ThemeImport — the "Importieren" tab of the Themes section: put a theme.css (and optionally its manifest.json)
 * into the vault. Embedded in ThemesSection.
 *
 * Whether a theme with the same name exists is looked up right before saving, so this tab needs no theme list of
 * its own. A theme that is overwritten while active is re-applied locally; other clients follow via `vault:change`.
 */
import { useTranslation, translateNow } from '../../i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'
import { Upload } from 'lucide-react'
import { useAppContext } from '../../state'
import { themeInjector } from '../../plugins/appearance/theme-injector'
import { extractErrorMessage } from '../../utils/error'
import { ConfirmModal } from '../ConfirmModal'
import { deriveThemeId, pickThemeFiles, readManifestFields } from './themeImportUtils'
import './ThemeManager.css'

type Manifest = Awaited<ReturnType<typeof readManifestFields>>

interface PendingOverwrite {
  themeId: string
  css: string
  manifest: Manifest
}

export function ThemeImport() {
  const { t } = useTranslation()
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [overwrite, setOverwrite] = useState<PendingOverwrite | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** The vault shown now; a save that finishes after a vault switch must not touch the new vault's screen. */
  const vaultRef = useRef(vaultId)
  useEffect(() => { vaultRef.current = vaultId }, [vaultId])

  const saveTheme = useCallback(async (themeId: string, css: string, manifest: Manifest, replacing: boolean) => {
    if (!vaultId || !apiClient) return
    const label = manifest.name ?? themeId
    try {
      await apiClient.saveTheme(vaultId, themeId, css, manifest)
    } catch (err) {
      setError(extractErrorMessage(err, translateNow('settingsUi.importFailed')))
      return
    }
    if (vaultRef.current !== vaultId) return
    if (!replacing) {
      setNotice(translateNow('settingsUi.imported', { label: label }))
      return
    }
    setNotice(translateNow('settingsUi.overwritten', { label: label }))
    // Re-applying keeps the screen in step when the overwritten theme is the active one. Whether it is active is
    // asked now, not when the file was picked: the choice may have changed while the dialog was open.
    try {
      const { activeThemeId } = await apiClient.listThemes(vaultId)
      if (activeThemeId === themeId && vaultRef.current === vaultId) themeInjector.apply(themeId, css)
    } catch {
      // The theme is saved; the screen follows on the next load.
    }
  }, [vaultId, apiClient])

  const importFiles = useCallback(async (files: File[]) => {
    if (!vaultId || !apiClient) return
    setError(null)
    setNotice('')
    const picked = pickThemeFiles(files)
    if (!picked.ok) {
      setError(picked.message)
      return
    }
    let manifest: Manifest
    let css: string
    try {
      manifest = await readManifestFields(picked.files.manifest)
      css = await picked.files.css.text()
    } catch (err) {
      setError(extractErrorMessage(err, translateNow('settingsUi.filesUnreadable')))
      return
    }
    const themeId = deriveThemeId(manifest.name ?? null, picked.files.css.name)
    if (themeId === null) {
      setError(translateNow('settingsUi.themeNameMissing'))
      return
    }

    // A failed lookup is "unknown", not "does not exist": stop instead of overwriting a theme unasked.
    let listed: Awaited<ReturnType<typeof apiClient.listThemes>>
    try {
      listed = await apiClient.listThemes(vaultId)
    } catch (err) {
      setError(extractErrorMessage(err, translateNow('settingsUi.themesLoadFailed')))
      return
    }
    // Case-insensitive: on Windows and macOS `Minimal` and `minimal` are the same folder.
    const existing = listed.themes.find((t) => t.id.toLowerCase() === themeId.toLowerCase())
    if (existing !== undefined) {
      // Use the existing folder's spelling so the "is this the active theme" check stays exact.
      setOverwrite({ themeId: existing.id, css, manifest })
      return
    }
    await saveTheme(themeId, css, manifest, false)
  }, [vaultId, apiClient, saveTheme])

  const handleFileInput = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
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

  if (!vaultId) return null

  return (
    <div className="theme-manager">
      <p className="theme-manager__note">
        {t('settingsUi.importIntro1')} <code>theme.css</code> {t('settingsUi.importIntro2')} <code>manifest.json</code>.
        {t('settingsUi.importIntro3')} <code>.obsidian/themes/</code> {t('settingsUi.importIntro4')}
      </p>

      {error && <p className="theme-manager__error" role="alert">{error}</p>}

      <div
        className={`theme-manager__dropzone${dragging ? ' theme-manager__dropzone--active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={t('settingsUi.importDropLabel')}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleDropZoneKey}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => void handleDrop(e)}
      >
        <Upload size={16} aria-hidden="true" />
        <span>{t('settingsUi.importDropText')}</span>
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

      <p className="theme-manager__notice" role="status">{notice}</p>

      <ConfirmModal
        open={overwrite !== null}
        title={t('settingsUi.overwriteTitle')}
        message={overwrite ? t('settingsUi.overwriteMessage', { id: overwrite.themeId }) : ''}
        confirmLabel={t('settingsUi.overwrite')}
        variant="danger"
        onConfirm={() => {
          const pending = overwrite
          setOverwrite(null)
          if (pending) void saveTheme(pending.themeId, pending.css, pending.manifest, true)
        }}
        onCancel={() => setOverwrite(null)}
      />
    </div>
  )
}
