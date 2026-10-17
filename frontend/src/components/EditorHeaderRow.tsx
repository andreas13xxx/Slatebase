import { useState, type ReactNode } from 'react'
import { MoreHorizontal, Columns2, Rows2, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, X, PanelTopClose } from 'lucide-react'
import { useTranslation } from '../i18n'
import { usePaneTree } from '../state/paneTreeContext'
import { generatePaneId, getActivePaneTabState, listPanes, type SplitDirection } from '../state/paneTreeState'
import { findPaneInDirection, type FocusDirection, type PaneRect } from './panes/pane-focus-direction'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { NavigationControls } from './NavigationControls'

const ICON_SIZE = 14

export interface EditorHeaderRowProps {
  /** Breadcrumb (or nothing) shown between the navigation buttons and the menu. */
  children?: ReactNode
}

/**
 * Row below the tab bar: back/forward on the left, the breadcrumb in the
 * middle and a "…" menu with pane commands on the right.
 */
export function EditorHeaderRow({ children }: EditorHeaderRowProps) {
  const { t } = useTranslation()
  const { paneTree, paneTreeDispatch } = usePaneTree()
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  const paneCount = listPanes(paneTree).length
  const activeTabId = getActivePaneTabState(paneTree)?.activeTabId ?? null

  function split(direction: SplitDirection) {
    if (!activeTabId) return
    paneTreeDispatch({
      type: 'SPLIT_PANE_WITH_TAB',
      payload: { paneId: paneTree.activePaneId, direction, newPaneId: generatePaneId(), tabId: activeTabId, copy: true },
    })
  }

  // Pane geometry only exists in the DOM (see the `onFocusPaneDirection` handler
  // in CommandPaletteContainer, which does the same lookup).
  function focus(direction: FocusDirection) {
    const rects: PaneRect[] = Array.from(
      document.querySelectorAll<HTMLElement>('.pane-leaf[data-pane-id]'),
    ).map((el) => {
      const r = el.getBoundingClientRect()
      return { paneId: el.dataset.paneId ?? '', left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    })
    const targetId = findPaneInDirection(rects, paneTree.activePaneId, direction)
    if (targetId) paneTreeDispatch({ type: 'FOCUS_PANE', payload: { paneId: targetId } })
  }

  function closeOthers() {
    for (const pane of listPanes(paneTree)) {
      if (pane.id !== paneTree.activePaneId) paneTreeDispatch({ type: 'CLOSE_PANE', payload: { paneId: pane.id } })
    }
  }

  function buildItems(): ContextMenuItem[] {
    const multi = paneCount > 1
    const icon = (Icon: typeof X) => <Icon size={ICON_SIZE} />
    return [
      { id: 'split-right', label: t('splitPanes.splitRight'), icon: icon(Columns2), disabled: !activeTabId, run: () => split('horizontal') },
      { id: 'split-down', label: t('splitPanes.splitDown'), icon: icon(Rows2), disabled: !activeTabId, run: () => split('vertical') },
      { id: 'sep-focus', label: '', separator: true },
      { id: 'focus-left', label: t('splitPanes.focusLeft'), icon: icon(ArrowLeft), disabled: !multi, run: () => focus('left') },
      { id: 'focus-right', label: t('splitPanes.focusRight'), icon: icon(ArrowRight), disabled: !multi, run: () => focus('right') },
      { id: 'focus-up', label: t('splitPanes.focusUp'), icon: icon(ArrowUp), disabled: !multi, run: () => focus('up') },
      { id: 'focus-down', label: t('splitPanes.focusDown'), icon: icon(ArrowDown), disabled: !multi, run: () => focus('down') },
      { id: 'sep-close', label: '', separator: true },
      { id: 'close-pane', label: t('splitPanes.closePane'), icon: icon(X), disabled: !multi, run: () => paneTreeDispatch({ type: 'CLOSE_PANE', payload: { paneId: paneTree.activePaneId } }) },
      { id: 'close-others', label: t('splitPanes.closeOtherPanes'), icon: icon(PanelTopClose), disabled: !multi, run: closeOthers },
    ]
  }

  return (
    <div className="editor-header-row">
      <NavigationControls />
      <div className="editor-header-row__center">{children}</div>
      <button
        type="button"
        className="nav-controls-button editor-header-row__menu"
        aria-label={t('splitPanes.menuLabel')}
        aria-haspopup="menu"
        aria-expanded={menuPos !== null}
        title={t('splitPanes.menuLabel')}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMenuPos({ x: r.right, y: r.bottom })
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          items={buildItems()}
          onClose={() => setMenuPos(null)}
          onSelect={() => setMenuPos(null)}
        />
      )}
    </div>
  )
}
