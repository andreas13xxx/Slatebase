import { useState, useEffect, useCallback } from 'react'
import type { IApiClient } from '../api'
import { useTranslation } from '../i18n'

/** Log levels matching the backend. */
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** A single server log entry returned by the API. */
interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  meta?: Record<string, unknown>
}

/** Paginated response from the logs API. */
interface LogsResponse {
  items: LogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Props for the AdminLogsPage component. */
export interface AdminLogsPageProps {
  /** API client instance for fetching server log entries. */
  apiClient: IApiClient
}

/** All log level options for the filter dropdown. */
const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

/**
 * Admin server logs page component.
 * Displays paginated server log entries with filters for level, date range, and search.
 * Fetches data from GET /api/v1/admin/logs with query params.
 */
export function AdminLogsPage({ apiClient }: AdminLogsPageProps) {
  const { t, locale } = useTranslation()

  const [entries, setEntries] = useState<LogEntry[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [levelFilter, setLevelFilter] = useState<LogLevel | ''>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const pageSize = 50

  /**
   * Fetches log entries from the backend with current filter and pagination state.
   */
  const fetchLogEntries = useCallback(async (currentPage: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (levelFilter) params.set('level', levelFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (search) params.set('search', search)
      params.set('page', String(currentPage))
      params.set('pageSize', String(pageSize))

      const url = `/api/v1/admin/logs?${params.toString()}`
      const response = await fetch(url, {
        headers: buildHeaders(apiClient),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: t('admin.logs.errorStatus', { status: String(response.status) }) }))
        throw new Error((body as { message?: string }).message ?? t('admin.logs.errorStatus', { status: String(response.status) }))
      }

      const data = (await response.json()) as LogsResponse
      setEntries(data.items)
      setTotalPages(data.totalPages)
      setTotal(data.total)
      setPage(data.page)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError(t('admin.logs.loadError'))
      }
    } finally {
      setIsLoading(false)
    }
  }, [apiClient, levelFilter, startDate, endDate, search, t])

  // Fetch on mount and when filters or page change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLogEntries(page)
  }, [fetchLogEntries, page])

  /**
   * Resets to page 1 when filters change.
   */
  function handleFilterChange() {
    setPage(1)
  }

  /**
   * Handles search submission.
   */
  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
    handleFilterChange()
  }

  /**
   * Formats an ISO 8601 timestamp to a human-readable locale string.
   */
  function formatTimestamp(iso: string): string {
    try {
      return new Date(iso).toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', {
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
   * Returns a CSS class for the log level badge.
   */
  function getLevelClass(level: LogLevel): string {
    switch (level) {
      case 'error': return 'log-level--error'
      case 'warn': return 'log-level--warn'
      case 'info': return 'log-level--info'
      case 'debug': return 'log-level--debug'
    }
  }

  return (
    <div className="admin-logs-page">
      <h1>{t('admin.logs.title')}</h1>

      <div className="audit-filters">
        <div className="audit-filter-field">
          <label htmlFor="log-level-filter">{t('admin.logs.levelFilterLabel')}</label>
          <select
            id="log-level-filter"
            value={levelFilter}
            onChange={(e) => {
              setLevelFilter(e.target.value as LogLevel | '')
              handleFilterChange()
            }}
          >
            <option value="">{t('admin.logs.levelFilterAll')}</option>
            {LOG_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="audit-filter-field">
          <label htmlFor="log-start-date">{t('admin.logs.startDateLabel')}</label>
          <input
            id="log-start-date"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              handleFilterChange()
            }}
          />
        </div>

        <div className="audit-filter-field">
          <label htmlFor="log-end-date">{t('admin.logs.endDateLabel')}</label>
          <input
            id="log-end-date"
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              handleFilterChange()
            }}
          />
        </div>

        <form className="audit-filter-field log-search-field" onSubmit={handleSearchSubmit}>
          <label htmlFor="log-search">{t('admin.logs.searchLabel')}</label>
          <div className="log-search-input-group">
            <input
              id="log-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('admin.logs.searchPlaceholder')}
            />
            <button type="submit" className="log-search-button">
              {t('admin.logs.searchButton')}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <p className="audit-error" role="alert">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="audit-loading">{t('admin.logs.loading')}</p>
      ) : (
        <>
          <p className="audit-summary">{t('admin.logs.summary', { total: String(total) })}</p>

          <div className="audit-table-container">
            <table className="audit-table log-table">
              <thead>
                <tr>
                  <th>{t('admin.logs.tableTimestamp')}</th>
                  <th>{t('admin.logs.tableLevel')}</th>
                  <th>{t('admin.logs.tableMessage')}</th>
                  <th>{t('admin.logs.tableMeta')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="audit-empty">
                      {t('admin.logs.empty')}
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, index) => (
                    <tr key={`${entry.timestamp}-${index}`} className={entry.level === 'error' ? 'log-row--error' : entry.level === 'warn' ? 'log-row--warn' : ''}>
                      <td className="log-timestamp">{formatTimestamp(entry.timestamp)}</td>
                      <td>
                        <span className={`log-level-badge ${getLevelClass(entry.level)}`}>
                          {entry.level.toUpperCase()}
                        </span>
                      </td>
                      <td className="log-message">{entry.message}</td>
                      <td className="log-meta">
                        {entry.meta && Object.keys(entry.meta).length > 0 ? (
                          <details>
                            <summary>{t('admin.logs.metaDetails')}</summary>
                            <pre className="log-meta-pre">{JSON.stringify(entry.meta, null, 2)}</pre>
                          </details>
                        ) : '—'}
                      </td>
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
              {t('admin.logs.previousPage')}
            </button>
            <span className="audit-page-info">
              {t('admin.logs.pageInfo', { page: String(page), totalPages: String(totalPages) })}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('admin.logs.nextPage')}
            </button>
          </div>
        </>
      )}
    </div>
  )
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
