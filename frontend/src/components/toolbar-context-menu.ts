/**
 * Builds the two context menus of the app toolbar (Werkzeugleiste):
 *
 * - `buildToolbarContextMenuItems` — right-click on the toolbar background:
 *   per-button visibility, docking side, reset, and hiding the whole bar.
 * - `buildToolbarButtonContextMenuItems` — right-click on a single button:
 *   hide it, move it, or give it a colour. The toolbar-level entries are
 *   repeated in a submenu at the bottom, because a densely packed toolbar can
 *   leave no empty background to right-click.
 *
 * Both menus are built from the same entry list regardless of whether an entry
 * is a built-in button or a plugin ribbon icon — see SidebarToolbar.
 *
 * @module components/toolbar-context-menu
 */
import { createElement } from 'react'
import {
  EyeOff, Eye, ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine,
  Palette, PanelLeft, PanelRight, RotateCcw, Wrench,
} from 'lucide-react'
import type { ContextMenuItem } from './ContextMenu'
import {
  TOOLBAR_COLORS,
  setToolbarPosition,
  setToolbarVisible,
  toggleEntryHidden,
  setEntryColor,
  moveEntry,
  resetToolbarLayout,
  type ToolbarPosition,
} from '../state/toolbarStore'

const ICON_SIZE = 14

/** The minimum an entry has to expose for the menus to describe it. */
export interface ToolbarMenuEntry {
  id: string
  label: string
  hidden: boolean
}

/** Renders a filled circle in the entry colour, used in the colour submenu. */
function colorSwatch(color: string): React.ReactNode {
  return createElement('span', {
    className: 'toolbar-color-swatch',
    style: { background: color },
    'aria-hidden': true,
  })
}

/**
 * Right-click menu for the toolbar background.
 *
 * @param entries - Every toolbar entry (including hidden ones), in display order.
 * @param position - Current docking side.
 */
export function buildToolbarContextMenuItems(
  entries: ToolbarMenuEntry[],
  position: ToolbarPosition,
): ContextMenuItem[] {
  return [
    {
      id: 'toolbar-buttons',
      label: 'Buttons',
      icon: createElement(Eye, { size: ICON_SIZE }),
      submenu: entries.map((entry) => ({
        id: `toggle-${entry.id}`,
        label: entry.label,
        checked: !entry.hidden,
        // Toggling several buttons in one pass is the normal case here, so the
        // menu deliberately stays open (ContextMenuItem.keepOpen).
        keepOpen: true,
        run: () => toggleEntryHidden(entry.id),
      })),
    },
    {
      id: 'toolbar-position',
      label: 'Position',
      icon: createElement(position === 'left' ? PanelLeft : PanelRight, { size: ICON_SIZE }),
      submenu: [
        {
          id: 'position-left',
          label: 'Links vom Editor',
          checked: position === 'left',
          icon: createElement(PanelLeft, { size: ICON_SIZE }),
          run: () => setToolbarPosition('left'),
        },
        {
          id: 'position-right',
          label: 'Rechts vom Editor',
          checked: position === 'right',
          icon: createElement(PanelRight, { size: ICON_SIZE }),
          run: () => setToolbarPosition('right'),
        },
      ],
    },
    { id: 'sep-toolbar', label: '', separator: true },
    {
      id: 'toolbar-reset',
      label: 'Layout zurücksetzen',
      icon: createElement(RotateCcw, { size: ICON_SIZE }),
      run: () => resetToolbarLayout(),
    },
    {
      id: 'toolbar-hide',
      label: 'Werkzeugleiste ausblenden',
      icon: createElement(EyeOff, { size: ICON_SIZE }),
      run: () => setToolbarVisible(false),
    },
  ]
}

/**
 * Right-click menu for a single toolbar button.
 *
 * @param entryId - The button that was right-clicked.
 * @param visibleIds - Ids of the currently rendered buttons, in display order —
 *   moves are relative to what the user can actually see.
 * @param currentColor - The button's colour override, if any.
 * @param allEntries - Every entry, for the nested toolbar submenu.
 * @param position - Current docking side, for the nested toolbar submenu.
 */
export function buildToolbarButtonContextMenuItems(
  entryId: string,
  visibleIds: string[],
  currentColor: string | undefined,
  allEntries: ToolbarMenuEntry[],
  position: ToolbarPosition,
): ContextMenuItem[] {
  const index = visibleIds.indexOf(entryId)
  const isFirst = index <= 0
  const isLast = index === -1 || index === visibleIds.length - 1

  return [
    {
      id: 'hide',
      label: 'Ausblenden',
      icon: createElement(EyeOff, { size: ICON_SIZE }),
      run: () => toggleEntryHidden(entryId),
    },
    { id: 'sep-move', label: '', separator: true },
    {
      id: 'move-up',
      label: 'Nach vorn verschieben',
      icon: createElement(ArrowUp, { size: ICON_SIZE }),
      disabled: isFirst,
      run: () => moveEntry(entryId, 'up', visibleIds),
    },
    {
      id: 'move-down',
      label: 'Nach hinten verschieben',
      icon: createElement(ArrowDown, { size: ICON_SIZE }),
      disabled: isLast,
      run: () => moveEntry(entryId, 'down', visibleIds),
    },
    {
      id: 'move-start',
      label: 'An den Anfang verschieben',
      icon: createElement(ArrowUpToLine, { size: ICON_SIZE }),
      disabled: isFirst,
      run: () => moveEntry(entryId, 'start', visibleIds),
    },
    {
      id: 'move-end',
      label: 'An das Ende verschieben',
      icon: createElement(ArrowDownToLine, { size: ICON_SIZE }),
      disabled: isLast,
      run: () => moveEntry(entryId, 'end', visibleIds),
    },
    { id: 'sep-color', label: '', separator: true },
    {
      id: 'color',
      label: 'Farbe wählen',
      icon: createElement(Palette, { size: ICON_SIZE }),
      submenu: TOOLBAR_COLORS.map((color) => ({
        id: `color-${color.id}`,
        label: color.label,
        checked: color.value === null ? currentColor === undefined : currentColor === color.value,
        icon: color.value === null ? undefined : colorSwatch(color.value),
        run: () => setEntryColor(entryId, color.value),
      })),
    },
    { id: 'sep-toolbar-submenu', label: '', separator: true },
    {
      id: 'toolbar',
      label: 'Werkzeugleiste',
      icon: createElement(Wrench, { size: ICON_SIZE }),
      submenu: buildToolbarContextMenuItems(allEntries, position),
    },
  ]
}
