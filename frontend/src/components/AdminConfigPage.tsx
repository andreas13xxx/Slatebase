import { useState, useEffect, useCallback, type FormEvent } from 'react'
import type { IApiClient, FeatureToggleState } from '../api'
import { useTranslation } from '../i18n'
import { Settings, RefreshCw, Save, AlertTriangle, Loader, AlertCircle } from 'lucide-react'
import { ConfirmModal } from './ConfirmModal'
import { VersionCheckCard } from './VersionCheckCard'
import { useFeatureContext } from '../state/featureContext'

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
}

/** Props for the AdminConfigPage component. */
export interface AdminConfigPageProps {
  /** API client instance for making admin requests. */
  apiClient: IApiClient
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
}

/**
 * Admin server configuration page.
 * Displays current config in a card-based layout with clear sections.
 */
export function AdminConfigPage({ apiClient }: AdminConfigPageProps) {
  const { t } = useTranslation()
  const { dispatch: featureDispatch } = useFeatureContext()

  // Feature-toggle admin state
  const [adminFeatures, setAdminFeatures] = useState<FeatureToggleState[]>([])
  const [featuresLoading, setFeaturesLoading] = useState(true)
  const [featuresError, setFeaturesError] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

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

  // UI state
  const [errors, setErrors] = useState<ConfigFormErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  const [restartMessage, setRestartMessage] = useState<string | null>(null)
  const [restartError, setRestartError] = useState<string | null>(null)

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

  // Feature toggle loading
  const loadAdminFeatures = useCallback(async () => {
    setFeaturesLoading(true)
    setFeaturesError(null)
    try {
      const features = await apiClient.loadAdminFeatures()
      setAdminFeatures(features)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message :
        (typeof err === 'object' && err !== null && 'message' in err) ?
          String((err as { message: unknown }).message) : 'Fehler beim Laden der Feature-Toggles'
      setFeaturesError(message)
    } finally {
      setFeaturesLoading(false)
    }
  }, [apiClient])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAdminFeatures()
  }, [loadAdminFeatures])

  async function handleToggle(featureName: string, currentEnabled: boolean): Promise<void> {
    setToggleError(null)
    const newEnabled = !currentEnabled

    // Optimistic update on local admin features list
    setAdminFeatures(prev => prev.map(f =>
      f.name === featureName ? { ...f, enabled: newEnabled } : f
    ))

    // Also update the global feature context optimistically
    featureDispatch({ type: 'FEATURE_UPDATED', name: featureName, enabled: newEnabled })

    try {
      await apiClient.toggleAdminFeature(featureName, newEnabled)
    } catch (err: unknown) {
      // Rollback local admin features
      setAdminFeatures(prev => prev.map(f =>
        f.name === featureName ? { ...f, enabled: currentEnabled } : f
      ))
      // Rollback global feature context
      featureDispatch({ type: 'FEATURE_UPDATED', name: featureName, enabled: currentEnabled })

      const message = err instanceof Error ? err.message :
        (typeof err === 'object' && err !== null && 'message' in err) ?
          String((err as { message: unknown }).message) : 'Fehler beim Ändern des Features'
      setToggleError(message)
    }
  }

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
      setSaveMessage(t('admin.config.saveSuccess'))
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t('admin.config.unknownError'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRestart(): Promise<void> {
    setRestartConfirmOpen(true)
  }

  async function handleRestartConfirmed(): Promise<void> {
    setRestartConfirmOpen(false)
    setRestartMessage(null)
    setRestartError(null)
    setIsRestarting(true)
    try {
      const response = await fetch('/api/v1/admin/restart', {
        method: 'POST',
        headers: buildAuthHeaders(apiClient),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: t('admin.config.restartError') }))
        throw new Error(body.message ?? `HTTP ${response.status}`)
      }
      setRestartMessage(t('admin.config.restartSuccess'))
    } catch (err: unknown) {
      setRestartError(err instanceof Error ? err.message : t('admin.config.unknownError'))
    } finally {
      setIsRestarting(false)
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
      <section className="admin-config-card">
        <h2 className="admin-config-card-title">Feature-Toggles</h2>
        {featuresLoading && (
          <div className="feature-toggle-loading">
            <Loader size={16} className="feature-toggle-spinner" />
            <span>Laden…</span>
          </div>
        )}
        {featuresError && !featuresLoading && (
          <div className="feature-toggle-error">
            <AlertCircle size={14} />
            <span>{featuresError}</span>
            <button
              type="button"
              className="feature-toggle-retry-btn"
              onClick={() => void loadAdminFeatures()}
            >
              Erneut versuchen
            </button>
          </div>
        )}
        {toggleError && (
          <div className="feature-toggle-toast">
            <AlertCircle size={14} />
            <span>{toggleError}</span>
            <button
              type="button"
              className="feature-toggle-toast-close"
              onClick={() => setToggleError(null)}
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
        )}
        {!featuresLoading && !featuresError && adminFeatures.map(feature => (
          <div
            key={feature.name}
            className={`feature-toggle-item${!feature.enabled ? ' feature-toggle-item--disabled' : ''}`}
          >
            <div className="feature-toggle-info">
              <div className="feature-toggle-name">{feature.name}</div>
              <div className="feature-toggle-description">{feature.description}</div>
              {feature.type === 'cold' && (
                <div className="feature-toggle-cold-hint">
                  <AlertTriangle size={12} />
                  Neustart erforderlich
                </div>
              )}
            </div>
            <label className="feature-toggle-switch">
              <input
                type="checkbox"
                checked={feature.enabled}
                onChange={() => void handleToggle(feature.name, feature.enabled)}
                aria-label={`${feature.name} ${feature.enabled ? 'deaktivieren' : 'aktivieren'}`}
              />
              <span className="feature-toggle-switch__slider" />
            </label>
          </div>
        ))}
      </section>

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

        {/* Messages */}
        {saveMessage && <div className="admin-config-message admin-config-message--success">{saveMessage}</div>}
        {saveError && <div className="admin-config-message admin-config-message--error">{saveError}</div>}

        <button type="submit" className="admin-config-btn admin-config-btn--primary" disabled={isSaving}>
          <Save size={14} />
          {isSaving ? t('admin.config.saving') : t('admin.config.saveConfig')}
        </button>
      </form>

      {/* Restart section */}
      <section className="admin-config-card admin-config-card--danger">
        <h2 className="admin-config-card-title">
          <AlertTriangle size={15} /> {t('admin.config.dangerZone')}
        </h2>
        <p className="admin-config-card-desc">
          {t('admin.config.dangerDesc')}
        </p>
        {restartMessage && <div className="admin-config-message admin-config-message--success">{restartMessage}</div>}
        {restartError && <div className="admin-config-message admin-config-message--error">{restartError}</div>}
        <button
          type="button"
          className="admin-config-btn admin-config-btn--danger"
          onClick={handleRestart}
          disabled={isRestarting}
        >
          <RefreshCw size={14} />
          {isRestarting ? t('admin.config.restarting') : t('admin.config.restart')}
        </button>
      </section>

      {/* Restart Confirmation Modal */}
      <ConfirmModal
        open={restartConfirmOpen}
        title={t('admin.config.restart')}
        message={t('admin.config.restartConfirm')}
        confirmLabel={t('admin.config.restart')}
        variant="danger"
        onConfirm={handleRestartConfirmed}
        onCancel={() => setRestartConfirmOpen(false)}
      />
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
