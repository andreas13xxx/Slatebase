import { useState, useRef, useCallback, useEffect } from 'react'
import { getState, updateLayout } from '../state/workspaceStore'

/** Keys in WorkspaceState that hold panel widths. */
type LayoutWidthKey = 'sidebarWidth' | 'rightPanelWidth'

/** Step size in pixels for keyboard-driven resize. */
const KEYBOARD_STEP = 10

/**
 * Hook for mouse- and keyboard-driven panel resize.
 * Returns the current width, an onMouseDown handler, and an onKeyDown handler
 * to attach to the resize handle.
 *
 * @param initialWidth - Starting width in pixels (used as fallback if no persisted value)
 * @param min - Minimum allowed width
 * @param max - Maximum allowed width
 * @param side - Which side the panel is on ('left' adjusts with positive delta, 'right' with negative)
 * @param persistKey - Optional workspace store key to persist/restore width from
 */
export function useResize(
  initialWidth: number,
  min: number,
  max: number,
  side: 'left' | 'right' = 'left',
  persistKey?: LayoutWidthKey,
) {
  const [width, setWidth] = useState(() => {
    if (persistKey) {
      const stored = getState()[persistKey]
      if (typeof stored === 'number' && stored >= min && stored <= max) {
        return stored
      }
    }
    return initialWidth
  })

  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // Persist width changes to workspace store (debounced internally by the store)
  useEffect(() => {
    if (persistKey) {
      updateLayout({ [persistKey]: width })
    }
  }, [width, persistKey])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(ev: MouseEvent) {
      if (!dragging.current) return
      const delta = side === 'left' ? ev.clientX - startX.current : startX.current - ev.clientX
      const newWidth = Math.min(max, Math.max(min, startWidth.current + delta))
      setWidth(newWidth)
    }

    function onMouseUp() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [width, min, max, side])

  /** Keyboard handler: ArrowLeft/ArrowRight adjust width by KEYBOARD_STEP. */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()

    const grow = side === 'left' ? e.key === 'ArrowRight' : e.key === 'ArrowLeft'
    const delta = grow ? KEYBOARD_STEP : -KEYBOARD_STEP
    setWidth((current) => Math.min(max, Math.max(min, current + delta)))
  }, [min, max, side])

  return { width, min, max, onMouseDown, onKeyDown }
}
