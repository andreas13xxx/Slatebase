import React, { useState, useCallback, useMemo } from 'react'
import { Star, ChevronDown, ChevronRight } from 'lucide-react'
import { favoritesStore } from '../state/favoritesStore'
import { getFileIcon, getFileIconClass, getDisplayName } from '../utils/fileIcons'
import type { FavoriteEntry } from '../state/favoritesStore'
import './FavoritesSection.css'

/**
 * Props for the FavoritesSection component.
 */
export interface FavoritesSectionProps {
  /** Current active vault ID. */
  vaultId: string
  /** Callback to open a file in a tab. */
  onOpenFile: (vaultId: string, path: string) => void
}

/**
 * Extracts the filename from a full path.
 */
function getFileName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

/**
 * Displays a collapsible "Favoriten" section above the file tree.
 * Only renders when favorites exist for the current vault.
 * Each entry shows a file icon + filename and opens the file on click.
 */
export function FavoritesSection({ vaultId, onOpenFile }: FavoritesSectionProps): React.ReactElement | null {
  const [collapsed, setCollapsed] = useState(false)

  const favorites: FavoriteEntry[] = useMemo(
    () => favoritesStore.getForVault(vaultId),
    [vaultId]
  )

  const handleToggle = useCallback(() => {
    setCollapsed(prev => !prev)
  }, [])

  const handleEntryClick = useCallback((entry: FavoriteEntry) => {
    onOpenFile(entry.vaultId, entry.path)
  }, [onOpenFile])

  // Don't render anything if there are no favorites
  if (favorites.length === 0) return null

  return (
    <div className="favorites-section" role="region" aria-label="Favoriten">
      <button
        className="favorites-section__header"
        onClick={handleToggle}
        aria-expanded={!collapsed}
        type="button"
      >
        <span className="favorites-section__chevron">
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </span>
        <Star size={14} className="favorites-section__star-icon" />
        <span className="favorites-section__title">Favoriten</span>
        <span className="favorites-section__count">{favorites.length}</span>
      </button>

      {!collapsed && (
        <ul className="favorites-section__list" role="list">
          {favorites.map((entry) => {
            const fileName = getFileName(entry.path)
            const IconComponent = getFileIcon(fileName)
            const iconClass = getFileIconClass(fileName)

            return (
              <li key={entry.path} className="favorites-section__item">
                <button
                  className="favorites-section__entry"
                  onClick={() => handleEntryClick(entry)}
                  title={entry.path}
                  type="button"
                >
                  <span className={`favorites-section__file-icon ${iconClass}`}>
                    <IconComponent size={14} />
                  </span>
                  <span className="favorites-section__file-name">
                    {getDisplayName(fileName)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
