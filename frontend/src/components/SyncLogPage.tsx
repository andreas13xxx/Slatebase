import { useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, ChevronLeft, ChevronRight, Clock, ArrowDown, ArrowUp, Activity } from 'lucide-react'
import { useSyncContext } from '../state/syncContext'
import { useAppContext } from '../state'
import { loadSyncLog, loadConflicts } from '../state/syncActions'
import { SyncProtocolView } from './SyncProtocolView'
import type { SyncLogEntry } from '../state/syncState'

/**
 * Props for the SyncLogPage component.
 */
export interface SyncLogPageProps {
  vaultId: string
}

/** Number of log entries per page. */
const LOG_PAGE_SIZE = 20

/** Formats a relative time string from an ISO date. */
function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Gerade eben'
  if (diffMin < 60) return `Vor ${diffMin} Min.`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `Vor ${diffHours} Std.`
  const diffDays = Math.floor(diffHours / 24)
  return `Vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`
}

/**
 * Standalone page showing the paginated sync log for a vault.
 * Displays a summary section with statistics and a detailed log history.
 */
export function SyncLogPage({ vaultId }: SyncLogPageProps) {
  const { state, dispatch } = useSyncContext()
  const { apiClient } = useAppContext()
  const [logPage, setLogPage] = useState(1)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'overview' | 'protocol'>('protocol')

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

  // Compute summary statistics from current page items
  const lastSuccessful = logItems.find(e => e.status === 'success' || e.status === 'partial_success')
  const lastFailed = logItems.find(e => e.status === 'failed' || e.status === 'connection_failed' || e.status === 'auth_failed')
  const totalPulled = logItems.reduce((sum, e) => sum + (e.pulledCount ?? 0), 0)
  const totalPushed = logItems.reduce((sum, e) => sum + (e.pushedCount ?? 0), 0)
  const successCount = logItems.filter(e => e.status === 'success').length
  const failureCount = logItems.filter(e => e.status === 'failed' || e.status === 'connection_failed' || e.status === 'auth_failed').length

  function handleRefreshLog() {
    if (apiClient) {
      loadSyncLog(dispatch, apiClient, vaultId, logPage, LOG_PAGE_SIZE)
      loadConflicts(dispatch, apiClient, vaultId)
    }
  }

  function toggleEntry(id: string) {
    setExpandedEntries(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
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
      case 'partial_success': return 'Teilweise erfolgreich'
      case 'started': return 'Läuft…'
      case 'failed': return 'Fehlgeschlagen'
      case 'connection_failed': return 'Verbindungsfehler'
      case 'auth_failed': return 'Authentifizierung fehlgeschlagen'
      default: return status
    }
  }

  function statusDescription(entry: SyncLogEntry): string {
    const parts: string[] = []

    if (entry.status === 'success') {
      if ((entry.pulledCount ?? 0) === 0 && (entry.pushedCount ?? 0) === 0) {
        parts.push('Keine Änderungen')
      } else {
        if (entry.pulledCount && entry.pulledCount > 0) {
          parts.push(`${entry.pulledCount} Datei${entry.pulledCount > 1 ? 'en' : ''} empfangen`)
        }
        if (entry.pushedCount && entry.pushedCount > 0) {
          parts.push(`${entry.pushedCount} Datei${entry.pushedCount > 1 ? 'en' : ''} gesendet`)
        }
      }
    } else if (entry.status === 'partial_success') {
      parts.push('Teilweise synchronisiert')
      if (entry.errors && entry.errors.length > 0) {
        parts.push(`${entry.errors.length} Fehler`)
      }
    } else if (entry.status === 'connection_failed') {
      parts.push('CouchDB-Server nicht erreichbar')
    } else if (entry.status === 'auth_failed') {
      parts.push('Zugangsdaten ungültig')
    } else if (entry.status === 'failed') {
      if (entry.errors && entry.errors.length > 0) {
        parts.push(entry.errors[0]?.description ?? 'Unbekannter Fehler')
      } else {
        parts.push('Synchronisation fehlgeschlagen')
      }
    }

    return parts.join(' · ')
  }

  return (
    <div className="sync-log-page">
      {/* ── Header ── */}
      <div className="sync-log-page-header">
        <h2 className="sync-log-page-title">
          <Clock size={18} />
          Sync-Protokoll
        </h2>
        <button
          className="sync-log-refresh-btn"
          onClick={handleRefreshLog}
          title="Aktualisieren"
          aria-label="Protokoll aktualisieren"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="sync-log-page-tabs">
        <button
          className={`sync-log-page-tab ${activeTab === 'protocol' ? 'sync-log-page-tab--active' : ''}`}
          onClick={() => setActiveTab('protocol')}
        >
          Protokoll
        </button>
        <button
          className={`sync-log-page-tab ${activeTab === 'overview' ? 'sync-log-page-tab--active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Übersicht
        </button>
      </div>

      {/* ── Protocol Tab ── */}
      {activeTab === 'protocol' && (
        <SyncProtocolView vaultId={vaultId} />
      )}

      {/* ── Overview Tab (existing content) ── */}
      {activeTab === 'overview' && (<>

      {/* ── Summary Cards ── */}
      <div className="sync-log-summary">
        <div className="sync-log-summary-card">
          <Activity size={14} className="sync-log-summary-icon" />
          <div className="sync-log-summary-content">
            <span className="sync-log-summary-value">{logTotal}</span>
            <span className="sync-log-summary-label">Gesamt</span>
          </div>
        </div>
        <div className="sync-log-summary-card sync-log-summary-card--success">
          <CheckCircle size={14} className="sync-log-icon sync-log-icon--success" />
          <div className="sync-log-summary-content">
            <span className="sync-log-summary-value">{successCount}</span>
            <span className="sync-log-summary-label">Erfolgreich</span>
          </div>
        </div>
        {failureCount > 0 && (
          <div className="sync-log-summary-card sync-log-summary-card--error">
            <XCircle size={14} className="sync-log-icon sync-log-icon--error" />
            <div className="sync-log-summary-content">
              <span className="sync-log-summary-value">{failureCount}</span>
              <span className="sync-log-summary-label">Fehler</span>
            </div>
          </div>
        )}
        <div className="sync-log-summary-card">
          <ArrowDown size={14} className="sync-log-summary-icon" />
          <div className="sync-log-summary-content">
            <span className="sync-log-summary-value">{totalPulled}</span>
            <span className="sync-log-summary-label">Empfangen</span>
          </div>
        </div>
        <div className="sync-log-summary-card">
          <ArrowUp size={14} className="sync-log-summary-icon" />
          <div className="sync-log-summary-content">
            <span className="sync-log-summary-value">{totalPushed}</span>
            <span className="sync-log-summary-label">Gesendet</span>
          </div>
        </div>
      </div>

      {/* ── Last sync info ── */}
      {lastSuccessful && (
        <div className="sync-log-last-sync">
          <CheckCircle size={13} className="sync-log-icon sync-log-icon--success" />
          <span>Letzter erfolgreicher Sync: <strong>{formatRelativeTime(lastSuccessful.timestamp)}</strong> ({formatTimestamp(lastSuccessful.timestamp)})</span>
        </div>
      )}
      {lastFailed && !lastSuccessful && (
        <div className="sync-log-last-sync sync-log-last-sync--error">
          <XCircle size={13} className="sync-log-icon sync-log-icon--error" />
          <span>Letzter Versuch fehlgeschlagen: <strong>{formatRelativeTime(lastFailed.timestamp)}</strong></span>
        </div>
      )}

      {/* ── Conflicts warning ── */}
      {conflictCount > 0 && (
        <div className="sync-status-panel-conflicts">
          <AlertTriangle size={14} className="sync-log-icon sync-log-icon--warning" />
          <span>{conflictCount} offene{conflictCount === 1 ? 'r' : ''} Konflikt{conflictCount !== 1 ? 'e' : ''} — Lösung über Sync-Konfiguration</span>
        </div>
      )}

      {/* ── Log entries ── */}
      {logItems.length === 0 ? (
        <p className="sync-log-empty">Noch keine Sync-Vorgänge aufgezeichnet.</p>
      ) : (
        <>
          <div className="sync-log-list sync-log-list--detailed">
            {logItems.map((entry) => {
              const isExpanded = expandedEntries.has(entry.id)
              const hasErrors = entry.errors && entry.errors.length > 0

              return (
                <div
                  key={entry.id}
                  className={`sync-log-entry sync-log-entry--${entry.status}${isExpanded ? ' sync-log-entry--expanded' : ''}`}
                  onClick={() => hasErrors ? toggleEntry(entry.id) : undefined}
                  role={hasErrors ? 'button' : undefined}
                  tabIndex={hasErrors ? 0 : undefined}
                  aria-expanded={hasErrors ? isExpanded : undefined}
                  onKeyDown={(e) => {
                    if (hasErrors && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      toggleEntry(entry.id)
                    }
                  }}
                >
                  <div className="sync-log-entry-header">
                    <div className="sync-log-entry-left">
                      {statusIcon(entry.status)}
                      <span className="sync-log-entry-status">{statusLabel(entry.status)}</span>
                    </div>
                    <div className="sync-log-entry-right">
                      <span className="sync-log-entry-time" title={formatTimestamp(entry.timestamp)}>
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </div>
                  </div>

                  <div className="sync-log-entry-description">
                    {statusDescription(entry)}
                  </div>

                  <div className="sync-log-entry-meta">
                    <span className="sync-log-entry-tag">
                      {entry.triggerType === 'manual' ? '⚡ Manuell' : '⏱ Intervall'}
                    </span>
                    <span className="sync-log-entry-tag">
                      {entry.mode === 'bidirectional' ? '↔ Bidirektional' : '→ Nur lesen'}
                    </span>
                    {entry.pulledCount !== undefined && entry.pulledCount > 0 && (
                      <span className="sync-log-entry-tag sync-log-entry-tag--pull">
                        ↓ {entry.pulledCount}
                      </span>
                    )}
                    {entry.pushedCount !== undefined && entry.pushedCount > 0 && (
                      <span className="sync-log-entry-tag sync-log-entry-tag--push">
                        ↑ {entry.pushedCount}
                      </span>
                    )}
                    <span className="sync-log-entry-tag sync-log-entry-tag--duration">
                      {formatDuration(entry.durationMs)}
                    </span>
                    {hasErrors && (
                      <span className="sync-log-entry-tag sync-log-entry-tag--errors">
                        ⚠ {entry.errors!.length} Fehler
                      </span>
                    )}
                  </div>

                  {/* Expanded error details */}
                  {isExpanded && hasErrors && (
                    <div className="sync-log-entry-errors sync-log-entry-errors--expanded">
                      {entry.errors!.map((err, i) => (
                        <div key={i} className="sync-log-error-row">
                          <span className="sync-log-error-path">{err.documentPath || '(global)'}</span>
                          <span className="sync-log-error-type">{err.errorType.replace(/_/g, ' ')}</span>
                          <span className="sync-log-error-desc">{err.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
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
                Seite {logPage} von {totalPages}
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

      </>)}
    </div>
  )
}
