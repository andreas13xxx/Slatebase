/**
 * Pure geometry for canvas touch gestures (pinch-zoom and two-finger pan).
 *
 * The viewport maps a canvas point `c` to the screen point `(c + view) * zoom + rect.origin`, so the
 * canvas point under a screen point is `(screen - origin) / zoom - view`.
 *
 * @module components/canvas/touch-gestures
 */

/** A screen position in px. */
export interface Point {
  x: number
  y: number
}

/** The state captured when a pinch starts. */
export interface PinchStart {
  /** Distance between the two fingers at the start (px). */
  distance: number
  /** Zoom at the start. */
  zoom: number
  /** The canvas point under the midpoint of the fingers at the start. */
  anchor: Point
}

/** Distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Midpoint of two points. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Captures a pinch start from the two finger positions and the current viewport.
 *
 * @param origin - Top-left of the canvas element on screen.
 */
export function startPinch(a: Point, b: Point, view: Point, zoom: number, origin: Point): PinchStart {
  const mid = midpoint(a, b)
  return {
    distance: Math.max(distance(a, b), 1),
    zoom,
    anchor: { x: (mid.x - origin.x) / zoom - view.x, y: (mid.y - origin.y) / zoom - view.y },
  }
}

/**
 * The viewport for the current finger positions: zoom follows the finger distance (clamped to
 * `[minZoom, maxZoom]`), and the pan keeps the start anchor under the fingers' midpoint, so a
 * two-finger drag also pans.
 */
export function pinchViewport(
  start: PinchStart,
  a: Point,
  b: Point,
  origin: Point,
  minZoom: number,
  maxZoom: number,
): { x: number; y: number; zoom: number } {
  const zoom = Math.min(maxZoom, Math.max(minZoom, start.zoom * (distance(a, b) / start.distance)))
  const mid = midpoint(a, b)
  return {
    zoom,
    x: (mid.x - origin.x) / zoom - start.anchor.x,
    y: (mid.y - origin.y) / zoom - start.anchor.y,
  }
}
