import { useState, useRef, useCallback } from 'react'
import { Upload, CheckCircle, AlertTriangle, Loader } from 'lucide-react'
import type { IApiClient, PluginInstallResult } from '../api'
import { useTranslation, translateNow } from '../i18n'

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
  /** Whether the uploaded plugin is activated right away. The checkbox shows when `onActivateAfterInstallChange` is given. */
  activateAfterInstall?: boolean
  /** Called when the "activate after installation" checkbox changes. */
  onActivateAfterInstallChange?: (value: boolean) => void
  /** Activates the uploaded plugin; awaited before `onPluginInstalled`. Only called when `activateAfterInstall` is on. */
  onActivate?: (result: PluginInstallResult) => Promise<void>
}

/**
 * Plugin upload component.
 * Provides a button to upload a plugin ZIP. The plugin is installed into the vault's
 * `.obsidian/plugins/` folder, where Obsidian keeps its plugins — plugins that are already
 * there (created by Obsidian or arrived through a sync) show up in the plugin list on their own.
 */
export function PluginUpload({ apiClient, vaultId, onPluginInstalled, activateAfterInstall = false, onActivateAfterInstallChange, onActivate }: PluginUploadProps) {
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
      setUploadError(t('commonUi.c_pu_tooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }))
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
      if (activateAfterInstall && onActivate) {
        try {
          await onActivate(result)
        } catch (err: unknown) {
          setUploadError(`Das Plugin wurde installiert, konnte aber nicht aktiviert werden: ${err instanceof Error ? err.message : 'Aktivierung fehlgeschlagen'}`)
        }
      }
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
  }, [apiClient, vaultId, onPluginInstalled, activateAfterInstall, onActivate])

  return (
    <div className="plugin-upload">
      {/* Upload Section */}
      <div className="plugin-upload__section">
        <div className="plugin-upload__header">
          <h3 className="plugin-upload__title">{t('commonUi.c_pu_install')}</h3>
        </div>

        <div className="plugin-upload__area">
          <button
            className="plugin-upload__button"
            onClick={handleUploadClick}
            disabled={uploading}
            aria-label={t('commonUi.c_pu_uploadZip')}
          >
            {uploading ? (
              <>
                <Loader size={16} className="plugin-upload__spinner" />
                <span>{t('commonUi.c_pu_uploading')}</span>
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

        {onActivateAfterInstallChange && (
          <label className="plugin-upload__activate">
            <input
              type="checkbox"
              checked={activateAfterInstall}
              onChange={(e) => onActivateAfterInstallChange(e.target.checked)}
            />
            {t('pluginStore.activateAfterInstall')}
          </label>
        )}

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

        {/* A running plugin keeps its old bundle until the page is reloaded */}
        {uploadSuccess?.isUpgrade && (
          <div className="plugin-upload__message plugin-upload__message--warning">
            <AlertTriangle size={14} />
            <span>{t('commonUi.c_pu_reloadNote')}</span>
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
    return translateNow('commonUi.c_pu_badStructure')
  }
  if (message.includes('MANIFEST_VALIDATION_FAILED')) {
    return translateNow('commonUi.c_pu_badManifest')
  }
  if (message.includes('BUNDLE_UNSAFE')) {
    return translateNow('commonUi.c_pu_unsafe')
  }
  if (message.includes('VERSION_NOT_HIGHER')) {
    return translateNow('commonUi.c_pu_notNewer')
  }
  if (message.includes('ZIP_TOO_LARGE')) {
    return translateNow('commonUi.c_pu_zipTooBig')
  }
  if (message.includes('EXTRACTED_TOO_LARGE')) {
    return translateNow('commonUi.c_pu_extractedTooBig')
  }
  return message
}
