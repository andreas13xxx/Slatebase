/**
 * Places the hover preview popover next to the link that triggered it.
 *
 * Pure geometry, kept apart from the component so the edge cases that actually
 * bite — a link near the bottom of the window, or near the right edge — can be
 * tested without a browser layout.
 *
 * @module hover-preview-position
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

export interface PopoverPlacement {
  top: number
  left: number
  /** Which side of the anchor it ended up on, for the arrow and animation. */
  side: 'above' | 'below'
}

/** Space between the anchor and the popover. */
const GAP = 8
/** Minimum distance kept from the viewport edges. */
const MARGIN = 8

/**
 * Position the popover below the anchor, flipping above when it would not fit,
 * and clamped so it never leaves the viewport.
 *
 * When neither side has room the side with more space wins, since a clipped
 * popover is more useful than one placed off-screen.
 */
export function placeHoverPreview(
  anchor: Rect,
  popover: { width: number; height: number },
  viewport: Viewport,
): PopoverPlacement {
  const spaceBelow = viewport.height - (anchor.top + anchor.height) - GAP - MARGIN
  const spaceAbove = anchor.top - GAP - MARGIN

  const fitsBelow = popover.height <= spaceBelow
  const fitsAbove = popover.height <= spaceAbove
  const side: 'above' | 'below' = fitsBelow
    ? 'below'
    : fitsAbove
      ? 'above'
      : spaceBelow >= spaceAbove
        ? 'below'
        : 'above'

  const top =
    side === 'below'
      ? anchor.top + anchor.height + GAP
      : anchor.top - popover.height - GAP

  // Prefer left-aligning with the anchor, then pull back inside the viewport.
  const maxLeft = viewport.width - popover.width - MARGIN
  const left = Math.max(MARGIN, Math.min(anchor.left, Math.max(MARGIN, maxLeft)))

  return {
    top: Math.max(MARGIN, Math.min(top, viewport.height - MARGIN)),
    left,
    side,
  }
}
