import { useMemo, useState } from 'react'
import { Folder, Search } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useFocusTrap } from '../hooks/useFocusTrap'
import './MoveTargetDialog.css'

export interface MoveTargetDialogProps {
  /** Display name of the file or folder being moved. */
  itemName: string
  /** Name of the vault, shown for the root entry. */
  vaultName: string
  /** Folder paths the item may be moved into ('' = vault root). */
  folders: string[]
  /** Folder the item currently lives in; shown but not selectable. */
  currentFolder: string
  /** Called with the chosen folder path ('' = vault root). */
  onSelect: (folderPath: string) => void
  onClose: () => void
}

/**
 * Folder picker for "Move to…": the touch-friendly counterpart of dragging an
 * explorer entry onto a folder. One tap on a folder moves the item there.
 */
export function MoveTargetDialog({ itemName, vaultName, folders, currentFolder, onSelect, onClose }: MoveTargetDialogProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const containerRef = useFocusTrap<HTMLDivElement>({ isActive: true, onEscape: onClose, returnFocusOnDeactivate: true })

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...folders]
      .sort((a, b) => a.localeCompare(b))
      .filter((path) => (path === '' ? vaultName : path).toLowerCase().includes(q))
  }, [folders, query, vaultName])

  return (
    <div
      className="move-target-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div ref={containerRef} className="move-target-dialog" role="dialog" aria-modal="true" aria-label={t('moveDialog.title', { name: itemName })}>
        <div className="move-target-title">{t('moveDialog.title', { name: itemName })}</div>
        <div className="move-target-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="text"
            className="move-target-input"
            placeholder={t('moveDialog.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="move-target-list" aria-label={t('moveDialog.listLabel')}>
          {visible.length === 0 && <li className="move-target-empty">{t('moveDialog.noFolders')}</li>}
          {visible.map((path) => {
            const isCurrent = path === currentFolder
            const depth = path === '' ? 0 : path.split('/').length
            return (
              <li key={path || '__root__'}>
                <button
                  type="button"
                  className="move-target-item"
                  style={{ paddingLeft: 12 + depth * 14 }}
                  disabled={isCurrent}
                  onClick={() => onSelect(path)}
                >
                  <Folder size={14} aria-hidden="true" />
                  <span className="move-target-item-name">{path === '' ? t('moveDialog.vaultRoot') : path.split('/').pop()}</span>
                  {isCurrent && <span className="move-target-item-note">{t('moveDialog.currentLocation')}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
