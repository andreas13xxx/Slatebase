import { useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal, Columns2, Rows2, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, X, PanelTopClose } from 'lucide-react'
import { useTranslation } from '../i18n'
import { usePaneTree } from '../state/paneTreeContext'
import { findPane, getActivePaneTabState, listPanes, type PaneNode } from '../state/paneTreeState'
import { splitActivePane, focusPaneInDirection } from './panes/pane-commands'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { NavigationControls } from './NavigationControls'

const ICON_SIZE = 14

export interface EditorHeaderRowProps {
  /** Breadcrumb (or nothing) shown between the navigation buttons and the menu. */
  children?: ReactNode
  /** Hides the pane menu, e.g. while a settings page covers the panes. Default true. */
  showPaneMenu?: boolean
}

/** True if any tab of the pane holds edits that closing the pane would discard. */
function hasUnsavedTabs(pane: PaneNode): boolean {
  return pane.tabState.tabs.some((tab) => tab.editBuffer !== null && tab.editBuffer !== tab.content)
}

/**
 * Row below the tab bar: back/forward on the left, the breadcrumb in the
 * middle and a "…" menu with pane commands on the right.
 */
export function EditorHeaderRow({ children, showPaneMenu = true }: EditorHeaderRowProps) {
  const { t } = useTranslation()
  const { paneTree, paneTreeDispatch } = usePaneTree()
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  // ContextMenu closes on an outside mousedown, which includes this very button;
  // remember that it was open at press time so the click toggles instead of reopening.
  const wasOpenOnPressRef = useRef(false)

  const paneCount = listPanes(paneTree).length
  const activeTabId = getActivePaneTabState(paneTree)?.activeTabId ?? null

  /** The menu items are rebuilt on every render, so this sees the latest tree and unsaved edits. */
  function closeOthers() {
    const others = listPanes(paneTree).filter((p) => p.id !== paneTree.activePaneId)
    if (others.some(hasUnsavedTabs)) return
    for (const pane of others) paneTreeDispatch({ type: 'CLOSE_PANE', payload: { paneId: pane.id } })
  }

  function closeActivePane() {
    const active = findPane(paneTree, paneTree.activePaneId)
    if (!active || hasUnsavedTabs(active)) return
    paneTreeDispatch({ type: 'CLOSE_PANE', payload: { paneId: active.id } })
  }

  function buildItems(): ContextMenuItem[] {
    const multi = paneCount > 1
    const others = listPanes(paneTree).filter((p) => p.id !== paneTree.activePaneId)
    const activePane = findPane(paneTree, paneTree.activePaneId)
    // Closing a pane drops its tabs without a save prompt, so refuse while edits are pending.
    const canClosePane = multi && activePane !== null && !hasUnsavedTabs(activePane)
    const canCloseOthers = multi && !others.some(hasUnsavedTabs)
    const icon = (Icon: typeof X) => <Icon size={ICON_SIZE} />
    return [
      { id: 'split-right', label: t('splitPanes.splitRight'), icon: icon(Columns2), disabled: !activeTabId, run: () => splitActivePane(paneTree, paneTreeDispatch, 'horizontal') },
      { id: 'split-down', label: t('splitPanes.splitDown'), icon: icon(Rows2), disabled: !activeTabId, run: () => splitActivePane(paneTree, paneTreeDispatch, 'vertical') },
      { id: 'sep-focus', label: '', separator: true },
      { id: 'focus-left', label: t('splitPanes.focusLeft'), icon: icon(ArrowLeft), disabled: !multi, run: () => focusPaneInDirection(paneTree, paneTreeDispatch, 'left') },
      { id: 'focus-right', label: t('splitPanes.focusRight'), icon: icon(ArrowRight), disabled: !multi, run: () => focusPaneInDirection(paneTree, paneTreeDispatch, 'right') },
      { id: 'focus-up', label: t('splitPanes.focusUp'), icon: icon(ArrowUp), disabled: !multi, run: () => focusPaneInDirection(paneTree, paneTreeDispatch, 'up') },
      { id: 'focus-down', label: t('splitPanes.focusDown'), icon: icon(ArrowDown), disabled: !multi, run: () => focusPaneInDirection(paneTree, paneTreeDispatch, 'down') },
      { id: 'sep-close', label: '', separator: true },
      { id: 'close-pane', label: t('splitPanes.closePane'), icon: icon(X), disabled: !canClosePane, run: closeActivePane },
      { id: 'close-others', label: t('splitPanes.closeOtherPanes'), icon: icon(PanelTopClose), disabled: !canCloseOthers, run: closeOthers },
    ]
  }

  return (
    <div className="editor-header-row">
      <NavigationControls />
      <div className="editor-header-row__center">{children}</div>
      {showPaneMenu && (
      <button
        type="button"
        className="nav-controls-button editor-header-row__menu"
        aria-label={t('splitPanes.menuLabel')}
        aria-haspopup="menu"
        aria-expanded={menuPos !== null}
        title={t('splitPanes.menuLabel')}
        onMouseDown={() => { wasOpenOnPressRef.current = menuPos !== null }}
        onClick={(e) => {
          const wasOpen = wasOpenOnPressRef.current
          wasOpenOnPressRef.current = false
          if (wasOpen) { setMenuPos(null); return }
          const r = e.currentTarget.getBoundingClientRect()
          setMenuPos({ x: r.right, y: r.bottom })
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      )}
      {showPaneMenu && menuPos && (
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
