/**
 * Directional pane focus — pure geometry.
 *
 * Given the on-screen rectangles of every pane and the currently active pane,
 * pick the pane a "focus left/right/up/down" command should move to. Works off
 * live DOM rects (not the tree shape) because a nested split makes the tree
 * ambiguous about which pane is visually "to the left" — geometry is the only
 * honest answer, and it degrades gracefully when panes overlap or the active
 * one is unknown.
 *
 * @module components/panes/pane-focus-direction
 */

/** The four directions a focus command can move. */
export type FocusDirection = 'left' | 'right' | 'up' | 'down'

/** A pane's screen rectangle, keyed by its pane id. */
export interface PaneRect {
  paneId: string
  left: number
  right: number
  top: number
  bottom: number
}

/** Centre point of a rect on the primary (movement) axis and the cross axis. */
function centre(rect: PaneRect): { x: number; y: number } {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }
}

/** True iff two 1-D intervals overlap (used for cross-axis alignment). */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * Find the pane to move focus to from `activePaneId` in `direction`, or null
 * when there is no pane in that direction. Candidates must lie on the correct
 * side (their near edge is beyond the active pane's centre) — this prevents a
 * pane that merely overlaps from being chosen. Among valid candidates the one
 * whose centre is nearest wins, with a strong preference for panes that overlap
 * the active pane on the cross axis (so "right" from a tall left pane lands on
 * the pane directly beside it, not a diagonally-offset one).
 */
export function findPaneInDirection(
  rects: PaneRect[],
  activePaneId: string,
  direction: FocusDirection,
): string | null {
  const active = rects.find((r) => r.paneId === activePaneId)
  if (!active) return null
  const activeCentre = centre(active)

  let best: { paneId: string; distance: number; aligned: boolean } | null = null

  for (const rect of rects) {
    if (rect.paneId === activePaneId) continue
    const c = centre(rect)

    // Must be strictly on the correct side of the active pane's centre.
    let onSide = false
    let aligned = false
    let distance = 0
    switch (direction) {
      case 'left':
        onSide = rect.right <= activeCentre.x
        aligned = overlaps(active.top, active.bottom, rect.top, rect.bottom)
        distance = activeCentre.x - c.x
        break
      case 'right':
        onSide = rect.left >= activeCentre.x
        aligned = overlaps(active.top, active.bottom, rect.top, rect.bottom)
        distance = c.x - activeCentre.x
        break
      case 'up':
        onSide = rect.bottom <= activeCentre.y
        aligned = overlaps(active.left, active.right, rect.left, rect.right)
        distance = activeCentre.y - c.y
        break
      case 'down':
        onSide = rect.top >= activeCentre.y
        aligned = overlaps(active.left, active.right, rect.left, rect.right)
        distance = c.y - activeCentre.y
        break
    }
    if (!onSide || distance <= 0) continue

    // Prefer an aligned pane over a non-aligned one; within the same alignment
    // class prefer the nearer centre.
    if (
      best === null ||
      (aligned && !best.aligned) ||
      (aligned === best.aligned && distance < best.distance)
    ) {
      best = { paneId: rect.paneId, distance, aligned }
    }
  }

  return best?.paneId ?? null
}
