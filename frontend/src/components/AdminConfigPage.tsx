import { useState, useEffect, type FormEvent } from 'react'
import type { IApiClient } from '../api'
import { Settings, RefreshCw, Save, AlertTriangle } from 'lucide-react'

/**
 * Shape of the server configuration returned by GET /api/v1/admin/config.
 */
export interface ServerConfigData {
  port: number
  host: string
  allowedOrigins: string[]
  maxFileSize: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
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
}

/**
 * Admin server configuration page.
 * Displays current config in a card-based layout with clear sections.
 * UI labels are in German as per project conventions.
 */
export function AdminConfigPage({ apiClient }: AdminConfigPageProps) {
  const [config, setConfig] = useState<ServerConfigData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Form state
  const [port, setPort] = useState('')
  const [host, setHost] = useState('')
  const [allowedOrigins, setAllowedOrigins] = useState('')
  const [maxFileSize, setMaxFileSize] = useState('')
  const [logLevel, setLogLevel] = useState('')

  // UI state
  const [errors, setErrors] = useState<ConfigFormErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)
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
          const body = await response.json().catch(() => ({ message: 'Fehler beim Laden der Konfiguration' }))
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
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Unbekannter Fehler')
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
      newErrors.port = 'Port muss zwischen 1 und 65535 liegen.'
    }
    if (host.trim() === '') {
      newErrors.host = 'Host darf nicht leer sein.'
    }
    if (!VALID_LOG_LEVELS.includes(logLevel)) {
      newErrors.logLevel = 'Ungültiges Log-Level.'
    }
    const maxFileSizeNum = parseInt(maxFileSize, 10)
    if (isNaN(maxFileSizeNum) || maxFileSizeNum <= 0) {
      newErrors.maxFileSize = 'Muss eine positive Ganzzahl sein.'
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
    }

    try {
      const response = await fetch('/api/v1/admin/config', {
        method: 'PUT',
        headers: { ...buildAuthHeaders(apiClient), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Fehler beim Speichern' }))
        throw new Error(body.message ?? `HTTP ${response.status}`)
      }
      setSaveMessage('Konfiguration gespeichert. Neustart erforderlich.')
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRestart(): Promise<void> {
    if (!window.confirm('Server wirklich neustarten? Alle aktiven Verbindungen werden unterbrochen.')) return
    setRestartMessage(null)
    setRestartError(null)
    setIsRestarting(true)
    try {
      const response = await fetch('/api/v1/admin/restart', {
        method: 'POST',
        headers: buildAuthHeaders(apiClient),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Fehler beim Neustart' }))
        throw new Error(body.message ?? `HTTP ${response.status}`)
      }
      setRestartMessage('Server wird neu gestartet…')
    } catch (err: unknown) {
      setRestartError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setIsRestarting(false)
    }
  }

  if (isLoading) {
    return <div className="admin-config-page"><p className="admin-config-loading">Laden…</p></div>
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
        <h1 className="admin-config-title">Serverkonfiguration</h1>
      </div>

      {/* Network section */}
      <form className="admin-config-form" onSubmit={handleSubmit} noValidate>
        <section className="admin-config-card">
          <h2 className="admin-config-card-title">Netzwerk</h2>
          <div className="admin-config-grid">
            <div className="admin-config-field">
              <label htmlFor="config-port">Port</label>
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
              <label htmlFor="config-host">Host</label>
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
            <label htmlFor="config-allowed-origins">Erlaubte Origins</label>
            <input
              id="config-allowed-origins"
              type="text"
              value={allowedOrigins}
              onChange={(e) => setAllowedOrigins(e.target.value)}
              placeholder="http://localhost:5173, https://example.com"
            />
            <p className="admin-config-hint">Kommagetrennte Liste der erlaubten CORS-Origins</p>
          </div>
        </section>

        {/* Limits section */}
        <section className="admin-config-card">
          <h2 className="admin-config-card-title">Limits & Logging</h2>
          <div className="admin-config-grid">
            <div className="admin-config-field">
              <label htmlFor="config-max-file-size">Max. Dateigröße (Bytes)</label>
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
              <label htmlFor="config-log-level">Log-Level</label>
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

        {/* Messages */}
        {saveMessage && <div className="admin-config-message admin-config-message--success">{saveMessage}</div>}
        {saveError && <div className="admin-config-message admin-config-message--error">{saveError}</div>}

        <button type="submit" className="admin-config-btn admin-config-btn--primary" disabled={isSaving}>
          <Save size={14} />
          {isSaving ? 'Speichern…' : 'Konfiguration speichern'}
        </button>
      </form>

      {/* Restart section */}
      <section className="admin-config-card admin-config-card--danger">
        <h2 className="admin-config-card-title">
          <AlertTriangle size={15} /> Gefahrenzone
        </h2>
        <p className="admin-config-card-desc">
          Ein Neustart unterbricht alle aktiven Verbindungen. Gespeicherte Konfigurationsänderungen werden erst nach dem Neustart wirksam.
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
          {isRestarting ? 'Neustart…' : 'Server neustarten'}
        </button>
      </section>
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
