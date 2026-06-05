import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, CheckCircle, AlertTriangle, Package, Loader, Download } from 'lucide-react'
import type { IApiClient, PluginInstallResult } from '../api'

/** Maximum ZIP file size in bytes (5 MB). */
const MAX_ZIP_SIZE = 5 * 1024 * 1024

/** Props for the PluginUpload component. */
export interface PluginUploadProps {
  /** API client instance for making plugin upload requests. */
  apiClient: IApiClient
  /** Current vault ID. */
  vaultId: string
  /** Callback invoked after successful upload to refresh the plugin list. */
  onPluginInstalled?: (result: PluginInstallResult) => void
}

/** Detected plugin from .obsidian/plugins/ directory. */
interface DetectedPlugin {
  /** Plugin folder name (used as plugin ID). */
  id: string
  /** Whether a manifest.json was found. */
  hasManifest: boolean
  /** Whether a main.js was found. */
  hasMainJs: boolean
}

/**
 * Plugin upload component.
 * Provides a button to upload ZIP files and displays detected plugins
 * from the .obsidian/plugins/ directory in synced vaults.
 */
export function PluginUpload({ apiClient, vaultId, onPluginInstalled }: PluginUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<PluginInstallResult | null>(null)

  // Detected plugins state (fetched from backend)
  const [detectedPlugins, setDetectedPlugins] = useState<DetectedPlugin[]>([])
  const [installingPlugins, setInstallingPlugins] = useState<Set<string>>(new Set())
  const [installErrors, setInstallErrors] = useState<Record<string, string>>({})

  /** Fetch detected plugins from .obsidian/plugins/ via backend endpoint. */
  useEffect(() => {
    let cancelled = false
    async function fetchDetected() {
      try {
        const result = await apiClient.getDetectedPlugins(vaultId)
        if (!cancelled) {
          setDetectedPlugins(result.plugins)
        }
      } catch {
        // Silently ignore — detected plugins are optional info
        if (!cancelled) {
          setDetectedPlugins([])
        }
      }
    }
    void fetchDetected()
    return () => { cancelled = true }
  }, [apiClient, vaultId])

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
      setUploadError(`Die Datei ist zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximale Größe: 5 MB.`)
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

  /** Handle installing a detected plugin from .obsidian/plugins/. */
  const handleInstallDetected = useCallback(async (pluginId: string) => {
    setInstallingPlugins(prev => new Set([...prev, pluginId]))
    setInstallErrors(prev => {
      const next = { ...prev }
      delete next[pluginId]
      return next
    })

    try {
      const result = await apiClient.installDetectedPlugin(vaultId, pluginId)
      // Remove from detected list (now installed)
      setDetectedPlugins(prev => prev.filter(p => p.id !== pluginId))
      onPluginInstalled?.(result)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Installation fehlgeschlagen.'
      setInstallErrors(prev => ({ ...prev, [pluginId]: mapUploadError(message) }))
    } finally {
      setInstallingPlugins(prev => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
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

        {/* Error message */}
        {uploadError && (
          <div className="plugin-upload__message plugin-upload__message--error">
            <AlertTriangle size={14} />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* Detected plugins from .obsidian/plugins/ */}
      {detectedPlugins.length > 0 && (
        <div className="plugin-upload__section plugin-upload__detected">
          <h3 className="plugin-upload__title">
            <Package size={14} />
            Erkannte Plugins
          </h3>
          <p className="plugin-upload__hint">
            Diese Plugins wurden im .obsidian/plugins/-Verzeichnis des Vaults erkannt (z.B. durch Sync).
            Installierbare Plugins können direkt aktiviert werden.
          </p>
          <ul className="plugin-upload__detected-list">
            {detectedPlugins.map(plugin => {
              const isInstallable = plugin.hasManifest && plugin.hasMainJs
              const isInstalling = installingPlugins.has(plugin.id)
              const installError = installErrors[plugin.id]

              return (
                <li key={plugin.id} className="plugin-upload__detected-item">
                  <span className="plugin-upload__detected-name">{plugin.id}</span>
                  {isInstallable ? (
                    <button
                      className="plugin-upload__install-button"
                      onClick={() => void handleInstallDetected(plugin.id)}
                      disabled={isInstalling}
                      aria-label={`Plugin ${plugin.id} installieren`}
                    >
                      {isInstalling ? (
                        <>
                          <Loader size={12} className="plugin-upload__spinner" />
                          <span>Installieren…</span>
                        </>
                      ) : (
                        <>
                          <Download size={12} />
                          <span>Installieren</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="plugin-upload__detected-status plugin-upload__detected-status--incomplete">
                      Unvollständig
                      {!plugin.hasManifest && ' (manifest.json fehlt)'}
                      {!plugin.hasMainJs && ' (main.js fehlt)'}
                    </span>
                  )}
                  {installError && (
                    <span className="plugin-upload__detected-error">
                      <AlertTriangle size={11} />
                      {installError}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
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
