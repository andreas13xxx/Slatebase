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
