/**
 * FavoritesView — displays all favorites for the current vault as a standalone view.
 * Used as a tab in the sidebar panel (not the collapsible section in FileExplorer).
 */

import React, { useMemo, useCallback } from 'react'
import { Star } from 'lucide-react'
import { favoritesStore } from '../../state/favoritesStore'
import { getFileIcon, getFileIconClass, getDisplayName } from '../../utils/fileIcons'
import type { FavoriteEntry } from '../../state/favoritesStore'
import './FavoritesView.css'

export interface FavoritesViewProps {
  /** Current active vault ID. Null if no vault selected. */
  vaultId: string | null
  /** Callback to open a file in a tab. */
  onOpenFile: (vaultId: string, path: string) => void
  /** Forces re-render when favorites change. */
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
 * Displays all favorites for the current vault.
 * Each entry shows a file icon + filename and opens the file on click.
 */
export function FavoritesView({ vaultId, onOpenFile, refreshKey: _refreshKey }: FavoritesViewProps): React.ReactElement {
  const favorites: FavoriteEntry[] = useMemo(
    () => vaultId ? favoritesStore.getForVault(vaultId) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vaultId, _refreshKey]
  )

  const handleEntryClick = useCallback((entry: FavoriteEntry) => {
    onOpenFile(entry.vaultId, entry.path)
  }, [onOpenFile])

  if (!vaultId) {
    return (
      <div className="favorites-view favorites-view--empty" role="region" aria-label="Favoriten">
        <Star size={24} className="favorites-view__empty-icon" />
        <span className="favorites-view__empty-text">Kein Vault ausgewählt</span>
      </div>
    )
  }

  if (favorites.length === 0) {
    return (
      <div className="favorites-view favorites-view--empty" role="region" aria-label="Favoriten">
        <Star size={24} className="favorites-view__empty-icon" />
        <span className="favorites-view__empty-text">Keine Favoriten in diesem Vault</span>
      </div>
    )
  }

  return (
    <div className="favorites-view" role="region" aria-label="Favoriten">
      <ul className="favorites-view__list" role="list">
        {favorites.map((entry) => {
          const fileName = getFileName(entry.path)
          const IconComponent = getFileIcon(fileName)
          const iconClass = getFileIconClass(fileName)

          return (
            <li key={entry.path} className="favorites-view__item">
              <button
                className="favorites-view__entry"
                onClick={() => handleEntryClick(entry)}
                title={entry.path}
                type="button"
              >
                <span className={`favorites-view__file-icon ${iconClass}`}>
                  <IconComponent size={14} />
                </span>
                <span className="favorites-view__file-name">
                  {getDisplayName(fileName)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
