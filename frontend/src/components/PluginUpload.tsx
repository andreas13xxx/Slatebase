import { useState, useRef, useCallback } from 'react'
import { Upload, CheckCircle, AlertTriangle, Loader } from 'lucide-react'
import type { IApiClient, PluginInstallResult } from '../api'
import { useTranslation } from '../i18n'

/** Maximum ZIP file size in bytes (10 MB). */
const MAX_ZIP_SIZE = 10 * 1024 * 1024

/** Props for the PluginUpload component. */
export interface PluginUploadProps {
  /** API client instance for making plugin upload requests. */
  apiClient: IApiClient
  /** Current vault ID. */
  vaultId: string
  /** Callback invoked after successful upload to refresh the plugin list. */
  onPluginInstalled?: (result: PluginInstallResult) => void
}

/**
 * Plugin upload component.
 * Provides a button to upload a plugin ZIP. The plugin is installed into the vault's
 * `.obsidian/plugins/` folder, where Obsidian keeps its plugins — plugins that are already
 * there (created by Obsidian or arrived through a sync) show up in the plugin list on their own.
 */
export function PluginUpload({ apiClient, vaultId, onPluginInstalled }: PluginUploadProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<PluginInstallResult | null>(null)

  /** Trigger the hidden file input. */
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  /** Handle file selection from the input. */
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset state
    setUploadError(null)
    setUploadSuccess(null)

    // Client-side size check
    if (file.size > MAX_ZIP_SIZE) {
      setUploadError(`Die Datei ist zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximale Größe: 10 MB.`)
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    // Validate extension
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setUploadError('Nur ZIP-Dateien werden akzeptiert.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const result = await apiClient.uploadPlugin(vaultId, file)
      setUploadSuccess(result)
      onPluginInstalled?.(result)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Plugin-Upload fehlgeschlagen.'
      setUploadError(mapUploadError(message))
    } finally {
      setUploading(false)
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [apiClient, vaultId, onPluginInstalled])

  return (
    <div className="plugin-upload">
      {/* Upload Section */}
      <div className="plugin-upload__section">
        <div className="plugin-upload__header">
          <h3 className="plugin-upload__title">Plugin installieren</h3>
        </div>

        <div className="plugin-upload__area">
          <button
            className="plugin-upload__button"
            onClick={handleUploadClick}
            disabled={uploading}
            aria-label="Plugin-ZIP hochladen"
          >
            {uploading ? (
              <>
                <Loader size={16} className="plugin-upload__spinner" />
                <span>Hochladen…</span>
              </>
            ) : (
              <>
                <Upload size={16} />
                <span>ZIP-Datei hochladen</span>
              </>
            )}
          </button>
          <p className="plugin-upload__hint">
            Obsidian-Plugin als ZIP-Datei hochladen (max. 5 MB). Die ZIP muss eine manifest.json und main.js enthalten.
            Das Plugin wird im Ordner .obsidian/plugins/ des Vaults abgelegt.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          className="plugin-upload__file-input"
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Success message */}
        {uploadSuccess && (
          <div className="plugin-upload__message plugin-upload__message--success">
            <CheckCircle size={14} />
            <span>
              {uploadSuccess.isUpgrade ? 'Plugin aktualisiert' : 'Plugin installiert'}:{' '}
              <strong>{uploadSuccess.manifest.name}</strong> v{uploadSuccess.manifest.version}
            </span>
          </div>
        )}

        {/* Eval usage warning after install */}
        {uploadSuccess && uploadSuccess.warnings && uploadSuccess.warnings.some((w) => w.includes('eval(') || w.includes('new Function(')) && (
          <div className="plugin-upload__message plugin-upload__message--warning">
            <AlertTriangle size={14} />
            <span>{t('pluginStore.evalWarningMessage')}</span>
          </div>
        )}

        {/* Error message */}
        {uploadError && (
          <div className="plugin-upload__message plugin-upload__message--error">
            <AlertTriangle size={14} />
            <span>{uploadError}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Maps backend error codes to user-friendly German messages.
 */
function mapUploadError(message: string): string {
  // Check for common backend error codes in the message
  if (message.includes('MISSING_FILES')) {
    return 'Die ZIP-Datei enthält keine gültige Plugin-Struktur (manifest.json und main.js erforderlich).'
  }
  if (message.includes('MANIFEST_VALIDATION_FAILED')) {
    return 'Das Plugin-Manifest ist ungültig. Bitte Pflichtfelder (id, name, version) prüfen.'
  }
  if (message.includes('BUNDLE_UNSAFE')) {
    return 'Das Plugin-Bundle enthält unsichere Muster (eval, new Function oder document.write).'
  }
  if (message.includes('VERSION_NOT_HIGHER')) {
    return 'Die hochgeladene Plugin-Version ist nicht höher als die installierte Version.'
  }
  if (message.includes('ZIP_TOO_LARGE')) {
    return 'Die ZIP-Datei überschreitet die maximale Größe von 5 MB.'
  }
  if (message.includes('EXTRACTED_TOO_LARGE')) {
    return 'Der extrahierte Inhalt überschreitet die maximale Größe von 10 MB.'
  }
  return message
}
