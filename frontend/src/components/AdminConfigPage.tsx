import { useState, useEffect, type FormEvent } from 'react'
import type { IApiClient } from '../api'

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
 * Displays current config, allows editing with validation, and provides a restart button.
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

  /**
   * Loads the current server configuration on mount.
   */
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
          const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
          setLoadError(message)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadConfig()
    return () => { cancelled = true }
  }, [apiClient])

  /**
   * Validates form fields. Returns true if all fields are valid.
   */
  function validate(): boolean {
    const newErrors: ConfigFormErrors = {}

    const portNum = parseInt(port, 10)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      newErrors.port = 'Port muss eine Ganzzahl zwischen 1 und 65535 sein.'
    }

    if (host.trim() === '') {
      newErrors.host = 'Host darf nicht leer sein.'
    }

    if (!VALID_LOG_LEVELS.includes(logLevel)) {
      newErrors.logLevel = 'Log-Level muss debug, info, warn oder error sein.'
    }

    const maxFileSizeNum = parseInt(maxFileSize, 10)
    if (isNaN(maxFileSizeNum) || maxFileSizeNum <= 0) {
      newErrors.maxFileSize = 'Maximale Dateigröße muss eine positive Ganzzahl sein.'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /**
   * Handles form submission: validates and saves config via PUT.
   */
  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setSaveMessage(null)
    setSaveError(null)

    if (!validate()) {
      return
    }

    setIsSaving(true)

    const originsArray = allowedOrigins
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0)

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
        headers: {
          ...buildAuthHeaders(apiClient),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'Fehler beim Speichern' }))
        throw new Error(body.message ?? `HTTP ${response.status}`)
      }

      setSaveMessage('Konfiguration gespeichert. Neustart erforderlich, um Änderungen anzuwenden.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setSaveError(message)
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Handles server restart with confirmation dialog.
   */
  async function handleRestart(): Promise<void> {
    const confirmed = window.confirm('Server wirklich neustarten?')
    if (!confirmed) {
      return
    }

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
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setRestartError(message)
    } finally {
      setIsRestarting(false)
    }
  }

  // --- Loading / Error states ---

  if (isLoading) {
    return <div className="admin-config-page"><p>Laden…</p></div>
  }

  if (loadError) {
    return (
      <div className="admin-config-page">
        <p className="admin-config-error" role="alert">Fehler: {loadError}</p>
      </div>
    )
  }

  if (!config) {
    return null
  }

  return (
    <div className="admin-config-page">
      <h2>Serverkonfiguration</h2>

      <form className="admin-config-form" onSubmit={handleSubmit} noValidate>
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
            aria-describedby={errors.port ? 'config-port-error' : undefined}
          />
          {errors.port && (
            <p id="config-port-error" className="admin-config-field-error" role="alert">
              {errors.port}
            </p>
          )}
        </div>

        <div className="admin-config-field">
          <label htmlFor="config-host">Host</label>
          <input
            id="config-host"
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            aria-invalid={errors.host !== undefined}
            aria-describedby={errors.host ? 'config-host-error' : undefined}
          />
          {errors.host && (
            <p id="config-host-error" className="admin-config-field-error" role="alert">
              {errors.host}
            </p>
          )}
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
          <p className="admin-config-hint">Kommagetrennte Liste</p>
        </div>

        <div className="admin-config-field">
          <label htmlFor="config-max-file-size">Maximale Dateigröße (Bytes)</label>
          <input
            id="config-max-file-size"
            type="number"
            min={1}
            value={maxFileSize}
            onChange={(e) => setMaxFileSize(e.target.value)}
            aria-invalid={errors.maxFileSize !== undefined}
            aria-describedby={errors.maxFileSize ? 'config-max-file-size-error' : undefined}
          />
          {errors.maxFileSize && (
            <p id="config-max-file-size-error" className="admin-config-field-error" role="alert">
              {errors.maxFileSize}
            </p>
          )}
        </div>

        <div className="admin-config-field">
          <label htmlFor="config-log-level">Log-Level</label>
          <select
            id="config-log-level"
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value)}
            aria-invalid={errors.logLevel !== undefined}
            aria-describedby={errors.logLevel ? 'config-log-level-error' : undefined}
          >
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          {errors.logLevel && (
            <p id="config-log-level-error" className="admin-config-field-error" role="alert">
              {errors.logLevel}
            </p>
          )}
        </div>

        {saveMessage && (
          <p className="admin-config-success" role="status">{saveMessage}</p>
        )}
        {saveError && (
          <p className="admin-config-error" role="alert">{saveError}</p>
        )}

        <button
          type="submit"
          className="admin-config-save-btn"
          disabled={isSaving}
        >
          {isSaving ? 'Speichern…' : 'Konfiguration speichern'}
        </button>
      </form>

      <hr className="admin-config-divider" />

      <div className="admin-config-restart-section">
        <h3>Server neustarten</h3>
        {restartMessage && (
          <p className="admin-config-success" role="status">{restartMessage}</p>
        )}
        {restartError && (
          <p className="admin-config-error" role="alert">{restartError}</p>
        )}
        <button
          type="button"
          className="admin-config-restart-btn"
          onClick={handleRestart}
          disabled={isRestarting}
        >
          {isRestarting ? 'Neustart…' : 'Server neustarten'}
        </button>
      </div>
    </div>
  )
}

/**
 * Builds authorization headers from the API client's current token and CSRF token.
 */
function buildAuthHeaders(apiClient: IApiClient): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = apiClient.getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const csrfToken = apiClient.getCsrfToken()
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  return headers
}
