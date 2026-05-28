import { useEffect } from 'react'
import { RefreshCw, Search, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { useSyncContext } from '../state/syncContext'
import { useAppContext } from '../state'
import { loadSyncLog, loadConflicts, triggerSync, triggerAnalysis } from '../state/syncActions'

/**
 * Props for the SyncStatusPanel component.
 */
export interface SyncStatusPanelProps {
  vaultId: string
}

/**
 * Compact panel showing the current sync status.
 * Displays sync state, last sync time, conflict count, and action buttons.
 */
export function SyncStatusPanel({ vaultId }: SyncStatusPanelProps) {
  const { state, dispatch } = useSyncContext()
  const { apiClient } = useAppContext()

  useEffect(() => {
    if (apiClient) {
      loadSyncLog(dispatch, apiClient, vaultId, 1, 1)
      loadConflicts(dispatch, apiClient, vaultId)
    }
  }, [dispatch, apiClient, vaultId])

  const isActive = state.config?.status === 'active'
  const lastLogEntry = state.log?.items[0]
  const conflictCount = state.conflicts.length
  const lastSyncFailed = lastLogEntry?.status === 'failed' || lastLogEntry?.status === 'connection_failed' || lastLogEntry?.status === 'auth_failed'

  function handleTriggerSync() {
    if (apiClient && !state.isSyncing) {
      triggerSync(dispatch, apiClient, vaultId)
    }
  }

  function handleTriggerAnalysis() {
    if (apiClient && !state.isAnalyzing) {
      triggerAnalysis(dispatch, apiClient, vaultId)
    }
  }

  function formatTimestamp(iso: string): string {
    const date = new Date(iso)
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="sync-status-panel">
      <div className="sync-status-panel-header">
        <span className="sync-status-panel-title">Synchronisation</span>
        <span className={`sync-status-panel-badge ${isActive ? 'sync-status-panel-badge--active' : 'sync-status-panel-badge--disabled'}`}>
          {isActive ? 'Aktiv' : 'Deaktiviert'}
        </span>
      </div>

      <div className="sync-status-panel-body">
        {lastLogEntry && (
          <div className="sync-status-panel-info">
            <div className="sync-status-panel-info-row">
              {lastSyncFailed ? (
                <XCircle size={14} className="sync-status-panel-icon sync-status-panel-icon--error" />
              ) : (
                <CheckCircle size={14} className="sync-status-panel-icon sync-status-panel-icon--success" />
              )}
              <span className="sync-status-panel-info-label">Letzte Sync:</span>
              <span className="sync-status-panel-info-value">
                {formatTimestamp(lastLogEntry.timestamp)}
              </span>
            </div>
            {lastSyncFailed && state.error && (
              <div className="sync-status-panel-error">
                <AlertTriangle size={12} />
                <span>{state.error}</span>
              </div>
            )}
          </div>
        )}

        {conflictCount > 0 && (
          <div className="sync-status-panel-conflicts">
            <AlertTriangle size={14} className="sync-status-panel-icon sync-status-panel-icon--warning" />
            <span>{conflictCount} offene{conflictCount === 1 ? 'r' : ''} Konflikt{conflictCount !== 1 ? 'e' : ''}</span>
          </div>
        )}
      </div>

      <div className="sync-status-panel-actions">
        <button
          className="sync-status-panel-btn sync-status-panel-btn--sync"
          onClick={handleTriggerSync}
          disabled={state.isSyncing || !isActive}
          title="Manuelle Synchronisation starten"
        >
          <RefreshCw size={14} className={state.isSyncing ? 'sync-status-panel-spinner' : ''} />
          <span>{state.isSyncing ? 'Synchronisiere…' : 'Sync starten'}</span>
        </button>
        <button
          className="sync-status-panel-btn sync-status-panel-btn--analysis"
          onClick={handleTriggerAnalysis}
          disabled={state.isAnalyzing || !isActive}
          title="Analyse starten"
        >
          <Search size={14} className={state.isAnalyzing ? 'sync-status-panel-spinner' : ''} />
          <span>{state.isAnalyzing ? 'Analysiere…' : 'Analyse'}</span>
        </button>
      </div>
    </div>
  )
}
