import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight, Filter, Search } from 'lucide-react'
import { useSyncContext } from '../state/syncContext'
import { useAppContext } from '../state'
import { loadSyncProtocol } from '../state/syncActions'
import type { SyncProtocolLevel, SyncProtocolEntry } from '../state/syncState'

/**
 * Props for SyncProtocolView.
 */
export interface SyncProtocolViewProps {
  vaultId: string
}

/** Page size for protocol entries. */
const PROTOCOL_PAGE_SIZE = 100

/**
 * Server-log style display of sync protocol events.
 * Features: level filter (INFO/WARN/ERROR), text search, pagination, monospace font.
 */
export function SyncProtocolView({ vaultId }: SyncProtocolViewProps) {
  const { state, dispatch } = useSyncContext()
  const { apiClient } = useAppContext()
  const [page, setPage] = useState(1)
  const [levelFilter, setLevelFilter] = useState<SyncProtocolLevel | ''>('')
  const [searchText, setSearchText] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const loadProtocol = useCallback(() => {
    if (!apiClient) return
    const filter: { level?: string; search?: string } = {}
    if (levelFilter) filter.level = levelFilter
    if (searchText) filter.search = searchText
    loadSyncProtocol(dispatch, apiClient, vaultId, page, PROTOCOL_PAGE_SIZE, Object.keys(filter).length > 0 ? filter : undefined)
  }, [dispatch, apiClient, vaultId, page, levelFilter, searchText])

  useEffect(() => {
    loadProtocol()
  }, [loadProtocol])

  const protocol = state.protocol
  const items = protocol?.items ?? []
  const total = protocol?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PROTOCOL_PAGE_SIZE))

  function handleLevelChange(level: SyncProtocolLevel | '') {
    setLevelFilter(level)
    setPage(1)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSearchText(searchInput)
    setPage(1)
  }

  function handleClearSearch() {
    setSearchInput('')
    setSearchText('')
    setPage(1)
  }

  return (
    <div className="sync-protocol-view">
      {/* ── Toolbar ── */}
      <div className="sync-protocol-toolbar">
        <div className="sync-protocol-filters">
          {/* Level Filter */}
          <div className="sync-protocol-level-filter">
            <Filter size={12} />
            <select
              className="sync-protocol-level-select"
              value={levelFilter}
              onChange={(e) => handleLevelChange(e.target.value as SyncProtocolLevel | '')}
              aria-label="Level-Filter"
            >
              <option value="">Alle</option>
              <option value="info">INFO</option>
              <option value="warn">WARN</option>
              <option value="error">ERROR</option>
            </select>
          </div>

          {/* Text Search */}
          <form className="sync-protocol-search" onSubmit={handleSearchSubmit}>
            <Search size={12} />
            <input
              className="sync-protocol-search-input"
              type="text"
              placeholder="Textfilter…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Protokoll-Textfilter"
            />
            {searchText && (
              <button
                type="button"
                className="sync-protocol-clear-btn"
                onClick={handleClearSearch}
                aria-label="Filter zurücksetzen"
              >
                ×
              </button>
            )}
          </form>
        </div>

        <button
          className="sync-protocol-refresh-btn"
          onClick={loadProtocol}
          title="Protokoll aktualisieren"
          aria-label="Protokoll aktualisieren"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* ── Log Entries ── */}
      {items.length === 0 ? (
        <p className="sync-protocol-empty">Noch keine Protokoll-Einträge vorhanden.</p>
      ) : (
        <div className="sync-protocol-entries">
          {items.map((entry, i) => (
            <ProtocolLine key={`${entry.timestamp}-${i}`} entry={entry} />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="sync-protocol-pagination">
          <button
            className="sync-protocol-page-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Vorherige Seite"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="sync-protocol-page-info">
            {page} / {totalPages} ({total} Einträge)
          </span>
          <button
            className="sync-protocol-page-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label="Nächste Seite"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Single Protocol Line ────────────────────────────────────────────────────

function ProtocolLine({ entry }: { entry: SyncProtocolEntry }) {
  const timestamp = formatTimestamp(entry.timestamp)
  const levelClass = `sync-protocol-level--${entry.level}`

  return (
    <div className={`sync-protocol-line ${levelClass}`}>
      <span className="sync-protocol-line-time">{timestamp}</span>
      <span className={`sync-protocol-line-level ${levelClass}`}>
        {entry.level.toUpperCase().padEnd(5)}
      </span>
      <span className="sync-protocol-line-event">{entry.event.padEnd(18)}</span>
      <span className="sync-protocol-line-sep">│</span>
      <span className="sync-protocol-line-message">{entry.message}</span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month} ${h}:${m}:${s}.${ms}`
}
