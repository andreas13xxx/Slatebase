/**
 * FavoritesView — displays all bookmarks for the current vault as a standalone view.
 * Used as a tab in the sidebar panel (not the collapsible section in FileExplorer).
 *
 * Supports the four bookmark types (file/heading/block/search — Requirements
 * 11-14), manual drag-and-drop reordering (Requirement 1), a context menu
 * for remove/reveal/rename (Requirement 2), and custom display labels
 * (Requirement 3).
 */

import React, { useMemo, useCallback, useState, useRef } from 'react'
import { Star, Heading, Hash, Search as SearchIcon } from 'lucide-react'
import { favoritesStore } from '../../state/favoritesStore'
import { requestReveal } from '../../state/revealFileBridge'
import { useSearchContext } from '../../state/searchContext'
import { useAppContext } from '../../state'
import { performSearch } from '../../state/searchActions'
import { getFileIcon, getFileIconClass, getDisplayName } from '../../utils/fileIcons'
import { ContextMenu, type ContextMenuItem } from '../ContextMenu'
import { InlineInput } from '../InlineInput'
import type { FavoriteEntry } from '../../state/favoritesStore'
import type { PanelState, PanelAction } from '../../state/panelState'
import type { Dispatch } from 'react'
import './FavoritesView.css'

export interface FavoritesViewProps {
  /** Current active vault ID. Null if no vault selected. */
  vaultId: string | null
  /** Callback to open a file in a tab. */
  onOpenFile: (vaultId: string, path: string) => void
  /**
   * Called when the user clicks a search bookmark, instead of the built-in
   * default (open the search panel event + populate SearchContext + run the
   * query via performSearch). Override only if a caller needs different
   * search-panel wiring than the shared SearchContext/`slatebase:open-search`
   * mechanism the rest of the app already uses.
   */
  onOpenSearch?: (query: { query: string; caseSensitive?: boolean; regex?: boolean }) => void
  /** Forces re-render when favorites change. */
  refreshKey?: number
  /**
   * State/dispatch of whichever side panel is currently hosting this view —
   * passed down by `SidePanel` rather than read via a fixed context hook,
   * since Favorites can now live on either side. Used by "Reveal" to switch
   * that same panel's active section over to Explorer.
   */
  panelState: PanelState
  panelDispatch: Dispatch<PanelAction>
}

interface ContextMenuState {
  entry: FavoriteEntry
  x: number
  y: number
}

/** Extracts the filename from a full path. */
function getFileName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

/** Display text for an entry: label override, or a type-appropriate default. */
function getEntryDisplayText(entry: FavoriteEntry): string {
  if (entry.label) return entry.label
  switch (entry.type ?? 'file') {
    case 'heading':
      return `${getDisplayName(getFileName(entry.path))} › ${entry.heading ?? ''}`
    case 'block':
      return `${getDisplayName(getFileName(entry.path))} › ^${entry.blockId ?? ''}`
    case 'search':
      return entry.searchQuery ?? ''
    default:
      return getDisplayName(getFileName(entry.path))
  }
}

/** Tooltip text for an entry (always the "real" identity, even when a label is set). */
function getEntryTooltip(entry: FavoriteEntry): string {
  switch (entry.type ?? 'file') {
    case 'search':
      return entry.searchQuery ?? ''
    default:
      return entry.path
  }
}

/** Renders the icon appropriate for an entry's bookmark type. */
function EntryIcon({ entry }: { entry: FavoriteEntry }) {
  const type = entry.type ?? 'file'
  if (type === 'search') {
    return <SearchIcon size={14} />
  }
  if (type === 'heading') {
    return <Heading size={14} />
  }
  if (type === 'block') {
    return <Hash size={14} />
  }
  const fileName = getFileName(entry.path)
  // createElement, not JSX: rendering a component read out of a variable trips
  // the "cannot create components during render" rule, even though getFileIcon
  // hands back a cached, stable component per icon (see wrapIcon in fileIcons).
  // Same call shape fileIcons.tsx itself uses.
  return React.createElement(getFileIcon(fileName), { size: 14 })
}

function entryIconClass(entry: FavoriteEntry): string {
  const type = entry.type ?? 'file'
  if (type !== 'file') return ''
  return getFileIconClass(getFileName(entry.path))
}

/**
 * Displays all bookmarks for the current vault.
 * Each entry shows a type-appropriate icon + display text and resolves the
 * click according to its bookmark type. Supports drag-and-drop reordering,
 * a context menu (remove/reveal/rename), and custom labels.
 */
export function FavoritesView({ vaultId, onOpenFile, onOpenSearch, refreshKey: _refreshKey, panelState, panelDispatch }: FavoritesViewProps): React.ReactElement {
  const { dispatch: searchDispatch } = useSearchContext()
  const { apiClient } = useAppContext()
  const [internalRefreshTick, setInternalRefreshTick] = useState(0)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const favorites: FavoriteEntry[] = useMemo(
    () => vaultId ? favoritesStore.getForVault(vaultId) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vaultId, _refreshKey, internalRefreshTick]
  )

  const refresh = useCallback(() => setInternalRefreshTick((n) => n + 1), [])

  const handleEntryClick = useCallback((entry: FavoriteEntry) => {
    const type = entry.type ?? 'file'
    if (type === 'search') {
      const query = { query: entry.searchQuery ?? '', caseSensitive: entry.searchCaseSensitive, regex: entry.searchRegex }
      if (onOpenSearch) {
        onOpenSearch(query)
      } else if (vaultId && apiClient) {
        // Default: reuse the same SearchContext + 'slatebase:open-search' event
        // the rest of the app already uses (Command Palette, toolbar) — no
        // caller-supplied wiring required.
        searchDispatch({ type: 'SET_QUERY', payload: query.query })
        searchDispatch({ type: 'SET_OPTION', payload: { key: 'caseSensitive', value: query.caseSensitive ?? false } })
        searchDispatch({ type: 'SET_OPTION', payload: { key: 'regex', value: query.regex ?? false } })
        window.dispatchEvent(new CustomEvent('slatebase:open-search'))
        void performSearch(searchDispatch, apiClient, vaultId, {
          query: query.query,
          caseSensitive: query.caseSensitive ?? false,
          regex: query.regex ?? false,
        })
      }
      return
    }
    onOpenFile(entry.vaultId, entry.path)
    // TODO: scroll-to-heading/scroll-to-block once the editor exposes a
    // programmatic scroll target API for anchors opened outside a rendered link.
  }, [onOpenFile, onOpenSearch, vaultId, apiClient, searchDispatch])

  // ─── Context menu ────────────────────────────────────────────────────────

  const openContextMenu = useCallback((entry: FavoriteEntry, x: number, y: number) => {
    setContextMenu({ entry, x, y })
  }, [])

  const handleContextMenuTrigger = useCallback((e: React.MouseEvent, entry: FavoriteEntry) => {
    e.preventDefault()
    openContextMenu(entry, e.clientX, e.clientY)
  }, [openContextMenu])

  const handleKeyDownEntry = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, entry: FavoriteEntry) => {
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      openContextMenu(entry, rect.left, rect.bottom)
    }
  }, [openContextMenu])

  const handleRemove = useCallback((entry: FavoriteEntry) => {
    if (!vaultId) return
    favoritesStore.removeById(vaultId, entry.id)
    refresh()
  }, [vaultId, refresh])

  const handleReveal = useCallback((entry: FavoriteEntry) => {
    if (entry.type === 'search') return
    // Switch whichever split section is currently showing Favorites over to
    // the Explorer view, then ask FileExplorer to expand/scroll to the path
    // (same event 'file-explorer:reveal-active-file' dispatches).
    const section = panelState.sections.find((s) => s.activeViewId === 'favorites')
    if (section) {
      panelDispatch({ type: 'SET_ACTIVE_VIEW', sectionId: section.id, viewId: 'explorer' })
    }
    requestReveal(entry.path)
  }, [panelState.sections, panelDispatch])

  const handleRenameStart = useCallback((entry: FavoriteEntry) => {
    setRenamingId(entry.id)
  }, [])

  const handleRenameConfirm = useCallback((entry: FavoriteEntry, value: string) => {
    if (!vaultId) return
    const currentDefault = getEntryDisplayText({ ...entry, label: undefined })
    favoritesStore.setLabel(vaultId, entry.id, value === currentDefault ? null : value)
    setRenamingId(null)
    refresh()
  }, [vaultId, refresh])

  const handleContextMenuSelect = useCallback((action: string) => {
    if (!contextMenu) return
    const { entry } = contextMenu
    if (action === 'remove') handleRemove(entry)
    else if (action === 'reveal') handleReveal(entry)
    else if (action === 'rename') handleRenameStart(entry)
  }, [contextMenu, handleRemove, handleReveal, handleRenameStart])

  // ─── Drag and drop reorder (Requirement 1) ──────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, entry: FavoriteEntry) => {
    setDragId(entry.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', entry.id)
  }, [])

  const handleDragOverItem = useCallback((e: React.DragEvent, index: number) => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }, [dragId])

  const handleDragEnd = useCallback(() => {
    setDragId(null)
    setDropIndex(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (!vaultId || !dragId) return
    favoritesStore.reorder(vaultId, dragId, index)
    setDragId(null)
    setDropIndex(null)
    refresh()
  }, [vaultId, dragId, refresh])

  const handleListDragLeave = useCallback((e: React.DragEvent) => {
    if (listRef.current && !listRef.current.contains(e.relatedTarget as Node)) {
      setDropIndex(null)
    }
  }, [])

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

  const menuItems: ContextMenuItem[] = contextMenu ? [
    ...(contextMenu.entry.type !== 'search' ? [{ id: 'reveal', label: 'Im Datei-Explorer anzeigen' }] : []),
    { id: 'rename', label: 'Umbenennen' },
    { id: 'remove', label: 'Aus Favoriten entfernen' },
  ] : []

  return (
    <div className="favorites-view" role="region" aria-label="Favoriten">
      <ul
        className="favorites-view__list"
        role="list"
        ref={listRef}
        onDragLeave={handleListDragLeave}
      >
        {favorites.map((entry, index) => {
          const displayText = getEntryDisplayText(entry)
          const isDragging = dragId === entry.id
          const showDropMarkerBefore = dropIndex === index && dragId !== null && dragId !== entry.id

          return (
            <li
              key={entry.id}
              className={`favorites-view__item${isDragging ? ' favorites-view__item--dragging' : ''}${showDropMarkerBefore ? ' favorites-view__item--drop-before' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, entry)}
              onDragOver={(e) => handleDragOverItem(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              {renamingId === entry.id ? (
                <InlineInput
                  initialValue={displayText}
                  onConfirm={(value) => handleRenameConfirm(entry, value)}
                  onCancel={() => setRenamingId(null)}
                  validate={() => null}
                />
              ) : (
                <button
                  className="favorites-view__entry"
                  onClick={() => handleEntryClick(entry)}
                  onContextMenu={(e) => handleContextMenuTrigger(e, entry)}
                  onKeyDown={(e) => handleKeyDownEntry(e, entry)}
                  title={getEntryTooltip(entry)}
                  type="button"
                >
                  <span className={`favorites-view__file-icon ${entryIconClass(entry)}`}>
                    <EntryIcon entry={entry} />
                  </span>
                  <span className="favorites-view__file-name">{displayText}</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
          onSelect={handleContextMenuSelect}
        />
      )}
    </div>
  )
}
