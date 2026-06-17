import { useState, useEffect, useCallback } from 'react'
import { History, RotateCcw, Loader2 } from 'lucide-react'
import type { IApiClient } from '../api'
import { showToast } from './ToastNotification'
import './VersionBrowser.css'

/** A single version entry returned by the API. */
export interface VersionEntry {
  timestamp: string
  sizeBytes: number
}

/** Props for the VersionBrowser component. */
export interface VersionBrowserProps {
  /** The vault ID containing the file. */
  vaultId: string
  /** Relative path of the file within the vault. */
  filePath: string
  /** Current content of the file (used for diffing). */
  currentContent: string
  /** API client instance for fetching versions. */
  apiClient: IApiClient
  /** Callback invoked after a successful restore. */
  onRestore?: () => void
}

/** A single diff line with its type. */
interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
}

/**
 * Formats a UTC timestamp string (YYYYMMDDTHHmmssSSS) to local timezone
 * in DD.MM.YYYY HH:mm format.
 */
function formatTimestamp(timestamp: string): string {
  // Parse YYYYMMDDTHHmmssSSS format
  const year = timestamp.slice(0, 4)
  const month = timestamp.slice(4, 6)
  const day = timestamp.slice(6, 8)
  const hour = timestamp.slice(9, 11)
  const minute = timestamp.slice(11, 13)
  const second = timestamp.slice(13, 15)
  const ms = timestamp.slice(15, 18)

  const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`)

  if (isNaN(utcDate.getTime())) {
    return timestamp
  }

  const localDay = String(utcDate.getDate()).padStart(2, '0')
  const localMonth = String(utcDate.getMonth() + 1).padStart(2, '0')
  const localYear = utcDate.getFullYear()
  const localHour = String(utcDate.getHours()).padStart(2, '0')
  const localMinute = String(utcDate.getMinutes()).padStart(2, '0')

  return `${localDay}.${localMonth}.${localYear} ${localHour}:${localMinute}`
}

/**
 * Computes a simple line-by-line diff between old (version) and new (current) content.
 * Uses longest common subsequence (LCS) approach for accurate diffs.
 */
function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  // Simple LCS-based diff
  const m = oldLines.length
  const n = newLines.length

  // Build LCS length table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[])

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }

  // Backtrack to get diff
  const result: DiffLine[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'unchanged', content: oldLines[i - 1]! })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.unshift({ type: 'added', content: newLines[j - 1]! })
      j--
    } else {
      result.unshift({ type: 'removed', content: oldLines[i - 1]! })
      i--
    }
  }

  return result
}

/**
 * VersionBrowser component.
 *
 * Displays a list of file versions with timestamps (sorted descending).
 * On version select, fetches content and shows an inline diff against the current content.
 * Provides a "Wiederherstellen" button to restore a selected version.
 */
export function VersionBrowser({
  vaultId,
  filePath,
  currentContent,
  apiClient,
  onRestore,
}: VersionBrowserProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTimestamp, setSelectedTimestamp] = useState<string | null>(null)
  const [diffLines, setDiffLines] = useState<DiffLine[]>([])
  const [loadingContent, setLoadingContent] = useState(false)
  const [restoring, setRestoring] = useState(false)

  /** Fetches the version list from the API. */
  const loadVersions = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiClient.listVersions(vaultId, filePath)
      // Sort descending by timestamp
      const sorted = [...response.versions].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      setVersions(sorted)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Versionen konnten nicht geladen werden'
      showToast('error', message)
      setVersions([])
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId, filePath])

  useEffect(() => {
    // Data fetching on mount — setState inside async callback is expected
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadVersions()
  }, [loadVersions])

  /** Handles selecting a version entry — fetches content and computes diff. */
  const handleVersionSelect = useCallback(async (timestamp: string) => {
    if (timestamp === selectedTimestamp) {
      setSelectedTimestamp(null)
      setDiffLines([])
      return
    }

    setSelectedTimestamp(timestamp)
    setLoadingContent(true)
    setDiffLines([])

    try {
      const response = await apiClient.getVersionContent(vaultId, filePath, timestamp)
      const diff = computeDiff(response.content, currentContent)
      setDiffLines(diff)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Versionsinhalt konnte nicht geladen werden'
      showToast('error', message)
      setSelectedTimestamp(null)
    } finally {
      setLoadingContent(false)
    }
  }, [apiClient, vaultId, filePath, currentContent, selectedTimestamp])

  /** Restores the selected version after confirmation. */
  const handleRestore = useCallback(async () => {
    if (!selectedTimestamp) return

    const confirmed = window.confirm(
      'Möchten Sie diese Version wirklich wiederherstellen? Die aktuelle Version wird als neue Version gesichert.'
    )
    if (!confirmed) return

    setRestoring(true)
    try {
      await apiClient.restoreVersion(vaultId, filePath, selectedTimestamp)
      showToast('success', 'Version erfolgreich wiederhergestellt')
      setSelectedTimestamp(null)
      setDiffLines([])
      await loadVersions()
      onRestore?.()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Version konnte nicht wiederhergestellt werden'
      showToast('error', message)
    } finally {
      setRestoring(false)
    }
  }, [apiClient, vaultId, filePath, selectedTimestamp, loadVersions, onRestore])

  if (loading) {
    return (
      <div className="version-browser version-browser--loading">
        <Loader2 size={20} className="version-browser__spinner" />
        <span>Versionen werden geladen…</span>
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="version-browser version-browser--empty">
        <History size={24} className="version-browser__empty-icon" />
        <span className="version-browser__empty-text">
          Keine früheren Versionen vorhanden
        </span>
      </div>
    )
  }

  return (
    <div className="version-browser">
      <div className="version-browser__layout">
        {/* Version list */}
        <div className="version-browser__list">
          <div className="version-browser__list-header">
            <History size={16} />
            <span>Versionen ({versions.length})</span>
          </div>
          <ul className="version-browser__entries" role="listbox" aria-label="Dateiversionen">
            {versions.map((version) => (
              <li
                key={version.timestamp}
                role="option"
                aria-selected={version.timestamp === selectedTimestamp}
                className={`version-browser__entry${version.timestamp === selectedTimestamp ? ' version-browser__entry--selected' : ''}`}
                onClick={() => void handleVersionSelect(version.timestamp)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    void handleVersionSelect(version.timestamp)
                  }
                }}
                tabIndex={0}
              >
                <span className="version-browser__entry-time">
                  {formatTimestamp(version.timestamp)}
                </span>
                <span className="version-browser__entry-size">
                  {formatSize(version.sizeBytes)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Diff viewer */}
        <div className="version-browser__diff">
          {!selectedTimestamp && (
            <div className="version-browser__diff-placeholder">
              <span>Version auswählen um Unterschiede anzuzeigen</span>
            </div>
          )}

          {selectedTimestamp && loadingContent && (
            <div className="version-browser__diff-loading">
              <Loader2 size={16} className="version-browser__spinner" />
              <span>Inhalt wird geladen…</span>
            </div>
          )}

          {selectedTimestamp && !loadingContent && diffLines.length > 0 && (
            <>
              <div className="version-browser__diff-header">
                <span className="version-browser__diff-title">
                  Diff: Version {formatTimestamp(selectedTimestamp)} → Aktuell
                </span>
                <button
                  className="version-browser__restore-btn"
                  onClick={() => void handleRestore()}
                  disabled={restoring}
                  title="Version wiederherstellen"
                >
                  <RotateCcw size={14} />
                  <span>{restoring ? 'Wird wiederhergestellt…' : 'Wiederherstellen'}</span>
                </button>
              </div>
              <div className="version-browser__diff-content" role="region" aria-label="Diff-Ansicht">
                {diffLines.map((line, index) => (
                  <div
                    key={index}
                    className={`version-browser__diff-line version-browser__diff-line--${line.type}`}
                  >
                    <span className="version-browser__diff-prefix">
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                    </span>
                    <span className="version-browser__diff-text">
                      {line.content || '\u00A0'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {selectedTimestamp && !loadingContent && diffLines.length === 0 && (
            <div className="version-browser__diff-placeholder">
              <span>Keine Unterschiede gefunden</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Formats bytes to a human-readable size string. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(1)} GB`
}
