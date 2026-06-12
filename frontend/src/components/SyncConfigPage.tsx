import { useState, useEffect, type FormEvent } from 'react'
import { RefreshCw, Settings, Shield, Wifi } from 'lucide-react'
import { useSyncContext } from '../state/syncContext'
import { useAppContext } from '../state/index'
import { useTranslation } from '../i18n'
import { ConfirmModal } from './ConfirmModal'
import { SyncStatusPanel } from './SyncStatusPanel'
import {
  loadSyncConfig,
  createSyncConfig,
  updateSyncConfig,
  disableSyncConfig,
  enableSyncConfig,
  removeSyncConfig,
} from '../state/syncActions'
import type { CreateSyncConfigInput, UpdateSyncConfigInput, ConnectionTestResult } from '../state/syncState'

/** Props for the SyncConfigPage component. */
export interface SyncConfigPageProps {
  vaultId: string
  onOpenSyncLog?: () => void
}

/** Form validation errors. */
interface FormErrors {
  setupUri: string | null
  setupUriPassphrase: string | null
  endpoint: string | null
  database: string | null
  username: string | null
  password: string | null
  interval: string | null
  e2ePassphrase: string | null
}

const emptyErrors: FormErrors = {
  setupUri: null,
  setupUriPassphrase: null,
  endpoint: null,
  database: null,
  username: null,
  password: null,
  interval: null,
  e2ePassphrase: null,
}

/** Setup tab type. */
type SetupTab = 'uri' | 'manual'

/** Page view mode. */
type ViewMode = 'view' | 'create' | 'edit'

/**
 * Main configuration page for vault synchronization.
 * Shows setup form when no config exists, or current config with edit/disable/remove actions.
 */
export function SyncConfigPage({ vaultId, onOpenSyncLog }: SyncConfigPageProps) {
  const { state, dispatch } = useSyncContext()
  const { apiClient, state: appState } = useAppContext()
  const { t } = useTranslation()

  // Resolve vault name from app state
  const vaultName = appState.vaults.find((v) => v.id === vaultId)?.name ?? vaultId

  // --- View mode ---
  const [viewMode, setViewMode] = useState<ViewMode>('view')
  const [setupTab, setSetupTab] = useState<SetupTab>('uri')

  // --- Form state ---
  const [setupUri, setSetupUri] = useState('')
  const [setupUriPassphrase, setSetupUriPassphrase] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [database, setDatabase] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'bidirectional' | 'readonly'>('readonly')
  const [trigger, setTrigger] = useState<'manual' | 'interval'>('manual')
  const [intervalMinutes, setIntervalMinutes] = useState('60')
  const [e2eEnabled, setE2eEnabled] = useState(false)
  const [e2ePassphrase, setE2ePassphrase] = useState('')

  // --- UI state ---
  const [errors, setErrors] = useState<FormErrors>(emptyErrors)
  const [pending, setPending] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null)

  // --- Load config on mount ---
  useEffect(() => {
    if (apiClient) {
      void loadSyncConfig(dispatch, apiClient, vaultId)
    }
  }, [apiClient, vaultId, dispatch])

  // --- Determine view mode based on config state ---
  useEffect(() => {
    if (state.config === null && !state.isLoading && viewMode === 'view') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewMode('create')
    } else if (state.config !== null && viewMode === 'create') {
      setViewMode('view')
    }
  }, [state.config, state.isLoading, viewMode])

  // --- Pre-fill form when entering edit mode ---
  function enterEditMode(): void {
    if (state.config) {
      setEndpoint(state.config.endpoint)
      setDatabase(state.config.database)
      setUsername(state.config.username)
      setPassword('')
      setMode(state.config.mode)
      setTrigger(state.config.trigger)
      setIntervalMinutes(state.config.intervalMinutes?.toString() ?? '60')
      setE2eEnabled(state.config.e2eEnabled)
      setE2ePassphrase('')
      setErrors(emptyErrors)
      setConnectionTest(null)
      setViewMode('edit')
    }
  }

  function cancelEdit(): void {
    setViewMode('view')
    setErrors(emptyErrors)
    setConnectionTest(null)
  }

  // --- Validation ---
  function validateCreateForm(): boolean {
    const newErrors: FormErrors = { ...emptyErrors }
    let valid = true

    if (setupTab === 'uri') {
      if (setupUri.trim() === '') {
        newErrors.setupUri = t('sync.setupUriRequired')
        valid = false
      }
      if (setupUriPassphrase.trim() === '') {
        newErrors.setupUriPassphrase = t('sync.setupUriPassphraseRequired')
        valid = false
      }
    } else {
      if (endpoint.trim() === '') {
        newErrors.endpoint = t('sync.endpointRequired')
        valid = false
      }
      if (database.trim() === '') {
        newErrors.database = t('sync.databaseRequired')
        valid = false
      }
      if (username.trim() === '') {
        newErrors.username = t('sync.usernameRequired')
        valid = false
      }
      if (password === '') {
        newErrors.password = t('sync.passwordRequired')
        valid = false
      }
    }

    if (trigger === 'interval') {
      const interval = parseInt(intervalMinutes, 10)
      if (isNaN(interval) || interval < 5 || interval > 1440) {
        newErrors.interval = t('sync.intervalInvalid')
        valid = false
      }
    }

    if (e2eEnabled) {
      if (e2ePassphrase === '') {
        newErrors.e2ePassphrase = t('sync.e2ePassphraseRequired')
        valid = false
      } else if (e2ePassphrase.length < 8) {
        newErrors.e2ePassphrase = t('sync.e2ePassphraseTooShort')
        valid = false
      } else if (e2ePassphrase.length > 256) {
        newErrors.e2ePassphrase = t('sync.e2ePassphraseTooLong')
        valid = false
      }
    }

    setErrors(newErrors)
    return valid
  }

  function validateUpdateForm(): boolean {
    const newErrors: FormErrors = { ...emptyErrors }
    let valid = true

    if (endpoint.trim() === '') {
      newErrors.endpoint = t('sync.endpointRequired')
      valid = false
    }
    if (database.trim() === '') {
      newErrors.database = t('sync.databaseRequired')
      valid = false
    }
    if (username.trim() === '') {
      newErrors.username = t('sync.usernameRequired')
      valid = false
    }
    // Password is optional on update (leave empty to keep current)

    if (trigger === 'interval') {
      const interval = parseInt(intervalMinutes, 10)
      if (isNaN(interval) || interval < 5 || interval > 1440) {
        newErrors.interval = t('sync.intervalInvalid')
        valid = false
      }
    }

    if (e2eEnabled && e2ePassphrase !== '') {
      if (e2ePassphrase.length < 8) {
        newErrors.e2ePassphrase = t('sync.e2ePassphraseTooShort')
        valid = false
      } else if (e2ePassphrase.length > 256) {
        newErrors.e2ePassphrase = t('sync.e2ePassphraseTooLong')
        valid = false
      }
    }

    setErrors(newErrors)
    return valid
  }

  // --- Submit handlers ---
  async function handleCreate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!apiClient || !validateCreateForm()) return

    setPending(true)
    setConnectionTest(null)

    const input: CreateSyncConfigInput = {
      mode,
      trigger,
      intervalMinutes: trigger === 'interval' ? parseInt(intervalMinutes, 10) : undefined,
      e2eEnabled,
      e2ePassphrase: e2eEnabled ? e2ePassphrase : undefined,
    }

    if (setupTab === 'uri') {
      input.setupUri = setupUri.trim()
      input.setupUriPassphrase = setupUriPassphrase
    } else {
      input.endpoint = endpoint.trim()
      input.database = database.trim()
      input.username = username.trim()
      input.password = password
    }

    await createSyncConfig(dispatch, apiClient, vaultId, input)
    setPending(false)

    // Show connection test result from state
    if (state.config) {
      setViewMode('view')
    }
  }

  async function handleUpdate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!apiClient || !validateUpdateForm()) return

    setPending(true)
    setConnectionTest(null)

    const input: UpdateSyncConfigInput = {
      endpoint: endpoint.trim(),
      database: database.trim(),
      username: username.trim(),
      mode,
      trigger,
      intervalMinutes: trigger === 'interval' ? parseInt(intervalMinutes, 10) : undefined,
      e2eEnabled,
    }

    if (password !== '') {
      input.password = password
    }
    if (e2eEnabled && e2ePassphrase !== '') {
      input.e2ePassphrase = e2ePassphrase
    }

    await updateSyncConfig(dispatch, apiClient, vaultId, input)
    setPending(false)

    if (!state.error) {
      setViewMode('view')
    }
  }

  // --- Action handlers ---
  async function handleDisable(): Promise<void> {
    if (!apiClient) return
    setPending(true)
    await disableSyncConfig(dispatch, apiClient, vaultId)
    setPending(false)
  }

  async function handleEnable(): Promise<void> {
    if (!apiClient) return
    setPending(true)
    await enableSyncConfig(dispatch, apiClient, vaultId)
    setPending(false)
  }

  async function handleRemove(): Promise<void> {
    if (!apiClient) return
    setShowRemoveConfirm(false)
    setPending(true)
    await removeSyncConfig(dispatch, apiClient, vaultId)
    setPending(false)
    // Only switch to create mode if config was actually removed
    // (dispatch will set state.config to null on success)
  }

  // --- Update connection test from state ---
  useEffect(() => {
    // After create/update, the state may have a config result with connection test info
    // We extract it from the last action result if available
  }, [state.config])

  // --- Loading state ---
  if (state.isLoading && !state.config && viewMode === 'view') {
    return (
      <div className="sync-config-page" aria-busy="true">
        <p>{t('sync.configLoading')}</p>
      </div>
    )
  }

  // --- Render connection test result ---
  function renderConnectionTest(test: ConnectionTestResult | null) {
    if (!test) return null
    return (
      <div className="sync-config-connection-test">
        <h3 className="sync-config-connection-title">
          <Wifi size={14} />
          {t('sync.connectionTest')}
        </h3>
        <div className="sync-config-connection-indicators">
          <span className={`sync-config-indicator ${test.reachable ? 'sync-config-indicator--success' : 'sync-config-indicator--error'}`}>
            {test.reachable ? t('sync.connectionReachable') : t('sync.connectionNotReachable')}
          </span>
          <span className={`sync-config-indicator ${test.authenticated ? 'sync-config-indicator--success' : 'sync-config-indicator--error'}`}>
            {test.authenticated ? t('sync.connectionAuthenticated') : t('sync.connectionNotAuthenticated')}
          </span>
        </div>
        {test.error && (
          <p className="sync-config-connection-error">
            {t('sync.connectionError', { error: test.error })}
          </p>
        )}
      </div>
    )
  }

  // --- Render mode/trigger/e2e fields (shared between create and edit) ---
  function renderCommonFields() {
    return (
      <>
        {/* Mode selector */}
        <div className="sync-config-field">
          <label className="sync-config-label">
            <RefreshCw size={14} />
            {t('sync.modeLabel')}
          </label>
          <div className="sync-config-radio-group">
            <label className="sync-config-radio">
              <input
                type="radio"
                name="sync-mode"
                value="bidirectional"
                checked={mode === 'bidirectional'}
                onChange={() => setMode('bidirectional')}
              />
              {t('sync.modeBidirectional')}
            </label>
            <label className="sync-config-radio">
              <input
                type="radio"
                name="sync-mode"
                value="readonly"
                checked={mode === 'readonly'}
                onChange={() => setMode('readonly')}
              />
              {t('sync.modeReadonly')}
            </label>
          </div>
        </div>

        {/* Trigger selector */}
        <div className="sync-config-field">
          <label className="sync-config-label">{t('sync.triggerLabel')}</label>
          <div className="sync-config-radio-group">
            <label className="sync-config-radio">
              <input
                type="radio"
                name="sync-trigger"
                value="manual"
                checked={trigger === 'manual'}
                onChange={() => setTrigger('manual')}
              />
              {t('sync.triggerManual')}
            </label>
            <label className="sync-config-radio">
              <input
                type="radio"
                name="sync-trigger"
                value="interval"
                checked={trigger === 'interval'}
                onChange={() => setTrigger('interval')}
              />
              {t('sync.triggerInterval')}
            </label>
          </div>
        </div>

        {/* Interval input (only when trigger is interval) */}
        {trigger === 'interval' && (
          <div className="sync-config-field">
            <label className="sync-config-label" htmlFor="sync-interval">
              {t('sync.intervalLabel')}
            </label>
            <input
              id="sync-interval"
              className="sync-config-input sync-config-input--short"
              type="number"
              min={5}
              max={1440}
              value={intervalMinutes}
              onChange={(e) => {
                setIntervalMinutes(e.target.value)
                if (errors.interval) setErrors((prev) => ({ ...prev, interval: null }))
              }}
              aria-invalid={errors.interval !== null}
              aria-describedby={errors.interval ? 'sync-interval-error' : 'sync-interval-hint'}
            />
            <span id="sync-interval-hint" className="sync-config-hint">
              {t('sync.intervalHint')}
            </span>
            {errors.interval && (
              <p id="sync-interval-error" className="sync-config-field-error" role="alert">
                {errors.interval}
              </p>
            )}
          </div>
        )}

        {/* E2E encryption toggle */}
        <div className="sync-config-field">
          <label className="sync-config-label">
            <Shield size={14} />
            {t('sync.e2eLabel')}
          </label>
          <label className="sync-config-toggle">
            <input
              type="checkbox"
              checked={e2eEnabled}
              onChange={(e) => setE2eEnabled(e.target.checked)}
            />
            {e2eEnabled ? t('sync.e2eEnabled') : t('sync.e2eDisabled')}
          </label>
        </div>

        {/* E2E passphrase (only when e2e is enabled) */}
        {e2eEnabled && (
          <div className="sync-config-field">
            <label className="sync-config-label" htmlFor="sync-e2e-passphrase">
              {t('sync.e2ePassphraseLabel')}
            </label>
            <input
              id="sync-e2e-passphrase"
              className="sync-config-input"
              type="password"
              minLength={8}
              maxLength={256}
              value={e2ePassphrase}
              onChange={(e) => {
                setE2ePassphrase(e.target.value)
                if (errors.e2ePassphrase) setErrors((prev) => ({ ...prev, e2ePassphrase: null }))
              }}
              placeholder={t('sync.e2ePassphrasePlaceholder')}
              aria-invalid={errors.e2ePassphrase !== null}
              aria-describedby={errors.e2ePassphrase ? 'sync-e2e-error' : 'sync-e2e-hint'}
            />
            <span id="sync-e2e-hint" className="sync-config-hint">
              {t('sync.e2ePassphraseHint')}
            </span>
            {errors.e2ePassphrase && (
              <p id="sync-e2e-error" className="sync-config-field-error" role="alert">
                {errors.e2ePassphrase}
              </p>
            )}
          </div>
        )}
      </>
    )
  }

  // --- Render: Create form ---
  function renderCreateForm() {
    return (
      <section className="sync-config-section" aria-labelledby="sync-create-heading">
        <h2 id="sync-create-heading" className="sync-config-section-title">
          <Settings size={16} />
          {t('sync.configTitle')}
        </h2>
        <p className="sync-config-hint-block">{t('sync.noConfigHint')}</p>

        {/* Tab selector: URI vs Manual */}
        <div className="sync-config-tabs">
          <button
            type="button"
            className={`sync-config-tab ${setupTab === 'uri' ? 'sync-config-tab--active' : ''}`}
            onClick={() => setSetupTab('uri')}
          >
            {t('sync.tabSetupUri')}
          </button>
          <button
            type="button"
            className={`sync-config-tab ${setupTab === 'manual' ? 'sync-config-tab--active' : ''}`}
            onClick={() => setSetupTab('manual')}
          >
            {t('sync.tabManual')}
          </button>
        </div>

        <form className="sync-config-form" onSubmit={handleCreate} noValidate>
          {setupTab === 'uri' ? renderSetupUriFields() : renderManualFields(false)}
          {renderCommonFields()}

          {state.error && (
            <p className="sync-config-error" role="alert">{state.error}</p>
          )}

          {renderConnectionTest(connectionTest)}

          <button
            type="submit"
            className="sync-config-submit"
            disabled={pending || state.isLoading}
          >
            {pending ? t('sync.creating') : t('sync.createConfig')}
          </button>
        </form>
      </section>
    )
  }

  // --- Render: Setup URI fields ---
  function renderSetupUriFields() {
    return (
      <>
        <div className="sync-config-field">
          <label className="sync-config-label" htmlFor="sync-setup-uri">
            {t('sync.setupUriLabel')}
          </label>
          <textarea
            id="sync-setup-uri"
            className="sync-config-textarea"
            rows={3}
            value={setupUri}
            onChange={(e) => {
              setSetupUri(e.target.value)
              if (errors.setupUri) setErrors((prev) => ({ ...prev, setupUri: null }))
            }}
            placeholder={t('sync.setupUriPlaceholder')}
            aria-invalid={errors.setupUri !== null}
            aria-describedby={errors.setupUri ? 'sync-uri-error' : undefined}
          />
          {errors.setupUri && (
            <p id="sync-uri-error" className="sync-config-field-error" role="alert">
              {errors.setupUri}
            </p>
          )}
        </div>
        <div className="sync-config-field">
          <label className="sync-config-label" htmlFor="sync-uri-passphrase">
            {t('sync.setupUriPassphraseLabel')}
          </label>
          <input
            id="sync-uri-passphrase"
            className="sync-config-input"
            type="password"
            value={setupUriPassphrase}
            onChange={(e) => {
              setSetupUriPassphrase(e.target.value)
              if (errors.setupUriPassphrase) setErrors((prev) => ({ ...prev, setupUriPassphrase: null }))
            }}
            placeholder={t('sync.setupUriPassphrasePlaceholder')}
            aria-invalid={errors.setupUriPassphrase !== null}
            aria-describedby={errors.setupUriPassphrase ? 'sync-uri-pass-error' : undefined}
          />
          {errors.setupUriPassphrase && (
            <p id="sync-uri-pass-error" className="sync-config-field-error" role="alert">
              {errors.setupUriPassphrase}
            </p>
          )}
        </div>
      </>
    )
  }

  // --- Render: Manual config fields ---
  function renderManualFields(isEdit: boolean) {
    return (
      <>
        <div className="sync-config-field">
          <label className="sync-config-label" htmlFor="sync-endpoint">
            {t('sync.endpointLabel')}
          </label>
          <input
            id="sync-endpoint"
            className="sync-config-input"
            type="url"
            value={endpoint}
            onChange={(e) => {
              setEndpoint(e.target.value)
              if (errors.endpoint) setErrors((prev) => ({ ...prev, endpoint: null }))
            }}
            placeholder={t('sync.endpointPlaceholder')}
            aria-invalid={errors.endpoint !== null}
            aria-describedby={errors.endpoint ? 'sync-endpoint-error' : undefined}
          />
          {errors.endpoint && (
            <p id="sync-endpoint-error" className="sync-config-field-error" role="alert">
              {errors.endpoint}
            </p>
          )}
        </div>
        <div className="sync-config-field">
          <label className="sync-config-label" htmlFor="sync-database">
            {t('sync.databaseLabel')}
          </label>
          <input
            id="sync-database"
            className="sync-config-input"
            type="text"
            value={database}
            onChange={(e) => {
              setDatabase(e.target.value)
              if (errors.database) setErrors((prev) => ({ ...prev, database: null }))
            }}
            placeholder={t('sync.databasePlaceholder')}
            aria-invalid={errors.database !== null}
            aria-describedby={errors.database ? 'sync-database-error' : undefined}
          />
          {errors.database && (
            <p id="sync-database-error" className="sync-config-field-error" role="alert">
              {errors.database}
            </p>
          )}
        </div>
        <div className="sync-config-field">
          <label className="sync-config-label" htmlFor="sync-username">
            {t('sync.usernameLabel')}
          </label>
          <input
            id="sync-username"
            className="sync-config-input"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              if (errors.username) setErrors((prev) => ({ ...prev, username: null }))
            }}
            placeholder={t('sync.usernamePlaceholder')}
            aria-invalid={errors.username !== null}
            aria-describedby={errors.username ? 'sync-username-error' : undefined}
          />
          {errors.username && (
            <p id="sync-username-error" className="sync-config-field-error" role="alert">
              {errors.username}
            </p>
          )}
        </div>
        <div className="sync-config-field">
          <label className="sync-config-label" htmlFor="sync-password">
            {t('sync.passwordLabel')}
          </label>
          <input
            id="sync-password"
            className="sync-config-input"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (errors.password) setErrors((prev) => ({ ...prev, password: null }))
            }}
            placeholder={t('sync.passwordPlaceholder')}
            aria-invalid={errors.password !== null}
            aria-describedby={errors.password ? 'sync-password-error' : isEdit ? 'sync-password-hint' : undefined}
          />
          {isEdit && (
            <span id="sync-password-hint" className="sync-config-hint">
              {t('sync.passwordChangeHint')}
            </span>
          )}
          {errors.password && (
            <p id="sync-password-error" className="sync-config-field-error" role="alert">
              {errors.password}
            </p>
          )}
        </div>
      </>
    )
  }

  // --- Render: Edit form ---
  function renderEditForm() {
    return (
      <section className="sync-config-section" aria-labelledby="sync-edit-heading">
        <h2 id="sync-edit-heading" className="sync-config-section-title">
          <Settings size={16} />
          {t('sync.configTitle')}
        </h2>

        <form className="sync-config-form" onSubmit={handleUpdate} noValidate>
          {renderManualFields(true)}
          {renderCommonFields()}

          {state.error && (
            <p className="sync-config-error" role="alert">{state.error}</p>
          )}

          {renderConnectionTest(connectionTest)}

          <div className="sync-config-actions">
            <button
              type="submit"
              className="sync-config-submit"
              disabled={pending || state.isLoading}
            >
              {pending ? t('sync.updating') : t('sync.updateConfig')}
            </button>
            <button
              type="button"
              className="sync-config-btn-secondary"
              onClick={cancelEdit}
              disabled={pending}
            >
              {t('sync.cancelEdit')}
            </button>
          </div>
        </form>
      </section>
    )
  }

  // --- Render: Config view (read-only) ---
  function renderConfigView() {
    const config = state.config
    if (!config) return null

    return (
      <section className="sync-config-section" aria-labelledby="sync-view-heading">
        <h2 id="sync-view-heading" className="sync-config-section-title">
          <Settings size={16} />
          {t('sync.currentConfig')}
        </h2>

        <div className="sync-config-status-badge-container">
          <span className={`sync-config-status-badge ${config.status === 'active' ? 'sync-config-status-badge--active' : 'sync-config-status-badge--disabled'}`}>
            {config.status === 'active' ? t('sync.statusActive') : t('sync.statusDisabled')}
          </span>
        </div>

        <div className="sync-config-details">
          <div className="sync-config-detail-row">
            <span className="sync-config-detail-label">{t('sync.endpointLabel')}</span>
            <span className="sync-config-detail-value">{config.endpoint}</span>
          </div>
          <div className="sync-config-detail-row">
            <span className="sync-config-detail-label">{t('sync.databaseLabel')}</span>
            <span className="sync-config-detail-value">{config.database}</span>
          </div>
          <div className="sync-config-detail-row">
            <span className="sync-config-detail-label">{t('sync.usernameLabel')}</span>
            <span className="sync-config-detail-value">{config.username}</span>
          </div>
          <div className="sync-config-detail-row">
            <span className="sync-config-detail-label">{t('sync.maskedPassword')}</span>
            <span className="sync-config-detail-value sync-config-detail-value--mono">
              {config.passwordMasked}
            </span>
          </div>
          <div className="sync-config-detail-row">
            <span className="sync-config-detail-label">{t('sync.modeLabel')}</span>
            <span className="sync-config-detail-value">
              {config.mode === 'bidirectional' ? t('sync.modeBidirectional') : t('sync.modeReadonly')}
            </span>
          </div>
          <div className="sync-config-detail-row">
            <span className="sync-config-detail-label">{t('sync.triggerLabel')}</span>
            <span className="sync-config-detail-value">
              {config.trigger === 'manual' ? t('sync.triggerManual') : `${t('sync.triggerInterval')} (${config.intervalMinutes} min)`}
            </span>
          </div>
          <div className="sync-config-detail-row">
            <span className="sync-config-detail-label">{t('sync.e2eLabel')}</span>
            <span className="sync-config-detail-value">
              <Shield size={14} />
              {config.e2eEnabled ? t('sync.e2eEnabled') : t('sync.e2eDisabled')}
            </span>
          </div>
          <div className="sync-config-detail-row">
            <span className="sync-config-detail-label">{t('sync.createdAt')}</span>
            <span className="sync-config-detail-value">
              {new Date(config.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="sync-config-detail-row">
            <span className="sync-config-detail-label">{t('sync.updatedAt')}</span>
            <span className="sync-config-detail-value">
              {new Date(config.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>

        {state.error && (
          <p className="sync-config-error" role="alert">{state.error}</p>
        )}

        <div className="sync-config-actions">
          <button
            type="button"
            className="sync-config-submit"
            onClick={enterEditMode}
            disabled={pending}
          >
            {t('sync.editConfig')}
          </button>
          {config.status === 'active' ? (
            <button
              type="button"
              className="sync-config-btn-secondary"
              onClick={handleDisable}
              disabled={pending}
            >
              {t('sync.disableSync')}
            </button>
          ) : (
            <button
              type="button"
              className="sync-config-btn-secondary"
              onClick={handleEnable}
              disabled={pending}
            >
              {t('sync.enableSync')}
            </button>
          )}
          <button
            type="button"
            className="sync-config-btn-danger"
            onClick={() => setShowRemoveConfirm(true)}
            disabled={pending}
          >
            {t('sync.removeSync')}
          </button>
        </div>
      </section>
    )
  }

  // --- Main render ---
  return (
    <div className="sync-config-page">
      <h1 className="sync-config-page-title">
        <RefreshCw size={20} />
        {t('sync.title')}
        <span className="sync-config-vault-name">{vaultName}</span>
      </h1>

      {/* Experimental warning banner */}
      <div className="sync-config-warning" role="alert">
        <Shield size={16} />
        <div>
          <strong>{t('sync.warningTitle')}</strong>
          <p>{t('sync.warningMessage')}</p>
        </div>
      </div>

      {viewMode === 'create' && renderCreateForm()}
      {viewMode === 'edit' && renderEditForm()}
      {viewMode === 'view' && state.config && renderConfigView()}
      {viewMode === 'view' && state.config && (
        <SyncStatusPanel vaultId={vaultId} onOpenFullLog={onOpenSyncLog} />
      )}

      <ConfirmModal
        open={showRemoveConfirm}
        title={t('sync.removeConfirmTitle')}
        message={t('sync.removeConfirmMessage')}
        variant="danger"
        onConfirm={handleRemove}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </div>
  )
}
