/**
 * Places the global aria-label tooltip next to the element that triggered it.
 *
 * Pure geometry, kept apart from the component so edge cases — an anchor near
 * the top of the viewport, or near the left/right edge — can be tested
 * without a browser layout.
 *
 * @module global-tooltip-position
 */

/** A rectangle in viewport coordinates. */
export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export interface TooltipPlacement {
  top: number
  left: number
  /** Which side of the anchor it ended up on, for the arrow and animation. */
  side: 'above' | 'below'
}

/** Space between the anchor and the tooltip. */
const GAP = 6
/** Minimum distance kept from the viewport edges. */
const MARGIN = 8

/**
 * Position the tooltip above the anchor, centered on it, flipping below when
 * it would not fit, and clamped so it never leaves the viewport.
 *
 * Obsidian's own tooltips default to appearing above their target; this
 * mirrors that so plugin-triggered tooltips (e.g. toolbar buttons) land
 * where their authors expect.
 */
export function placeGlobalTooltip(
  anchor: Rect,
  tooltip: { width: number; height: number },
  viewport: Viewport,
): TooltipPlacement {
  const spaceAbove = anchor.top - GAP - MARGIN
  const spaceBelow = viewport.height - (anchor.top + anchor.height) - GAP - MARGIN

  const fitsAbove = tooltip.height <= spaceAbove
  const fitsBelow = tooltip.height <= spaceBelow
  const side: 'above' | 'below' = fitsAbove
    ? 'above'
    : fitsBelow
      ? 'below'
      : spaceAbove >= spaceBelow
        ? 'above'
        : 'below'

  const top =
    side === 'above'
      ? anchor.top - tooltip.height - GAP
      : anchor.top + anchor.height + GAP

  const centeredLeft = anchor.left + anchor.width / 2 - tooltip.width / 2
  const maxLeft = viewport.width - tooltip.width - MARGIN
  const left = Math.max(MARGIN, Math.min(centeredLeft, Math.max(MARGIN, maxLeft)))

  return {
    top: Math.max(MARGIN, Math.min(top, viewport.height - tooltip.height - MARGIN)),
    left,
    side,
  }
}
