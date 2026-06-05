import { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Database, FilePlus, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from '../i18n'
import { clampMenuPosition } from '../utils/pathUtils'
import type { DirectoryTree } from '../types'

/**
 * Props for the ContextMenu component.
 */
export interface ContextMenuProps {
  /** X coordinate of the right-click event (viewport). */
  x: number
  /** Y coordinate of the right-click event (viewport). */
  y: number
  /** The tree node that was right-clicked. */
  node: DirectoryTree
  /** Current user permission for the vault. */
  permission: 'owner' | 'read' | 'write'
  /** Callback to close the context menu. */
  onClose: () => void
  /** Callback when "Neue Datei" is selected. Receives the parent directory path. */
  onNewFile: (parentPath: string) => void
  /** Callback when "Umbenennen" is selected. Receives the target node. */
  onRename: (node: DirectoryTree) => void
  /** Callback when "Löschen" is selected. Receives the target node. */
  onDelete: (node: DirectoryTree) => void
  /** Optional callback when "Neuer Vault" is selected. Only shown when provided. */
  onNewVault?: () => void
}

/**
 * Context menu rendered as a portal with fixed positioning.
 * Shows file operation items (new file, rename, delete) with Lucide icons.
 * Hides write operations when the user has read-only permission.
 * Closes on outside click, Escape key, or menu item selection.
 */
export function ContextMenu({
  x,
  y,
  node,
  permission,
  onClose,
  onNewFile,
  onRename,
  onDelete,
  onNewVault,
}: ContextMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x, y })

  // Measure menu dimensions and clamp position to viewport
  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return

    const menuWidth = menu.offsetWidth
    const menuHeight = menu.offsetHeight
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const clamped = clampMenuPosition(x, y, menuWidth, menuHeight, viewportWidth, viewportHeight)
    setPosition(clamped)
  }, [x, y])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const menu = menuRef.current
      if (menu && !menu.contains(e.target as Node)) {
        onClose()
      }
    }

    // Use setTimeout to avoid the same click that opened the menu from closing it
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClick)
    }
  }, [onClose])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  /**
   * Determines the parent path for new file creation.
   * If the node is a directory, use its path directly.
   * If the node is a file, use its parent directory.
   */
  function getParentPath(): string {
    if (node.type === 'directory') {
      return node.path
    }
    const lastSlash = node.path.lastIndexOf('/')
    return lastSlash === -1 ? '' : node.path.slice(0, lastSlash)
  }

  function handleNewFile() {
    onNewFile(getParentPath())
    onClose()
  }

  function handleNewVault() {
    if (onNewVault) onNewVault()
    onClose()
  }

  function handleRename() {
    onRename(node)
    onClose()
  }

  function handleDelete() {
    onDelete(node)
    onClose()
  }

  const isReadOnly = permission === 'read'
  const isRoot = node.path === ''

  const menu = (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
      }}
      role="menu"
      aria-label={t('contextMenu.ariaLabel')}
    >
      {isReadOnly ? (
        <div className="context-menu-empty">
          {t('contextMenu.noActions')}
        </div>
      ) : (
        <ul className="context-menu-list">
          <li className="context-menu-item" role="menuitem">
            <button
              type="button"
              className="context-menu-btn"
              onClick={handleNewFile}
            >
              <FilePlus size={14} className="context-menu-icon" />
              <span>{t('contextMenu.newFile')}</span>
            </button>
          </li>
          {isRoot && onNewVault && (
            <li className="context-menu-item" role="menuitem">
              <button
                type="button"
                className="context-menu-btn"
                onClick={handleNewVault}
              >
                <Database size={14} className="context-menu-icon" />
                <span>{t('contextMenu.newVault')}</span>
              </button>
            </li>
          )}
          {!isRoot && (
            <li className="context-menu-item" role="menuitem">
              <button
                type="button"
                className="context-menu-btn"
                onClick={handleRename}
              >
                <Pencil size={14} className="context-menu-icon" />
                <span>{t('contextMenu.rename')}</span>
              </button>
            </li>
          )}
          {!isRoot && (
            <li className="context-menu-item" role="menuitem">
              <button
                type="button"
                className="context-menu-btn context-menu-btn--danger"
                onClick={handleDelete}
              >
                <Trash2 size={14} className="context-menu-icon" />
                <span>{t('contextMenu.delete')}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )

  return ReactDOM.createPortal(menu, document.body)
}
