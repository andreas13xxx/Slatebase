/**
 * Builds the tab-header right-click context menu.
 *
 * Fires `file-menu` with `source: 'tab-header'` for regular file tabs so
 * plugins can extend it exactly as they would in real Obsidian (Obsidian
 * fires `file-menu` for the tab-header menu too, not a separate event).
 *
 * @module tab-context-menu
 */
import { createElement } from 'react'
import { X, CopyX, PanelRightClose, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import type { ContextMenuItem } from './ContextMenu'
import type { TabEntry } from '../state/tabState'
import type { TabAction } from '../state/tabState'
import { buildTFileFromPath } from '../plugins/compat/plugin-event-bridge'
import { buildPluginMenuItems } from '../plugins/compat/plugin-menu-bridge'
import { revealInExplorer, renameInExplorer, deleteInExplorer } from '../state/fileNavigation'

const VIEW_PATH_PREFIX = '__view::'
const ICON_SIZE = 14

export function buildTabContextMenuItems(
  tab: TabEntry,
  isLastTab: boolean,
  tabDispatch: (action: TabAction) => void,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    { id: 'close', label: 'Tab schließen', icon: createElement(X, { size: ICON_SIZE }), run: () => tabDispatch({ type: 'CLOSE_TAB', payload: { tabId: tab.id } }) },
    { id: 'close-others', label: 'Andere schließen', icon: createElement(CopyX, { size: ICON_SIZE }), run: () => tabDispatch({ type: 'CLOSE_OTHER_TABS', payload: { tabId: tab.id } }) },
    {
      id: 'close-to-right',
      label: 'Alle rechts schließen',
      icon: createElement(PanelRightClose, { size: ICON_SIZE }),
      disabled: isLastTab,
      run: () => tabDispatch({ type: 'CLOSE_TABS_TO_RIGHT', payload: { tabId: tab.id } }),
    },
  ]

  const isRegularFile = tab.filePath !== '__graph__' && !tab.filePath.startsWith(VIEW_PATH_PREFIX)
  if (!isRegularFile) return items

  items.push(
    { id: 'sep-file-ops', label: '', separator: true },
    { id: 'reveal', label: 'Im Explorer zeigen', icon: createElement(FolderOpen, { size: ICON_SIZE }), run: () => revealInExplorer(tab.filePath) },
    { id: 'rename', label: 'Umbenennen', icon: createElement(Pencil, { size: ICON_SIZE }), run: () => renameInExplorer(tab.filePath) },
    { id: 'delete', label: 'Löschen', icon: createElement(Trash2, { size: ICON_SIZE }), run: () => deleteInExplorer(tab.filePath) },
  )

  const file = buildTFileFromPath(tab.filePath)
  items.push(...buildPluginMenuItems('file-menu', [file, 'tab-header'], 'tab-header-plugin-menu'))

  return items
}
