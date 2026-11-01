/**
 * FavoritesView — displays all bookmarks for the current vault as a standalone view.
 * Used as a tab in the sidebar panel (not the collapsible section in FileExplorer).
 *
 * Supports the four bookmark types (file/heading/block/search — Requirements
 * 11-14), groups that nest and fold (Obsidian's bookmark groups), manual
 * drag-and-drop reordering and moving into groups (Requirement 1), a context
 * menu for remove/reveal/rename/move (Requirement 2), and custom display
 * labels (Requirement 3).
 */

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import {
  Star, StarOff, Heading, Hash, Search as SearchIcon, FolderOpen, Folder, FolderPlus, FolderInput,
  ChevronRight, ChevronDown, CornerLeftUp, Pencil, Trash2,
} from 'lucide-react'
import { favoritesStore, groupByParent, onFavoritesChange, withDescendants } from '../../state/favoritesStore'
import { requestReveal } from '../../state/revealFileBridge'
import { useSearchContext } from '../../state/searchContext'
import { useAppContext } from '../../state'
import { performSearch } from '../../state/searchActions'
import { getFileIcon, getFileIconClass, getDisplayName } from '../../utils/fileIcons'
import { ContextMenu, type ContextMenuItem } from '../ContextMenu'
import { ConfirmModal } from '../ConfirmModal'
import { InlineInput } from '../InlineInput'
import type { FavoriteEntry } from '../../state/favoritesStore'
import type { PanelState, PanelAction } from '../../state/panelState'
import type { Dispatch } from 'react'
import { useLongPress } from '../../hooks/useLongPress'
import { useTranslation } from '../../i18n'
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

/** One visible line of the list: an entry, how deep it sits, and the group (null: top level) it is in. */
interface Row {
  entry: FavoriteEntry
  depth: number
  parent: string | null
}

/** Where a dragged entry would land: before a row, or (on a group) inside it. */
interface DropTarget {
  id: string
  mode: 'before' | 'into'
}

const isGroup = (entry: FavoriteEntry): boolean => entry.type === 'group'

/** Extracts the filename from a full path. */
function getFileName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

/** Display text for an entry: label override, or a type-appropriate default. */
function getEntryDisplayText(entry: FavoriteEntry, groupName: string): string {
  if (entry.label) return entry.label
  switch (entry.type ?? 'file') {
    case 'group':
      return groupName
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
    case 'group':
      return entry.label ?? ''
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

/** The visible lines, depth first; the content of a folded group is left out. */
function buildRows(byParent: Map<string | null, FavoriteEntry[]>, collapsed: Set<string>): Row[] {
  const rows: Row[] = []
  const walk = (parent: string | null, depth: number): void => {
    for (const entry of byParent.get(parent) ?? []) {
      rows.push({ entry, depth, parent })
      if (isGroup(entry) && !collapsed.has(entry.id)) walk(entry.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

/**
 * Displays all bookmarks for the current vault.
 * Each entry shows a type-appropriate icon + display text and resolves the
 * click according to its bookmark type. Groups fold and unfold. Supports
 * drag-and-drop reordering and moving into groups, a context menu
 * (remove/reveal/rename/move), and custom labels.
 */
export function FavoritesView({ vaultId, onOpenFile, onOpenSearch, refreshKey: _refreshKey, panelState, panelDispatch }: FavoritesViewProps): React.ReactElement {
  const longPress = useLongPress()
  const { t } = useTranslation()
  const groupName = t('bookmarkGroups.defaultName')
  const { dispatch: searchDispatch } = useSearchContext()
  const { apiClient } = useAppContext()
  const [internalRefreshTick, setInternalRefreshTick] = useState(0)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [groupToDelete, setGroupToDelete] = useState<FavoriteEntry | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const favorites: FavoriteEntry[] = useMemo(
    () => vaultId ? favoritesStore.getForVault(vaultId) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vaultId, _refreshKey, internalRefreshTick]
  )
  const byParent = useMemo(() => groupByParent(favorites), [favorites])
  const rows = useMemo(() => buildRows(byParent, collapsed), [byParent, collapsed])

  const refresh = useCallback(() => setInternalRefreshTick((n) => n + 1), [])

  // The vault's bookmarks.json was read (vault opened, or changed by Obsidian, a sync or another user).
  useEffect(() => onFavoritesChange(refresh), [refresh])

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleEntryClick = useCallback((entry: FavoriteEntry) => {
    const type = entry.type ?? 'file'
    if (type === 'group') {
      toggleCollapsed(entry.id)
      return
    }
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
  }, [onOpenFile, onOpenSearch, vaultId, apiClient, searchDispatch, toggleCollapsed])

  // ─── Groups ──────────────────────────────────────────────────────────────

  /** Adds a group (inside `parentId` if given) and puts its name into edit mode. */
  const handleAddGroup = useCallback((parentId?: string) => {
    if (!vaultId) return
    const id = favoritesStore.addGroup(vaultId, t('bookmarkGroups.newGroup'), parentId)
    if (id === null) return
    if (parentId !== undefined) {
      setCollapsed((prev) => {
        if (!prev.has(parentId)) return prev
        const next = new Set(prev)
        next.delete(parentId)
        return next
      })
    }
    setRenamingId(id)
    refresh()
  }, [vaultId, refresh, t])

  const handleMove = useCallback((entry: FavoriteEntry, parentId: string | null) => {
    if (!vaultId) return
    favoritesStore.moveEntry(vaultId, entry.id, parentId)
    if (parentId !== null) {
      setCollapsed((prev) => {
        if (!prev.has(parentId)) return prev
        const next = new Set(prev)
        next.delete(parentId)
        return next
      })
    }
    refresh()
  }, [vaultId, refresh])

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
    // A group with content asks first: the content goes with it, also what is not shown here
    // (folders, URLs and the like in a group made in Obsidian)
    if (isGroup(entry) && favoritesStore.groupContentCount(vaultId, entry.id) > 0) {
      setGroupToDelete(entry)
      return
    }
    favoritesStore.removeById(vaultId, entry.id)
    refresh()
  }, [vaultId, refresh])

  const handleReveal = useCallback((entry: FavoriteEntry) => {
    if (entry.type === 'search' || isGroup(entry)) return
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
    const currentDefault = getEntryDisplayText({ ...entry, label: undefined }, groupName)
    favoritesStore.setLabel(vaultId, entry.id, value === currentDefault ? null : value)
    setRenamingId(null)
    refresh()
  }, [vaultId, refresh, groupName])

  const handleContextMenuSelect = useCallback((action: string) => {
    if (!contextMenu) return
    const { entry } = contextMenu
    if (action === 'remove') handleRemove(entry)
    else if (action === 'reveal') handleReveal(entry)
    else if (action === 'rename') handleRenameStart(entry)
    else if (action === 'new-group') handleAddGroup(entry.id)
    else if (action === 'ungroup') handleMove(entry, null)
    else if (action.startsWith('move:')) handleMove(entry, action.slice('move:'.length))
  }, [contextMenu, handleRemove, handleReveal, handleRenameStart, handleAddGroup, handleMove])

  // ─── Drag and drop: reorder and move into groups (Requirement 1) ─────────

  const handleDragStart = useCallback((e: React.DragEvent, entry: FavoriteEntry) => {
    setDragId(entry.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', entry.id)
  }, [])

  const handleDragOverItem = useCallback((e: React.DragEvent, row: Row) => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // On a group, the upper part puts the entry before it, the rest puts it inside
    let mode: DropTarget['mode'] = 'before'
    if (isGroup(row.entry)) {
      const rect = e.currentTarget.getBoundingClientRect()
      if (e.clientY - rect.top > rect.height * 0.3) mode = 'into'
    }
    setDropTarget((prev) => (prev?.id === row.entry.id && prev.mode === mode ? prev : { id: row.entry.id, mode }))
  }, [dragId])

  const handleDragEnd = useCallback(() => {
    setDragId(null)
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, row: Row) => {
    e.preventDefault()
    const mode = dropTarget?.id === row.entry.id ? dropTarget.mode : 'before'
    if (vaultId && dragId && dragId !== row.entry.id) {
      if (mode === 'into') {
        favoritesStore.moveEntry(vaultId, dragId, row.entry.id)
        // A folded group opens, so the entry does not seem to be gone
        setCollapsed((prev) => {
          if (!prev.has(row.entry.id)) return prev
          const next = new Set(prev)
          next.delete(row.entry.id)
          return next
        })
      } else {
        // The entry takes the place of the one it is dropped on (so moving down puts it after that one,
        // moving up before it): the target's position among the entries of that level
        const siblings = byParent.get(row.parent) ?? []
        favoritesStore.moveEntry(vaultId, dragId, row.parent, Math.max(0, siblings.findIndex((s) => s.id === row.entry.id)))
      }
    }
    setDragId(null)
    setDropTarget(null)
    refresh()
  }, [vaultId, dragId, dropTarget, byParent, refresh])

  const handleListDragLeave = useCallback((e: React.DragEvent) => {
    if (listRef.current && !listRef.current.contains(e.relatedTarget as Node)) {
      setDropTarget(null)
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

  const toolbar = (
    <div className="favorites-view__toolbar">
      <button
        type="button"
        className="favorites-view__toolbar-button"
        onClick={() => handleAddGroup()}
        aria-label={t('bookmarkGroups.newGroup')}
        title={t('bookmarkGroups.newGroup')}
      >
        <FolderPlus size={14} />
      </button>
    </div>
  )

  if (favorites.length === 0) {
    return (
      <div className="favorites-view" role="region" aria-label="Favoriten">
        {toolbar}
        <div className="favorites-view--empty favorites-view__empty-body">
          <Star size={24} className="favorites-view__empty-icon" />
          <span className="favorites-view__empty-text">Keine Favoriten in diesem Vault</span>
        </div>
      </div>
    )
  }

  // Groups the entry could be moved into: every group but itself and what sits inside it
  const moveTargets = (entry: FavoriteEntry): FavoriteEntry[] =>
    favorites.filter((g) => isGroup(g) && g.id !== entry.parentId && !withDescendants(byParent, entry.id).has(g.id))

  const menuItems: ContextMenuItem[] = contextMenu ? [
    ...(contextMenu.entry.type !== 'search' && !isGroup(contextMenu.entry) ? [{ id: 'reveal', label: 'Im Datei-Explorer anzeigen', icon: <FolderOpen size={14} /> }] : []),
    { id: 'rename', label: 'Umbenennen', icon: <Pencil size={14} /> },
    ...(isGroup(contextMenu.entry) ? [{ id: 'new-group', label: t('bookmarkGroups.newSubgroup'), icon: <FolderPlus size={14} /> }] : []),
    ...moveTargets(contextMenu.entry).map((g) => ({ id: `move:${g.id}`, label: t('bookmarkGroups.moveTo', { name: getEntryDisplayText(g, groupName) }), icon: <FolderInput size={14} /> })),
    ...(contextMenu.entry.parentId !== undefined && favorites.some((g) => g.id === contextMenu.entry.parentId)
      ? [{ id: 'ungroup', label: t('bookmarkGroups.ungroup'), icon: <CornerLeftUp size={14} /> }]
      : []),
    isGroup(contextMenu.entry)
      ? { id: 'remove', label: t('bookmarkGroups.deleteGroup'), icon: <Trash2 size={14} /> }
      : { id: 'remove', label: 'Aus Favoriten entfernen', icon: <StarOff size={14} /> },
  ] : []

  return (
    <div className="favorites-view" role="region" aria-label="Favoriten">
      {toolbar}
      <ul
        className="favorites-view__list"
        role="list"
        ref={listRef}
        onDragLeave={handleListDragLeave}
      >
        {rows.map((row) => {
          const { entry, depth } = row
          const displayText = getEntryDisplayText(entry, groupName)
          const group = isGroup(entry)
          const folded = group && collapsed.has(entry.id)
          const isDragging = dragId === entry.id
          const isTarget = dropTarget?.id === entry.id && dragId !== null && dragId !== entry.id
          const showDropMarkerBefore = isTarget && dropTarget.mode === 'before'
          const showDropMarkerInto = isTarget && dropTarget.mode === 'into'

          return (
            <li
              key={entry.id}
              className={`favorites-view__item${isDragging ? ' favorites-view__item--dragging' : ''}${showDropMarkerBefore ? ' favorites-view__item--drop-before' : ''}${showDropMarkerInto ? ' favorites-view__item--drop-into' : ''}${group ? ' favorites-view__item--group' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, entry)}
              onDragOver={(e) => handleDragOverItem(e, row)}
              onDrop={(e) => handleDrop(e, row)}
              onDragEnd={handleDragEnd}
            >
              {renamingId === entry.id ? (
                <div style={{ paddingLeft: depth * 14 }}>
                  <InlineInput
                    initialValue={displayText}
                    onConfirm={(value) => handleRenameConfirm(entry, value)}
                    onCancel={() => setRenamingId(null)}
                    validate={() => null}
                  />
                </div>
              ) : (
                <button
                  className="favorites-view__entry"
                  style={depth > 0 ? { paddingLeft: 12 + depth * 14 } : undefined}
                  onClick={() => handleEntryClick(entry)}
                  onContextMenu={(e) => handleContextMenuTrigger(e, entry)}
                  {...longPress}
                  onKeyDown={(e) => handleKeyDownEntry(e, entry)}
                  title={getEntryTooltip(entry)}
                  type="button"
                  {...(group ? { 'aria-expanded': !folded } : {})}
                >
                  {group && (
                    <span className="favorites-view__chevron">
                      {folded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    </span>
                  )}
                  <span className={`favorites-view__file-icon ${entryIconClass(entry)}`}>
                    {group ? (folded ? <Folder size={14} /> : <FolderOpen size={14} />) : <EntryIcon entry={entry} />}
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

      <ConfirmModal
        open={groupToDelete !== null}
        title={t('bookmarkGroups.deleteGroup')}
        message={groupToDelete
          ? t('bookmarkGroups.deleteMessage', { name: getEntryDisplayText(groupToDelete, groupName) })
          : ''}
        confirmLabel={t('bookmarkGroups.delete')}
        onConfirm={() => {
          if (vaultId && groupToDelete) favoritesStore.removeById(vaultId, groupToDelete.id)
          setGroupToDelete(null)
          refresh()
        }}
        onCancel={() => setGroupToDelete(null)}
      />
    </div>
  )
}
