import { useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useSyncContext } from '../state/syncContext'
import { useAppContext } from '../state'
import { loadSyncLog, loadConflicts } from '../state/syncActions'

/**
 * Props for the SyncLogPage component.
 */
export interface SyncLogPageProps {
  vaultId: string
}

/** Number of log entries per page. */
const LOG_PAGE_SIZE = 20

/**
 * Standalone page showing the paginated sync log for a vault.
 * Can be opened as its own tab from the toolbar or from the sync config page.
 */
export function SyncLogPage({ vaultId }: SyncLogPageProps) {
  const { state, dispatch } = useSyncContext()
  const { apiClient } = useAppContext()
  const [logPage, setLogPage] = useState(1)

  useEffect(() => {
    if (apiClient) {
      loadSyncLog(dispatch, apiClient, vaultId, logPage, LOG_PAGE_SIZE)
      loadConflicts(dispatch, apiClient, vaultId)
    }
  }, [dispatch, apiClient, vaultId, logPage])

  const conflictCount = state.conflicts.length
  const logItems = state.log?.items ?? []
  const logTotal = state.log?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(logTotal / LOG_PAGE_SIZE))

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
    <div className="sync-log-page">
      {/* ── Header ── */}
      <div className="sync-log-page-header">
        <h2 className="sync-log-page-title">
          <Clock size={16} />
          Sync-Protokoll
        </h2>
        <div className="sync-log-page-meta">
          <span className="sync-log-page-total">{logTotal} Einträge</span>
          <button
            className="sync-log-refresh-btn"
            onClick={handleRefreshLog}
            title="Protokoll aktualisieren"
            aria-label="Protokoll aktualisieren"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ── Conflicts warning ── */}
      {conflictCount > 0 && (
        <div className="sync-status-panel-conflicts">
          <AlertTriangle size={14} className="sync-log-icon sync-log-icon--warning" />
          <span>{conflictCount} offene{conflictCount === 1 ? 'r' : ''} Konflikt{conflictCount !== 1 ? 'e' : ''}</span>
        </div>
      )}

      {/* ── Log entries ── */}
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
                    {entry.errors.slice(0, 5).map((err, i) => (
                      <span key={i} className="sync-log-entry-error">{err.documentPath}: {err.description}</span>
                    ))}
                    {entry.errors.length > 5 && (
                      <span className="sync-log-entry-error">…und {entry.errors.length - 5} weitere</span>
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
  )
}
