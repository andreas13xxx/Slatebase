import { useEffect, useState } from 'react'
import { RefreshCw, Search, AlertTriangle, CheckCircle, XCircle, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useSyncContext } from '../state/syncContext'
import { useAppContext } from '../state'
import { loadSyncLog, loadConflicts, triggerSync, triggerAnalysis } from '../state/syncActions'

/**
 * Props for the SyncStatusPanel component.
 */
export interface SyncStatusPanelProps {
  vaultId: string
}

/** Number of log entries per page. */
const LOG_PAGE_SIZE = 10

/**
 * Panel showing sync status, action buttons, and a paginated sync log.
 * Displays sync state, last sync time, conflict count, and full log history.
 */
export function SyncStatusPanel({ vaultId }: SyncStatusPanelProps) {
  const { state, dispatch } = useSyncContext()
  const { apiClient } = useAppContext()
  const [logPage, setLogPage] = useState(1)

  useEffect(() => {
    if (apiClient) {
      loadSyncLog(dispatch, apiClient, vaultId, logPage, LOG_PAGE_SIZE)
      loadConflicts(dispatch, apiClient, vaultId)
    }
  }, [dispatch, apiClient, vaultId, logPage])

  const isActive = state.config?.status === 'active'
  const conflictCount = state.conflicts.length
  const logItems = state.log?.items ?? []
  const logTotal = state.log?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(logTotal / LOG_PAGE_SIZE))

  function handleTriggerSync() {
    if (apiClient && !state.isSyncing) {
      triggerSync(dispatch, apiClient, vaultId).then(() => {
        if (apiClient) {
          loadSyncLog(dispatch, apiClient, vaultId, 1, LOG_PAGE_SIZE)
          loadConflicts(dispatch, apiClient, vaultId)
          setLogPage(1)
        }
      })
    }
  }

  function handleTriggerAnalysis() {
    if (apiClient && !state.isAnalyzing) {
      triggerAnalysis(dispatch, apiClient, vaultId)
    }
  }

  function handleRefreshLog() {
    if (apiClient) {
      loadSyncLog(dispatch, apiClient, vaultId, logPage, LOG_PAGE_SIZE)
      loadConflicts(dispatch, apiClient, vaultId)
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
      second: '2-digit',
    })
  }

  function formatDuration(ms?: number): string {
    if (ms === undefined) return '–'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  function statusIcon(status: string) {
    switch (status) {
      case 'success':
        return <CheckCircle size={14} className="sync-log-icon sync-log-icon--success" />
      case 'partial_success':
        return <AlertTriangle size={14} className="sync-log-icon sync-log-icon--warning" />
      case 'started':
        return <RefreshCw size={14} className="sync-log-icon sync-log-icon--info" />
      default:
        return <XCircle size={14} className="sync-log-icon sync-log-icon--error" />
    }
  }

  function statusLabel(status: string): string {
    switch (status) {
      case 'success': return 'Erfolgreich'
      case 'partial_success': return 'Teilweise'
      case 'started': return 'Gestartet'
      case 'failed': return 'Fehlgeschlagen'
      case 'connection_failed': return 'Verbindungsfehler'
      case 'auth_failed': return 'Auth-Fehler'
      default: return status
    }
  }

  return (
    <div className="sync-status-panel">
      {/* ── Header with actions ── */}
      <div className="sync-status-panel-header">
        <span className="sync-status-panel-title">Synchronisation</span>
        <span className={`sync-status-panel-badge ${isActive ? 'sync-status-panel-badge--active' : 'sync-status-panel-badge--disabled'}`}>
          {isActive ? 'Aktiv' : 'Deaktiviert'}
        </span>
      </div>

      {/* ── Conflicts warning ── */}
      {conflictCount > 0 && (
        <div className="sync-status-panel-conflicts">
          <AlertTriangle size={14} className="sync-log-icon sync-log-icon--warning" />
          <span>{conflictCount} offene{conflictCount === 1 ? 'r' : ''} Konflikt{conflictCount !== 1 ? 'e' : ''}</span>
        </div>
      )}

      {/* ── Action buttons ── */}
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
          title="Analyse starten (nur lesen, nichts schreiben)"
        >
          <Search size={14} className={state.isAnalyzing ? 'sync-status-panel-spinner' : ''} />
          <span>{state.isAnalyzing ? 'Analysiere…' : 'Analyse'}</span>
        </button>
      </div>

      {/* ── Sync Result (after manual sync) ── */}
      {state.syncResult && (
        <div className={`sync-result-box sync-result-box--${state.syncResult.status === 'success' ? 'success' : 'error'}`}>
          <div className="sync-result-header">
            {state.syncResult.status === 'success' ? (
              <CheckCircle size={14} className="sync-log-icon sync-log-icon--success" />
            ) : (
              <XCircle size={14} className="sync-log-icon sync-log-icon--error" />
            )}
            <span className="sync-result-title">
              {state.syncResult.status === 'success' ? 'Sync erfolgreich' : 'Sync fehlgeschlagen'}
            </span>
            <span className="sync-result-duration">{formatDuration(state.syncResult.durationMs)}</span>
          </div>
          <div className="sync-result-stats">
            <span>↓ {state.syncResult.pulledCount} empfangen</span>
            <span>↑ {state.syncResult.pushedCount} gesendet</span>
            {state.syncResult.conflictsDetected > 0 && (
              <span className="sync-result-conflicts">⚠ {state.syncResult.conflictsDetected} Konflikte</span>
            )}
          </div>
          {state.syncResult.errors.length > 0 && (
            <div className="sync-log-entry-errors">
              {state.syncResult.errors.slice(0, 3).map((err, i) => (
                <span key={i} className="sync-log-entry-error">{err.documentPath}: {err.description}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Analysis Result ── */}
      {state.analysisResult && (
        <div className="sync-analysis-box">
          <div className="sync-analysis-box-header">
            <Search size={14} />
            <span className="sync-analysis-box-title">Analyse-Ergebnis</span>
            <span className="sync-result-duration">{formatDuration(state.analysisResult.durationMs)}</span>
          </div>
          <div className="sync-analysis-summary">
            {state.analysisResult.summary.remote_newer.count > 0 && (
              <span className="sync-analysis-category">↓ {state.analysisResult.summary.remote_newer.count} Remote neuer</span>
            )}
            {state.analysisResult.summary.local_newer.count > 0 && (
              <span className="sync-analysis-category">↑ {state.analysisResult.summary.local_newer.count} Lokal neuer</span>
            )}
            {state.analysisResult.summary.remote_only.count > 0 && (
              <span className="sync-analysis-category">+ {state.analysisResult.summary.remote_only.count} Nur remote</span>
            )}
            {state.analysisResult.summary.local_only.count > 0 && (
              <span className="sync-analysis-category">+ {state.analysisResult.summary.local_only.count} Nur lokal</span>
            )}
            {state.analysisResult.summary.conflict.count > 0 && (
              <span className="sync-analysis-category sync-analysis-category--conflict">⚠ {state.analysisResult.summary.conflict.count} Konflikte</span>
            )}
            {state.analysisResult.summary.identical.count > 0 && (
              <span className="sync-analysis-category sync-analysis-category--ok">✓ {state.analysisResult.summary.identical.count} Identisch</span>
            )}
            {Object.values(state.analysisResult.summary).every(c => c.count === 0) && (
              <span className="sync-analysis-category sync-analysis-category--ok">Keine Unterschiede gefunden.</span>
            )}
          </div>
          {state.analysisResult.details.length > 0 && (
            <details className="sync-analysis-details-toggle">
              <summary>Details ({state.analysisResult.details.length} Dateien)</summary>
              <div className="sync-analysis-detail-list">
                {state.analysisResult.details.slice(0, 50).map((d, i) => (
                  <div key={i} className="sync-analysis-detail-item">
                    <span className={`sync-analysis-detail-cat sync-analysis-detail-cat--${d.category}`}>
                      {d.category === 'remote_newer' ? '↓' : d.category === 'local_newer' ? '↑' : d.category === 'conflict' ? '⚠' : d.category === 'remote_only' ? '+R' : d.category === 'local_only' ? '+L' : '='}
                    </span>
                    <span className="sync-analysis-detail-path">{d.path}</span>
                  </div>
                ))}
                {state.analysisResult.details.length > 50 && (
                  <div className="sync-analysis-detail-item">…und {state.analysisResult.details.length - 50} weitere</div>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Error display ── */}
      {state.error && (
        <div className="sync-status-panel-error-box">
          <AlertTriangle size={14} className="sync-log-icon sync-log-icon--error" />
          <span>{state.error}</span>
        </div>
      )}

      {/* ── Sync Log ── */}
      <div className="sync-log-section">
        <div className="sync-log-header">
          <h3 className="sync-log-title">
            <Clock size={14} />
            Sync-Protokoll
          </h3>
          <button
            className="sync-log-refresh-btn"
            onClick={handleRefreshLog}
            title="Protokoll aktualisieren"
            aria-label="Protokoll aktualisieren"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {logItems.length === 0 ? (
          <p className="sync-log-empty">Noch keine Sync-Einträge vorhanden.</p>
        ) : (
          <>
            <div className="sync-log-list">
              {logItems.map((entry) => (
                <div key={entry.id} className="sync-log-entry">
                  <div className="sync-log-entry-header">
                    {statusIcon(entry.status)}
                    <span className="sync-log-entry-status">{statusLabel(entry.status)}</span>
                    <span className="sync-log-entry-time">{formatTimestamp(entry.timestamp)}</span>
                  </div>
                  <div className="sync-log-entry-details">
                    <span className="sync-log-entry-detail">
                      {entry.triggerType === 'manual' ? 'Manuell' : 'Intervall'}
                    </span>
                    <span className="sync-log-entry-detail">
                      {entry.mode === 'bidirectional' ? 'Bidirektional' : 'Nur lesen'}
                    </span>
                    {entry.pulledCount !== undefined && (
                      <span className="sync-log-entry-detail">↓ {entry.pulledCount}</span>
                    )}
                    {entry.pushedCount !== undefined && (
                      <span className="sync-log-entry-detail">↑ {entry.pushedCount}</span>
                    )}
                    <span className="sync-log-entry-detail">{formatDuration(entry.durationMs)}</span>
                  </div>
                  {entry.errors && entry.errors.length > 0 && (
                    <div className="sync-log-entry-errors">
                      {entry.errors.slice(0, 3).map((err, i) => (
                        <span key={i} className="sync-log-entry-error">{err.documentPath}: {err.description}</span>
                      ))}
                      {entry.errors.length > 3 && (
                        <span className="sync-log-entry-error">…und {entry.errors.length - 3} weitere</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="sync-log-pagination">
                <button
                  className="sync-log-page-btn"
                  onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                  disabled={logPage <= 1}
                  aria-label="Vorherige Seite"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="sync-log-page-info">
                  {logPage} / {totalPages}
                </span>
                <button
                  className="sync-log-page-btn"
                  onClick={() => setLogPage((p) => Math.min(totalPages, p + 1))}
                  disabled={logPage >= totalPages}
                  aria-label="Nächste Seite"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
