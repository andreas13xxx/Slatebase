import { useState } from 'react'
import type { AnalysisResult, AnalysisDetail } from '../state/syncState'

/**
 * Props for the SyncAnalysisView component.
 */
export interface SyncAnalysisViewProps {
  analysisResult: AnalysisResult
}

/** Category keys for filtering and display. */
type CategoryKey = 'remote_newer' | 'local_newer' | 'remote_only' | 'local_only' | 'conflict' | 'identical'

/** German labels for each analysis category. */
const CATEGORY_LABELS: Record<CategoryKey, string> = {
  remote_newer: 'Remote neuer',
  local_newer: 'Lokal neuer',
  remote_only: 'Nur remote',
  local_only: 'Nur lokal',
  conflict: 'Konflikt',
  identical: 'Identisch',
}

/** All category keys in display order. */
const CATEGORY_KEYS: CategoryKey[] = [
  'remote_newer',
  'local_newer',
  'remote_only',
  'local_only',
  'conflict',
  'identical',
]

/**
 * Displays analysis results after the user triggers an analysis.
 * Shows category summary cards and a filterable detail list.
 */
export function SyncAnalysisView({ analysisResult }: SyncAnalysisViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | 'all'>('all')

  const filteredDetails: AnalysisDetail[] = selectedCategory === 'all'
    ? analysisResult.details
    : analysisResult.details.filter(d => d.category === selectedCategory)

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`
    return `${(ms / 1000).toFixed(1)} s`
  }

  function formatTimestamp(iso: string | undefined): string {
    if (!iso) return '—'
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
    <div className="sync-analysis-view">
      <div className="sync-analysis-header">
        <h3 className="sync-analysis-title">Analyse-Ergebnis</h3>
        <span className="sync-analysis-duration">
          Dauer: {formatDuration(analysisResult.durationMs)}
        </span>
      </div>

      <div className="sync-analysis-summary">
        {CATEGORY_KEYS.map(key => {
          const summary = analysisResult.summary[key]
          return (
            <button
              key={key}
              className={`sync-analysis-card sync-analysis-card--${key} ${selectedCategory === key ? 'sync-analysis-card--selected' : ''}`}
              onClick={() => setSelectedCategory(selectedCategory === key ? 'all' : key)}
              title={`Filter: ${CATEGORY_LABELS[key]}`}
            >
              <span className="sync-analysis-card-count">{summary.count}</span>
              <span className="sync-analysis-card-label">{CATEGORY_LABELS[key]}</span>
              <span className="sync-analysis-card-bytes">{formatBytes(summary.totalBytes)}</span>
            </button>
          )
        })}
      </div>

      <div className="sync-analysis-filter">
        <label className="sync-analysis-filter-label" htmlFor="sync-analysis-category-filter">
          Kategorie:
        </label>
        <select
          id="sync-analysis-category-filter"
          className="sync-analysis-filter-select"
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value as CategoryKey | 'all')}
        >
          <option value="all">Alle ({analysisResult.details.length})</option>
          {CATEGORY_KEYS.map(key => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[key]} ({analysisResult.summary[key].count})
            </option>
          ))}
        </select>
      </div>

      <div className="sync-analysis-details">
        {filteredDetails.length === 0 ? (
          <p className="sync-analysis-empty">Keine Einträge in dieser Kategorie.</p>
        ) : (
          <table className="sync-analysis-table">
            <thead>
              <tr>
                <th>Pfad</th>
                <th>Kategorie</th>
                <th>Revision</th>
                <th>Lokal geändert</th>
                <th>Remote geändert</th>
                <th>Lokal</th>
                <th>Remote</th>
              </tr>
            </thead>
            <tbody>
              {filteredDetails.map((detail, index) => (
                <tr key={`${detail.path}-${index}`} className={`sync-analysis-row sync-analysis-row--${detail.category}`}>
                  <td className="sync-analysis-cell-path" title={detail.path}>{detail.path}</td>
                  <td>
                    <span className={`sync-analysis-category-badge sync-analysis-category-badge--${detail.category}`}>
                      {CATEGORY_LABELS[detail.category]}
                    </span>
                  </td>
                  <td className="sync-analysis-cell-revision">{detail.remoteRevision ?? '—'}</td>
                  <td>{formatTimestamp(detail.localModifiedAt)}</td>
                  <td>{formatTimestamp(detail.remoteModifiedAt)}</td>
                  <td className="sync-analysis-cell-size">{detail.localSize != null ? formatBytes(detail.localSize) : '—'}</td>
                  <td className="sync-analysis-cell-size">{detail.remoteSize != null ? formatBytes(detail.remoteSize) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
