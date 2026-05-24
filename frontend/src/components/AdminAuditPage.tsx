import { useState, useEffect, useCallback } from 'react'
import type { IApiClient } from '../api'

/**
 * All auditable actions in the system.
 * Mirrors the backend AuditAction type.
 */
export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'ROLE_CHANGED'
  | 'USER_CREATED'
  | 'USER_DELETED'
  | 'USER_SUSPENDED'
  | 'USER_UNSUSPENDED'
  | 'VAULT_SHARE_CREATED'
  | 'VAULT_SHARE_REVOKED'
  | 'VAULT_SHARE_UPDATED'
  | 'VAULT_OWNERSHIP_TRANSFERRED'
  | 'CONFIG_CHANGED'

/** All possible audit action values for the filter dropdown. */
const AUDIT_ACTIONS: AuditAction[] = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'ROLE_CHANGED',
  'USER_CREATED',
  'USER_DELETED',
  'USER_SUSPENDED',
  'USER_UNSUSPENDED',
  'VAULT_SHARE_CREATED',
  'VAULT_SHARE_REVOKED',
  'VAULT_SHARE_UPDATED',
  'VAULT_OWNERSHIP_TRANSFERRED',
  'CONFIG_CHANGED',
]

/** A single audit log entry returned by the API. */
export interface AuditEntry {
  timestamp: string
  userId: string | null
  action: AuditAction
  target: string
  ipAddress: string
  success: boolean
  details?: string
}

/** Paginated response from the audit API. */
interface AuditResponse {
  items: AuditEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Props for the AdminAuditPage component. */
export interface AdminAuditPageProps {
  /** API client instance for fetching audit log entries. */
  apiClient: IApiClient
}

/**
 * Admin audit log page component.
 * Displays paginated audit entries with filters for action type and date range.
 * Fetches data from GET /api/v1/admin/audit with query params.
 */
export function AdminAuditPage({ apiClient }: AdminAuditPageProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [actionFilter, setActionFilter] = useState<AuditAction | ''>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const pageSize = 50

  /**
   * Fetches audit entries from the backend with current filter and pagination state.
   */
  const fetchAuditEntries = useCallback(async (currentPage: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (actionFilter) {
        params.set('action', actionFilter)
      }
      if (startDate) {
        params.set('startDate', startDate)
      }
      if (endDate) {
        params.set('endDate', endDate)
      }
      params.set('page', String(currentPage))
      params.set('pageSize', String(pageSize))

      const url = `/api/v1/admin/audit?${params.toString()}`
      const response = await fetch(url, {
        headers: buildHeaders(apiClient),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: `Fehler ${response.status}` }))
        throw new Error((body as { message?: string }).message ?? `Fehler ${response.status}`)
      }

      const data = (await response.json()) as AuditResponse
      setEntries(data.items)
      setTotalPages(data.totalPages)
      setTotal(data.total)
      setPage(data.page)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Audit-Log konnte nicht geladen werden.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [apiClient, actionFilter, startDate, endDate])

  // Fetch on mount and when filters or page change
  useEffect(() => {
    void fetchAuditEntries(page)
  }, [fetchAuditEntries, page])

  /**
   * Resets to page 1 when filters change.
   */
  function handleFilterChange() {
    setPage(1)
  }

  return (
    <div className="admin-audit-page">
      <h1>Audit-Log</h1>

      <div className="audit-filters">
        <div className="audit-filter-field">
          <label htmlFor="audit-action-filter">Aktionstyp</label>
          <select
            id="audit-action-filter"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value as AuditAction | '')
              handleFilterChange()
            }}
          >
            <option value="">Alle</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>

        <div className="audit-filter-field">
          <label htmlFor="audit-start-date">Von</label>
          <input
            id="audit-start-date"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              handleFilterChange()
            }}
          />
        </div>

        <div className="audit-filter-field">
          <label htmlFor="audit-end-date">Bis</label>
          <input
            id="audit-end-date"
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              handleFilterChange()
            }}
          />
        </div>
      </div>

      {error && (
        <p className="audit-error" role="alert">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="audit-loading">Laden…</p>
      ) : (
        <>
          <p className="audit-summary">{total} Einträge</p>

          <div className="audit-table-container">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Benutzer-ID</th>
                  <th>Aktion</th>
                  <th>Ziel</th>
                  <th>IP-Adresse</th>
                  <th>Erfolg</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="audit-empty">
                      Keine Einträge gefunden.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, index) => (
                    <tr key={`${entry.timestamp}-${index}`}>
                      <td>{formatTimestamp(entry.timestamp)}</td>
                      <td>{entry.userId ?? '—'}</td>
                      <td>{entry.action}</td>
                      <td>{entry.target}</td>
                      <td>{entry.ipAddress}</td>
                      <td>{entry.success ? '✓' : '✗'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="audit-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Vorherige
            </button>
            <span className="audit-page-info">
              Seite {page} von {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Nächste
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Formats an ISO 8601 timestamp to a human-readable German locale string.
 */
function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

/**
 * Builds request headers including auth token from the API client.
 */
function buildHeaders(apiClient: IApiClient): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = apiClient.getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}
