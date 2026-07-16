import { useEffect } from 'react'
import { RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { useSyncContext } from '../state/syncContext'
import { useAppContext } from '../state'
import { loadSyncLog, loadConflicts, triggerSync, loadSyncConfig } from '../state/syncActions'
import { ConflictWizard } from './conflict-wizard'
import { useTranslation } from '../i18n'
import './ConflictWizardPage.css'

/** Props for the ConflictWizardPage component. */
export interface ConflictWizardPageProps {
  vaultId: string
}

/** Number of log entries to fetch for last sync display. */
const LOG_PAGE_SIZE = 1

/**
 * Standalone page for sync status and conflict resolution.
 * Shows last sync result, manual sync trigger, and the full ConflictWizard.
 */
export function ConflictWizardPage({ vaultId }: ConflictWizardPageProps) {
  const { t } = useTranslation()
  const { state, dispatch } = useSyncContext()
  const { apiClient, dispatch: appDispatch } = useAppContext()
  useEffect(() => {
    if (!apiClient) return
    loadSyncConfig(dispatch, apiClient, vaultId)
    loadSyncLog(dispatch, apiClient, vaultId, 1, LOG_PAGE_SIZE)
    loadConflicts(dispatch, apiClient, vaultId)
  }, [dispatch, apiClient, vaultId])

  // Track whether data has been loaded at least once
  const hasLoaded = state.log !== null || state.config !== null

  const isActive = state.config?.status === 'active'
  const conflictCount = state.conflicts.length
  const lastLogEntry = state.log?.items?.[0] ?? null

  function handleTriggerSync() {
    if (!apiClient || state.isSyncing) return
    triggerSync(dispatch, apiClient, vaultId).then(() => {
      if (apiClient) {
        loadSyncLog(dispatch, apiClient, vaultId, 1, LOG_PAGE_SIZE)
        loadConflicts(dispatch, apiClient, vaultId)
        apiClient.fetchVaultTree(vaultId).then((tree) => {
          appDispatch({ type: 'TREE_LOADED', payload: tree })
        }).catch(() => { /* best-effort */ })
      }
    })
  }

  function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  function formatDuration(ms?: number): string {
    if (ms === undefined) return '–'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div className="conflict-wizard-page">
      {/* ── Sync Status Header ── */}
      <div className="conflict-wizard-page__status">
        <div className="conflict-wizard-page__status-row">
          <span className="conflict-wizard-page__status-label">{t('sync.status')}</span>
          <span className={`conflict-wizard-page__badge ${isActive ? 'conflict-wizard-page__badge--active' : 'conflict-wizard-page__badge--disabled'}`}>
            {isActive ? t('sync.active') : t('sync.disabled')}
          </span>
          {conflictCount > 0 && (
            <span className="conflict-wizard-page__badge conflict-wizard-page__badge--warning">
              <AlertTriangle size={12} />
              {conflictCount} {conflictCount === 1 ? 'Konflikt' : 'Konflikte'}
            </span>
          )}
        </div>

        {/* Last sync result */}
        {state.syncResult && (
          <div className={`conflict-wizard-page__last-sync conflict-wizard-page__last-sync--${state.syncResult.status === 'success' ? 'success' : 'error'}`}>
            {state.syncResult.status === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
            <span>
              {state.syncResult.status === 'success' ? t('sync.resultSuccess') : t('sync.resultFailed')}
              {' — '}
              ↓{state.syncResult.pulledCount} ↑{state.syncResult.pushedCount}
              {state.syncResult.durationMs !== undefined && ` (${formatDuration(state.syncResult.durationMs)})`}
            </span>
          </div>
        )}

        {/* Fallback: last log entry when no syncResult yet */}
        {!state.syncResult && lastLogEntry && hasLoaded && (
          <div className={`conflict-wizard-page__last-sync conflict-wizard-page__last-sync--${lastLogEntry.status === 'success' ? 'success' : 'error'}`}>
            {lastLogEntry.status === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
            <span>
              {formatTimestamp(lastLogEntry.timestamp)}
              {' — '}
              ↓{lastLogEntry.pulledCount ?? 0} ↑{lastLogEntry.pushedCount ?? 0}
            </span>
          </div>
        )}

        {/* Sync button */}
        <button
          className="conflict-wizard-page__sync-btn"
          onClick={handleTriggerSync}
          disabled={state.isSyncing || !isActive}
          title={t('sync.triggerManual')}
        >
          <RefreshCw size={14} className={state.isSyncing ? 'conflict-wizard-page__spinner' : ''} />
          <span>{state.isSyncing ? t('sync.syncing') : t('sync.triggerSync')}</span>
        </button>
      </div>

      {/* ── Conflict Wizard ── */}
      <ConflictWizard vaultId={vaultId} />
    </div>
  )
}
