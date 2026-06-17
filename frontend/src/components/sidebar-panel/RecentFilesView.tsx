/**
 * RecentFilesView — displays recently opened files in the sidebar panel.
 * Renders a list of the last 20 opened files with file icons.
 * Click on an entry opens the file in a tab.
 */

import React, { useMemo, useCallback } from 'react'
import { Clock } from 'lucide-react'
import * as recentFilesStore from '../../state/recentFilesStore'
import { getFileIcon, getFileIconClass, getDisplayName } from '../../utils/fileIcons'
import type { RecentFileEntry } from '../../state/recentFilesStore'
import './RecentFilesView.css'

export interface RecentFilesViewProps {
  /** Callback to open a file in a tab. */
  onOpenFile: (vaultId: string, path: string) => void
  /** Optional: forces re-render when files are opened. */
  refreshKey?: number
}

/**
 * Extracts the filename from a full path.
 */
function getFileName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

/**
 * Formats a timestamp into a relative time string.
 */
function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now()
  const then = new Date(isoTimestamp).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Gerade eben'
  if (minutes < 60) return `Vor ${minutes} Min.`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Vor ${hours} Std.`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Gestern'
  if (days < 7) return `Vor ${days} Tagen`

  return new Date(isoTimestamp).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

/**
 * Displays a list of recently opened files with file icons and relative timestamps.
 * Entries are clickable and open the file in a tab.
 */
export function RecentFilesView({ onOpenFile, refreshKey: _refreshKey }: RecentFilesViewProps): React.ReactElement {
  const entries: RecentFileEntry[] = useMemo(
    () => recentFilesStore.getRecent(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [_refreshKey]
  )

  const handleEntryClick = useCallback((entry: RecentFileEntry) => {
    onOpenFile(entry.vaultId, entry.path)
  }, [onOpenFile])

  if (entries.length === 0) {
    return (
      <div className="recent-files-view recent-files-view--empty" role="region" aria-label="Zuletzt geöffnet">
        <Clock size={24} className="recent-files-view__empty-icon" />
        <span className="recent-files-view__empty-text">Keine zuletzt geöffneten Dateien</span>
      </div>
    )
  }

  return (
    <div className="recent-files-view" role="region" aria-label="Zuletzt geöffnet">
      <ul className="recent-files-view__list" role="list">
        {entries.map((entry) => {
          const fileName = getFileName(entry.path)
          const IconComponent = getFileIcon(fileName)
          const iconClass = getFileIconClass(fileName)

          return (
            <li key={`${entry.vaultId}::${entry.path}`} className="recent-files-view__item">
              <button
                className="recent-files-view__entry"
                onClick={() => handleEntryClick(entry)}
                title={entry.path}
                type="button"
              >
                <span className={`recent-files-view__file-icon ${iconClass}`}>
                  <IconComponent size={14} />
                </span>
                <span className="recent-files-view__file-name">
                  {getDisplayName(fileName)}
                </span>
                <span className="recent-files-view__timestamp">
                  {formatRelativeTime(entry.timestamp)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
