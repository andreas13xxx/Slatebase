import { useState, useEffect, type FormEvent } from 'react'
import type { IApiClient } from '../api'
import { useTranslation } from '../i18n'
import { Settings, Save } from 'lucide-react'
import { VersionCheckCard } from './VersionCheckCard'
import { FeatureTogglesSection } from './settings/FeatureTogglesSection'

/**
 * Shape of the server configuration returned by GET /api/v1/admin/config.
 */
export interface ServerConfigData {
  port: number
  host: string
  allowedOrigins: string[]
  maxFileSize: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  trash?: { retentionDays: number }
  versions?: { maxPerFile: number }
  maxVaultsPerUser?: number
  maxDirectoryDepth?: number
  cleanup?: { intervalHours: number }
  upload?: { maxFileSizeBytes: number; maxFilesPerDrop: number; maxImagePasteSize: number }
  maxImportFileSize?: number
  maxImportFiles?: number
  maxImportDepth?: number
  mcp?: { maxFileSize: number; rateLimit: number }
}

/** Props for the AdminConfigPage component. */
export interface AdminConfigPageProps {
  /** API client instance for making admin requests. */
  apiClient: IApiClient
  /** When true, hides the feature toggles section (used in unified settings where feature toggles have their own section). */
  hideFeatureToggles?: boolean
}

/** Valid log level values. */
const VALID_LOG_LEVELS: ReadonlyArray<string> = ['debug', 'info', 'warn', 'error']

/**
 * Validation errors for the config form fields.
 */
interface ConfigFormErrors {
  port?: string
  host?: string
  logLevel?: string
  maxFileSize?: string
  trashRetentionDays?: string
  versionsMaxPerFile?: string
  maxVaultsPerUser?: string
  limits?: string
}

/**
 * Admin server configuration page.
 * Displays current config in a card-based layout with clear sections.
 */
export function AdminConfigPage({ apiClient, hideFeatureToggles }: AdminConfigPageProps) {
  const { t } = useTranslation()

  const [config, setConfig] = useState<ServerConfigData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Form state
  const [port, setPort] = useState('')
  const [host, setHost] = useState('')
  const [allowedOrigins, setAllowedOrigins] = useState('')
  const [maxFileSize, setMaxFileSize] = useState('')
  const [logLevel, setLogLevel] = useState('')
  const [trashRetentionDays, setTrashRetentionDays] = useState('')
  const [versionsMaxPerFile, setVersionsMaxPerFile] = useState('')
  const [maxVaultsPerUser, setMaxVaultsPerUser] = useState('')
  const [maxDirectoryDepth, setMaxDirectoryDepth] = useState('')
  const [cleanupIntervalHours, setCleanupIntervalHours] = useState('')
  const [uploadMaxFileSize, setUploadMaxFileSize] = useState('')
  const [uploadMaxFilesPerDrop, setUploadMaxFilesPerDrop] = useState('')
  const [uploadMaxImagePasteSize, setUploadMaxImagePasteSize] = useState('')
  const [importMaxFileSize, setImportMaxFileSize] = useState('')
  const [importMaxFiles, setImportMaxFiles] = useState('')
  const [importMaxDepth, setImportMaxDepth] = useState('')
  const [mcpMaxFileSize, setMcpMaxFileSize] = useState('')
  const [mcpRateLimit, setMcpRateLimit] = useState('')
  /** Keys the server reports as pinned by an environment variable. */
  const [shadowedByEnv, setShadowedByEnv] = useState<string[]>([])

  // UI state
  const [errors, setErrors] = useState<ConfigFormErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)


  useEffect(() => {
    let cancelled = false

    async function loadConfig(): Promise<void> {
      setIsLoading(true)
      setLoadError(null)
      try {
        const response = await fetch('/api/v1/admin/config', {
          method: 'GET',
          headers: buildAuthHeaders(apiClient),
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({ message: t('admin.config.loadError') }))
          throw new Error(body.message ?? `HTTP ${response.status}`)
        }
        const data: ServerConfigData = await response.json()
        if (!cancelled) {
          setConfig(data)
          setPort(String(data.port))
          setHost(data.host)
          setAllowedOrigins(data.allowedOrigins.join(', '))
          setMaxFileSize(String(data.maxFileSize))
          setLogLevel(data.logLevel)
          setTrashRetentionDays(String(data.trash?.retentionDays ?? 30))
          setVersionsMaxPerFile(String(data.versions?.maxPerFile ?? 20))
          setMaxVaultsPerUser(String(data.maxVaultsPerUser ?? 50))
          setMaxDirectoryDepth(String(data.maxDirectoryDepth ?? 50))
          setCleanupIntervalHours(String(data.cleanup?.intervalHours ?? 24))
          setUploadMaxFileSize(String(data.upload?.maxFileSizeBytes ?? 104857600))
          setUploadMaxFilesPerDrop(String(data.upload?.maxFilesPerDrop ?? 50))
          setUploadMaxImagePasteSize(String(data.upload?.maxImagePasteSize ?? 10485760))
          setImportMaxFileSize(String(data.maxImportFileSize ?? 524288000))
          setImportMaxFiles(String(data.maxImportFiles ?? 500))
          setImportMaxDepth(String(data.maxImportDepth ?? 10))
          setMcpMaxFileSize(String(data.mcp?.maxFileSize ?? 16777216))
          setMcpRateLimit(String(data.mcp?.rateLimit ?? 60))
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t('admin.config.unknownError'))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadConfig()
    return () => { cancelled = true }
  }, [apiClient])

  function validate(): boolean {
    const newErrors: ConfigFormErrors = {}
    const portNum = parseInt(port, 10)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      newErrors.port = t('admin.config.portError')
    }
    if (host.trim() === '') {
      newErrors.host = t('admin.config.hostError')
    }
    if (!VALID_LOG_LEVELS.includes(logLevel)) {
      newErrors.logLevel = t('admin.config.logLevelError')
    }
    const maxFileSizeNum = parseInt(maxFileSize, 10)
    if (isNaN(maxFileSizeNum) || maxFileSizeNum <= 0) {
      newErrors.maxFileSize = t('admin.config.maxFileSizeError')
    }
    const retentionNum = parseInt(trashRetentionDays, 10)
    if (isNaN(retentionNum) || retentionNum < 0 || retentionNum > 365) {
      newErrors.trashRetentionDays = t('admin.config.trashRetentionDaysError')
    }
    const maxVersionsNum = parseInt(versionsMaxPerFile, 10)
    if (isNaN(maxVersionsNum) || maxVersionsNum < 0 || maxVersionsNum > 100) {
      newErrors.versionsMaxPerFile = t('admin.config.versionsMaxPerFileError')
    }

    const vaultsPerUser = parseInt(maxVaultsPerUser, 10)
    if (isNaN(vaultsPerUser) || vaultsPerUser < 1 || vaultsPerUser > 1000) {
      newErrors.maxVaultsPerUser = 'Muss zwischen 1 und 1000 liegen'
    }

    // The remaining limits share one message: they are all "a positive whole
    // number", and a field-by-field message would repeat the same sentence
    // eleven times without telling the admin anything new.
    const positiveFields: Array<[string, number, number]> = [
      ['Ordnertiefe', parseInt(maxDirectoryDepth, 10), 200],
      ['Aufräum-Intervall', parseInt(cleanupIntervalHours, 10), 720],
      ['Upload-Größe', parseInt(uploadMaxFileSize, 10), Number.MAX_SAFE_INTEGER],
      ['Dateien pro Upload', parseInt(uploadMaxFilesPerDrop, 10), 1000],
      ['Bild-Einfügegröße', parseInt(uploadMaxImagePasteSize, 10), Number.MAX_SAFE_INTEGER],
      ['Import-Dateigröße', parseInt(importMaxFileSize, 10), Number.MAX_SAFE_INTEGER],
      ['Import-Dateianzahl', parseInt(importMaxFiles, 10), Number.MAX_SAFE_INTEGER],
      ['Import-Tiefe', parseInt(importMaxDepth, 10), 100],
      ['MCP-Dateigröße', parseInt(mcpMaxFileSize, 10), Number.MAX_SAFE_INTEGER],
      ['MCP-Rate-Limit', parseInt(mcpRateLimit, 10), Number.MAX_SAFE_INTEGER],
    ]
    const invalid = positiveFields.filter(([, value, max]) => isNaN(value) || value < 1 || value > max)
    if (invalid.length > 0) {
      newErrors.limits = `Ungültiger Wert: ${invalid.map(([label]) => label).join(', ')}`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setSaveMessage(null)
    setSaveError(null)
    if (!validate()) return

    setIsSaving(true)
    const originsArray = allowedOrigins.split(',').map((o) => o.trim()).filter((o) => o.length > 0)
    const payload = {
      port: parseInt(port, 10),
      host: host.trim(),
      logLevel: logLevel as 'debug' | 'info' | 'warn' | 'error',
      maxFileSize: parseInt(maxFileSize, 10),
      allowedOrigins: originsArray,
      trash: { retentionDays: parseInt(trashRetentionDays, 10) },
      versions: { maxPerFile: parseInt(versionsMaxPerFile, 10) },
      maxVaultsPerUser: parseInt(maxVaultsPerUser, 10),
      maxDirectoryDepth: parseInt(maxDirectoryDepth, 10),
      maxImportFileSize: parseInt(importMaxFileSize, 10),
      maxImportFiles: parseInt(importMaxFiles, 10),
      maxImportDepth: parseInt(importMaxDepth, 10),
      cleanup: { intervalHours: parseInt(cleanupIntervalHours, 10) },
      upload: {
        maxFileSizeBytes: parseInt(uploadMaxFileSize, 10),
        maxFilesPerDrop: parseInt(uploadMaxFilesPerDrop, 10),
        maxImagePasteSize: parseInt(uploadMaxImagePasteSize, 10),
      },
      mcp: {
        maxFileSize: parseInt(mcpMaxFileSize, 10),
        rateLimit: parseInt(mcpRateLimit, 10),
      },
    }

    try {
      const response = await fetch('/api/v1/admin/config', {
        method: 'PUT',
        headers: { ...buildAuthHeaders(apiClient), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: t('admin.config.saveError') }))
        throw new Error(body.message ?? `HTTP ${response.status}`)
      }
      const body = await response.json().catch(() => null) as
        { message?: string; shadowedByEnv?: string[] } | null
      setShadowedByEnv(body?.shadowedByEnv ?? [])
      setSaveMessage(body?.message ?? t('admin.config.saveSuccess'))
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t('admin.config.unknownError'))
    } finally {
      setIsSaving(false)
    }
  }


  if (isLoading) {
    return <div className="admin-config-page"><p className="admin-config-loading">{t('common.loading')}</p></div>
  }

  if (loadError) {
    return (
      <div className="admin-config-page">
        <div className="admin-config-message admin-config-message--error">{loadError}</div>
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="admin-config-page">
      <div className="admin-config-header">
        <Settings size={22} color="var(--accent-text)" />
        <h1 className="admin-config-title">{t('admin.config.title')}</h1>
      </div>

      {/* Version Check */}
      <VersionCheckCard />

      {/* Feature-Toggles section */}
      {!hideFeatureToggles && (
      <section className="admin-config-card">
        <h2 className="admin-config-card-title">Feature-Toggles</h2>
        <FeatureTogglesSection apiClient={apiClient} />
      </section>
      )}

      {/* Network section */}
      <form className="admin-config-form" onSubmit={handleSubmit} noValidate>
        <section className="admin-config-card">
          <h2 className="admin-config-card-title">{t('admin.config.networkTitle')}</h2>
          <div className="admin-config-grid">
            <div className="admin-config-field">
              <label htmlFor="config-port">{t('admin.config.portLabel')}</label>
              <input
                id="config-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                aria-invalid={errors.port !== undefined}
              />
              {errors.port && <p className="admin-config-field-error">{errors.port}</p>}
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-host">{t('admin.config.hostLabel')}</label>
              <input
                id="config-host"
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                aria-invalid={errors.host !== undefined}
              />
              {errors.host && <p className="admin-config-field-error">{errors.host}</p>}
            </div>
          </div>
          <div className="admin-config-field">
            <label htmlFor="config-allowed-origins">{t('admin.config.allowedOriginsLabel')}</label>
            <input
              id="config-allowed-origins"
              type="text"
              value={allowedOrigins}
              onChange={(e) => setAllowedOrigins(e.target.value)}
              placeholder="http://localhost:5173, https://example.com"
            />
            <p className="admin-config-hint">{t('admin.config.allowedOriginsHint')}</p>
          </div>
        </section>

        {/* Limits section */}
        <section className="admin-config-card">
          <h2 className="admin-config-card-title">{t('admin.config.limitsTitle')}</h2>
          <div className="admin-config-grid">
            <div className="admin-config-field">
              <label htmlFor="config-max-file-size">{t('admin.config.maxFileSizeLabel')}</label>
              <input
                id="config-max-file-size"
                type="number"
                min={1}
                value={maxFileSize}
                onChange={(e) => setMaxFileSize(e.target.value)}
                aria-invalid={errors.maxFileSize !== undefined}
              />
              {errors.maxFileSize && <p className="admin-config-field-error">{errors.maxFileSize}</p>}
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-log-level">{t('admin.config.logLevelLabel')}</label>
              <select
                id="config-log-level"
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value)}
                aria-invalid={errors.logLevel !== undefined}
              >
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>
              {errors.logLevel && <p className="admin-config-field-error">{errors.logLevel}</p>}
            </div>
          </div>
        </section>

        {/* Protection / Schutzmaßnahmen section */}
        <section className="admin-config-card">
          <h2 className="admin-config-card-title">{t('admin.config.protectionTitle')}</h2>
          <p className="admin-config-hint">{t('admin.config.protectionHint')}</p>
          <div className="admin-config-grid">
            <div className="admin-config-field">
              <label htmlFor="config-trash-retention">{t('admin.config.trashRetentionDaysLabel')}</label>
              <input
                id="config-trash-retention"
                type="number"
                min={0}
                max={365}
                value={trashRetentionDays}
                onChange={(e) => setTrashRetentionDays(e.target.value)}
                aria-invalid={errors.trashRetentionDays !== undefined}
              />
              <p className="admin-config-hint">{t('admin.config.trashRetentionDaysHint')}</p>
              {errors.trashRetentionDays && <p className="admin-config-field-error">{errors.trashRetentionDays}</p>}
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-versions-max">{t('admin.config.versionsMaxPerFileLabel')}</label>
              <input
                id="config-versions-max"
                type="number"
                min={0}
                max={100}
                value={versionsMaxPerFile}
                onChange={(e) => setVersionsMaxPerFile(e.target.value)}
                aria-invalid={errors.versionsMaxPerFile !== undefined}
              />
              <p className="admin-config-hint">{t('admin.config.versionsMaxPerFileHint')}</p>
              {errors.versionsMaxPerFile && <p className="admin-config-field-error">{errors.versionsMaxPerFile}</p>}
            </div>
          </div>
        </section>

        {/* Vaults & Uploads — limits that were previously config-file only */}
        <section className="admin-config-card">
          <h2 className="admin-config-card-title">Vaults &amp; Uploads</h2>
          <p className="admin-config-hint">
            Diese Grenzen galten bisher nur über <code>config/default.json</code>. Sie greifen sofort;
            Port, Host und Log-Level brauchen weiterhin einen Neustart.
          </p>
          <div className="admin-config-grid">
            <div className="admin-config-field">
              <label htmlFor="config-max-vaults-per-user">Vaults pro Benutzer</label>
              <input
                id="config-max-vaults-per-user"
                type="number"
                min={1}
                max={1000}
                value={maxVaultsPerUser}
                onChange={(e) => setMaxVaultsPerUser(e.target.value)}
                aria-invalid={errors.maxVaultsPerUser !== undefined}
              />
              <p className="admin-config-hint">
                Wie viele Vaults ein Konto besitzen darf. Freigegebene Vaults zählen nicht mit.
              </p>
              {errors.maxVaultsPerUser && <p className="admin-config-field-error">{errors.maxVaultsPerUser}</p>}
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-max-directory-depth">Maximale Ordnertiefe</label>
              <input
                id="config-max-directory-depth"
                type="number"
                min={1}
                max={200}
                value={maxDirectoryDepth}
                onChange={(e) => setMaxDirectoryDepth(e.target.value)}
              />
              <p className="admin-config-hint">Verschachtelungsebenen, die der Datei-Explorer einliest.</p>
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-upload-max-size">Upload-Größe (Bytes)</label>
              <input
                id="config-upload-max-size"
                type="number"
                min={1}
                value={uploadMaxFileSize}
                onChange={(e) => setUploadMaxFileSize(e.target.value)}
              />
              <p className="admin-config-hint">Pro hochgeladener Datei. Standard: 100 MB.</p>
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-upload-max-files">Dateien pro Upload</label>
              <input
                id="config-upload-max-files"
                type="number"
                min={1}
                max={1000}
                value={uploadMaxFilesPerDrop}
                onChange={(e) => setUploadMaxFilesPerDrop(e.target.value)}
              />
              <p className="admin-config-hint">Wie viele Dateien auf einmal abgelegt werden dürfen.</p>
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-upload-paste-size">Bild-Einfügegröße (Bytes)</label>
              <input
                id="config-upload-paste-size"
                type="number"
                min={1}
                value={uploadMaxImagePasteSize}
                onChange={(e) => setUploadMaxImagePasteSize(e.target.value)}
              />
              <p className="admin-config-hint">Grenze für Bilder, die aus der Zwischenablage eingefügt werden.</p>
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-cleanup-interval">Aufräum-Intervall (Stunden)</label>
              <input
                id="config-cleanup-interval"
                type="number"
                min={1}
                max={720}
                value={cleanupIntervalHours}
                onChange={(e) => setCleanupIntervalHours(e.target.value)}
              />
              <p className="admin-config-hint">Abstand zwischen Papierkorb- und Versions-Aufräumläufen.</p>
            </div>
          </div>
        </section>

        {/* Import & MCP */}
        <section className="admin-config-card">
          <h2 className="admin-config-card-title">Import &amp; MCP</h2>
          <div className="admin-config-grid">
            <div className="admin-config-field">
              <label htmlFor="config-import-max-size">Import-Dateigröße (Bytes)</label>
              <input
                id="config-import-max-size"
                type="number"
                min={1}
                value={importMaxFileSize}
                onChange={(e) => setImportMaxFileSize(e.target.value)}
              />
              <p className="admin-config-hint">Gesamtgröße eines Vault-Imports. Standard: 500 MB.</p>
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-import-max-files">Import-Dateianzahl</label>
              <input
                id="config-import-max-files"
                type="number"
                min={1}
                value={importMaxFiles}
                onChange={(e) => setImportMaxFiles(e.target.value)}
              />
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-import-max-depth">Import-Ordnertiefe</label>
              <input
                id="config-import-max-depth"
                type="number"
                min={1}
                max={100}
                value={importMaxDepth}
                onChange={(e) => setImportMaxDepth(e.target.value)}
              />
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-mcp-max-size">MCP-Dateigröße (Bytes)</label>
              <input
                id="config-mcp-max-size"
                type="number"
                min={1}
                value={mcpMaxFileSize}
                onChange={(e) => setMcpMaxFileSize(e.target.value)}
              />
              <p className="admin-config-hint">
                Getrennt von der Editor-Grenze: MCP liefert auch Bilder und PDFs base64-kodiert aus.
              </p>
            </div>
            <div className="admin-config-field">
              <label htmlFor="config-mcp-rate-limit">MCP-Anfragen pro Minute</label>
              <input
                id="config-mcp-rate-limit"
                type="number"
                min={1}
                value={mcpRateLimit}
                onChange={(e) => setMcpRateLimit(e.target.value)}
              />
              <p className="admin-config-hint">Pro Token.</p>
            </div>
          </div>
          {errors.limits && <p className="admin-config-field-error">{errors.limits}</p>}
        </section>

        {/* Messages */}
        {saveMessage && <div className="admin-config-message admin-config-message--success">{saveMessage}</div>}
        {shadowedByEnv.length > 0 && (
          <div className="admin-config-message admin-config-message--error">
            Per Umgebungsvariable festgelegt und daher unverändert: {shadowedByEnv.join(', ')}
          </div>
        )}
        {saveError && <div className="admin-config-message admin-config-message--error">{saveError}</div>}

        <button type="submit" className="admin-config-btn admin-config-btn--primary" disabled={isSaving}>
          <Save size={14} />
          {isSaving ? t('admin.config.saving') : t('admin.config.saveConfig')}
        </button>
      </form>

    </div>
  )
}

function buildAuthHeaders(apiClient: IApiClient): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = apiClient.getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const csrfToken = apiClient.getCsrfToken()
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken
  return headers
}
