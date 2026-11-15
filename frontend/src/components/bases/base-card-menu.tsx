/**
 * Right-click menu shared by the Bases card surfaces (Kanban board, card grid):
 * open, rename, move, delete, bookmark and the like for the note a card stands for.
 * Rename, move and delete go through the File Explorer's own flows, so tree, tabs
 * and bookmarks are updated the same way as everywhere else.
 */
import { createElement, useCallback, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import { ExternalLink, PanelRight, Pencil, FolderInput, Trash2, Bookmark, BookmarkMinus, FolderOpen, Link } from 'lucide-react'
import { ContextMenu } from '../ContextMenu'
import type { ContextMenuItem } from '../ContextMenu'
import * as favoritesStore from '../../state/favoritesStore'
import { revealInExplorer, renameInExplorer, deleteInExplorer, moveInExplorer } from '../../state/fileNavigation'
import { requestOpenInSplit } from '../../state/openInSplitBridge'
import { copyLinkWithFeedback } from '../../deep-link/copyDeepLink'
import { buildTFileFromPath } from '../../plugins/compat/plugin-event-bridge'
import { buildPluginMenuItems } from '../../plugins/compat/plugin-menu-bridge'

const ICON_SIZE = 14

interface MenuState {
  x: number
  y: number
  path: string
}

/** Builds the menu entries for one card. Pure apart from the callbacks it wires up. */
export function buildCardMenuItems(
  vaultId: string,
  path: string,
  onOpenNote: (path: string) => void,
  readOnly: boolean,
): ContextMenuItem[] {
  const fileName = path.split('/').pop() ?? path
  const bookmarked = favoritesStore.isFavorite(vaultId, path)
  const items: ContextMenuItem[] = [
    { id: 'open-tab', label: 'In Tab öffnen', icon: createElement(ExternalLink, { size: ICON_SIZE }), run: () => onOpenNote(path) },
    {
      id: 'open-split',
      label: 'In geteiltem Bereich öffnen',
      icon: createElement(PanelRight, { size: ICON_SIZE }),
      run: () => requestOpenInSplit(vaultId, path, fileName),
    },
    { id: 'sep-edit', label: '', separator: true },
    { id: 'rename', label: 'Umbenennen', icon: createElement(Pencil, { size: ICON_SIZE }), disabled: readOnly, run: () => renameInExplorer(path) },
    { id: 'move', label: 'Verschieben nach …', icon: createElement(FolderInput, { size: ICON_SIZE }), disabled: readOnly, run: () => moveInExplorer(path) },
    { id: 'delete', label: 'Löschen', icon: createElement(Trash2, { size: ICON_SIZE }), disabled: readOnly, run: () => deleteInExplorer(path) },
    { id: 'sep-more', label: '', separator: true },
    {
      id: 'bookmark',
      label: bookmarked ? 'Lesezeichen entfernen' : 'Lesezeichen setzen',
      icon: createElement(bookmarked ? BookmarkMinus : Bookmark, { size: ICON_SIZE }),
      run: () => (bookmarked ? favoritesStore.remove(vaultId, path) : favoritesStore.add(vaultId, path)),
    },
    { id: 'reveal', label: 'Im Explorer zeigen', icon: createElement(FolderOpen, { size: ICON_SIZE }), run: () => revealInExplorer(path) },
    { id: 'copy-link', label: 'Link kopieren', icon: createElement(Link, { size: ICON_SIZE }), run: () => { void copyLinkWithFeedback(vaultId, path) } },
  ]
  items.push(...buildPluginMenuItems('file-menu', [buildTFileFromPath(path), 'bases-card'], 'bases-card-plugin-menu'))
  return items
}

/**
 * Returns `openMenu` (attach as `onContextMenu` of a card) and the `menu` element
 * to render once in the view. Does nothing without a `vaultId`.
 */
export function useCardContextMenu(
  vaultId: string | undefined,
  onOpenNote: (path: string) => void,
  readOnly = false,
): { openMenu: (e: ReactMouseEvent, path: string) => void; menu: ReactElement | null } {
  const [state, setState] = useState<MenuState | null>(null)
  const openMenu = useCallback(
    (e: ReactMouseEvent, path: string) => {
      if (!vaultId) return
      e.preventDefault()
      setState({ x: e.clientX, y: e.clientY, path })
    },
    [vaultId],
  )
  const menu = state && vaultId
    ? (
      <ContextMenu
        x={state.x}
        y={state.y}
        items={buildCardMenuItems(vaultId, state.path, onOpenNote, readOnly)}
        onClose={() => setState(null)}
        onSelect={() => {}}
      />
    )
    : null
  return { openMenu, menu }
}
