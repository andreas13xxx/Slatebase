/**
 * ThemeImport — the "Importieren" tab of the Themes section: put a theme.css (and optionally its manifest.json)
 * into the vault. Embedded in ThemesSection.
 *
 * Whether a theme with the same name exists is looked up right before saving, so this tab needs no theme list of
 * its own. A theme that is overwritten while active is re-applied locally; other clients follow via `vault:change`.
 */
import { useCallback, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'
import { Upload } from 'lucide-react'
import { useAppContext } from '../../state'
import { themeInjector } from '../../plugins/appearance/theme-injector'
import { extractErrorMessage } from '../../utils/error'
import { ConfirmModal } from '../ConfirmModal'
import { deriveThemeId, pickThemeFiles, readManifestFields } from './themeImport'
import './ThemeManager.css'

type Manifest = Awaited<ReturnType<typeof readManifestFields>>

interface PendingOverwrite {
  themeId: string
  css: string
  manifest: Manifest
  /** Whether the theme being replaced is the vault's active one. */
  active: boolean
}

export function ThemeImport() {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [overwrite, setOverwrite] = useState<PendingOverwrite | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const saveTheme = useCallback(async (themeId: string, css: string, manifest: Manifest, active: boolean) => {
    if (!vaultId || !apiClient) return
    try {
      await apiClient.saveTheme(vaultId, themeId, css, manifest)
      // Re-applying keeps the screen in step when the overwritten theme is the active one.
      if (active) themeInjector.apply(themeId, css)
      setNotice(`„${manifest.name ?? themeId}“ wurde importiert. Aktivieren kannst du es unter „Installiert“.`)
    } catch (err) {
      setError(extractErrorMessage(err, 'Theme konnte nicht importiert werden'))
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
    const manifest = await readManifestFields(picked.files.manifest)
    const themeId = deriveThemeId(manifest.name ?? null, picked.files.css.name)
    if (themeId === null) {
      setError('Der Theme-Name fehlt: Bitte manifest.json mit "name" mitliefern oder die CSS-Datei umbenennen.')
      return
    }
    const css = await picked.files.css.text()

    // A failed lookup is "unknown", not "does not exist": stop instead of overwriting a theme unasked.
    let listed: Awaited<ReturnType<typeof apiClient.listThemes>>
    try {
      listed = await apiClient.listThemes(vaultId)
    } catch (err) {
      setError(extractErrorMessage(err, 'Themes konnten nicht geladen werden'))
      return
    }
    // Case-insensitive: on Windows and macOS `Minimal` and `minimal` are the same folder.
    const existing = listed.themes.find((t) => t.id.toLowerCase() === themeId.toLowerCase())
    if (existing !== undefined) {
      // Use the existing folder's spelling so the "is this the active theme" check stays exact.
      setOverwrite({ themeId: existing.id, css, manifest, active: existing.id === listed.activeThemeId })
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
        Importiere eine <code>theme.css</code> aus Obsidian, optional mit der zugehörigen <code>manifest.json</code>.
        Das Theme landet im Ordner <code>.obsidian/themes/</code> dieses Vaults.
      </p>

      {error && <p className="theme-manager__error" role="alert">{error}</p>}

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

      <p className="theme-manager__notice" role="status">{notice}</p>

      <ConfirmModal
        open={overwrite !== null}
        title="Theme überschreiben"
        message={overwrite ? `Ein Theme "${overwrite.themeId}" existiert bereits. Überschreiben?` : ''}
        confirmLabel="Überschreiben"
        variant="danger"
        onConfirm={() => {
          const pending = overwrite
          setOverwrite(null)
          if (pending) void saveTheme(pending.themeId, pending.css, pending.manifest, pending.active)
        }}
        onCancel={() => setOverwrite(null)}
      />
    </div>
  )
}
