/**
 * Pane commands shared by the command palette (Obsidian core commands) and the
 * editor header's pane menu, so both stay in step.
 *
 * @module components/panes/pane-commands
 */
import type { Dispatch } from 'react'
import {
  generatePaneId,
  getActivePaneTabState,
  type PaneTree,
  type PaneTreeAction,
  type SplitDirection,
} from '../../state/paneTreeState'
import { findPaneInDirection, type FocusDirection, type PaneRect } from './pane-focus-direction'

/**
 * Splits the active pane, duplicating its active tab into the new pane.
 *
 * @returns false when the active pane has no active tab (nothing was split).
 */
export function splitActivePane(
  paneTree: PaneTree,
  dispatch: Dispatch<PaneTreeAction>,
  direction: SplitDirection,
): boolean {
  const tabId = getActivePaneTabState(paneTree)?.activeTabId
  if (!tabId) return false
  dispatch({
    type: 'SPLIT_PANE_WITH_TAB',
    payload: { paneId: paneTree.activePaneId, direction, newPaneId: generatePaneId(), tabId, copy: true },
  })
  return true
}

/**
 * Moves focus to the pane visually next to the active one. The tree shape can't
 * say which pane is "to the left" once splits nest, so this reads live pane
 * rectangles from the DOM (each pane leaf carries `data-pane-id`). A no-op when
 * there is no pane in that direction.
 */
export function focusPaneInDirection(
  paneTree: PaneTree,
  dispatch: Dispatch<PaneTreeAction>,
  direction: FocusDirection,
): void {
  const rects: PaneRect[] = Array.from(
    document.querySelectorAll<HTMLElement>('.pane-leaf[data-pane-id]'),
  ).map((el) => {
    const r = el.getBoundingClientRect()
    return { paneId: el.dataset.paneId ?? '', left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  })
  const targetId = findPaneInDirection(rects, paneTree.activePaneId, direction)
  if (targetId) dispatch({ type: 'FOCUS_PANE', payload: { paneId: targetId } })
}
