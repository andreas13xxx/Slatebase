import { useCallback, useRef } from 'react'
import type React from 'react'

/** Touch hold duration before the context menu opens (ms). */
export const LONG_PRESS_MS = 500
/** Finger movement (px) that turns a hold into a scroll/drag and cancels it. */
const MOVE_TOLERANCE_PX = 10

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent<Element>) => void
  onPointerMove: (e: React.PointerEvent<Element>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onClickCapture: (e: React.MouseEvent<Element>) => void
}

/**
 * Opens an element's `onContextMenu` handler on a touch long-press.
 *
 * Android browsers fire `contextmenu` on long-press themselves, iOS Safari
 * does not. Dispatching a synthetic `contextmenu` event keeps the existing
 * handlers the single code path; where the browser also fires its own, the
 * menu state is simply set twice. Mouse and pen input are ignored.
 *
 * @returns Handlers to spread onto the element.
 */
export function useLongPress(): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef(false)

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    startRef.current = null
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<Element>) => {
    if (e.pointerType !== 'touch' || !e.isPrimary) return
    cancel()
    firedRef.current = false
    const target = e.currentTarget
    const x = e.clientX
    const y = e.clientY
    startRef.current = { x, y }
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      firedRef.current = true
      target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
    }, LONG_PRESS_MS)
  }, [cancel])

  const onPointerMove = useCallback((e: React.PointerEvent<Element>) => {
    const start = startRef.current
    if (!start) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX) cancel()
  }, [cancel])

  /** Swallows the click that follows the finger lifting after a long press. */
  const onClickCapture = useCallback((e: React.MouseEvent<Element>) => {
    if (!firedRef.current) return
    firedRef.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel, onClickCapture }
}
