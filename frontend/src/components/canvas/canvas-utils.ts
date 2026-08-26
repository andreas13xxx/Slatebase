/**
 * Canvas utility functions — color mapping, geometry helpers.
 */

/**
 * Maps Obsidian color values ("1"–"6" or hex) to CSS class names.
 */
export function getCanvasColorClass(color: string | undefined): string {
  if (!color) return ''
  switch (color) {
    case '1': return 'canvas-color-1'
    case '2': return 'canvas-color-2'
    case '3': return 'canvas-color-3'
    case '4': return 'canvas-color-4'
    case '5': return 'canvas-color-5'
    case '6': return 'canvas-color-6'
    default: return '' // Hex colors applied via inline style
  }
}

/**
 * Returns the CSS variable or hex value for an Obsidian color.
 * Used for inline styles when a custom color is needed.
 */
export function getCanvasColorVar(color: string | undefined): string | undefined {
  if (!color) return undefined
  switch (color) {
    case '1': return 'var(--canvas-color-1)'
    case '2': return 'var(--canvas-color-2)'
    case '3': return 'var(--canvas-color-3)'
    case '4': return 'var(--canvas-color-4)'
    case '5': return 'var(--canvas-color-5)'
    case '6': return 'var(--canvas-color-6)'
    default:
      // Assume hex color if starts with #
      if (color.startsWith('#')) return color
      return undefined
  }
}

/**
 * Generates a unique ID for new canvas elements.
 */
export function generateCanvasId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

/** A bounding box in canvas-space coordinates. */
export interface CanvasBounds { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Computes the viewport (x/y/zoom) that fits `bounds` inside `rect` with
 * `padding` canvas-space pixels of margin, never zooming in past 100%.
 * Shared by CanvasView's fitToView (all nodes) and jumpToSelectedGroup
 * (one group's bounds) — same fit-to-content math, different bounds source.
 */
export function computeFitViewport(
  bounds: CanvasBounds,
  rect: { width: number; height: number },
  padding: number,
  minZoom: number,
): { x: number; y: number; zoom: number } {
  const contentWidth = bounds.maxX - bounds.minX + padding * 2
  const contentHeight = bounds.maxY - bounds.minY + padding * 2
  const zoom = Math.min(
    rect.width / contentWidth,
    rect.height / contentHeight,
    1, // Don't zoom in beyond 100%
  )
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2

  return {
    x: -centerX + (rect.width / 2) / zoom,
    y: -centerY + (rect.height / 2) / zoom,
    zoom: Math.max(minZoom, zoom),
  }
}
