import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'

/** Hold time (ms) before a touch on a tab arms dragging. Shorter than the long-press menu (500 ms). */
export const TOUCH_DRAG_ARM_MS = 250
/** Finger movement (px) that starts the drag once armed, or hands the gesture to scrolling before. */
const MOVE_TOLERANCE_PX = 10
/** How long after a drag the trailing click stays swallowed (ms). */
const CLICK_SUPPRESS_MS = 400

/** Where a touch drag ended: the tab bar (pane id, `''` for the legacy bar) and the tab index under the finger. */
export interface TouchTabDropTarget {
  barId: string | null
  index: number | null
}

interface Options {
  onDrop: (fromIndex: number, target: TouchTabDropTarget) => void
}

/** Reads the tab bar and tab index under a screen point (from `data-tab-bar` / `data-tab-index`). */
function targetAt(x: number, y: number): TouchTabDropTarget {
  const el = document.elementFromPoint(x, y)
  const bar = el?.closest<HTMLElement>('[data-tab-bar]') ?? null
  const tab = el?.closest<HTMLElement>('[data-tab-index]') ?? null
  const rawIndex = tab && bar?.contains(tab) ? Number(tab.dataset['tabIndex']) : NaN
  return { barId: bar ? (bar.dataset['tabBar'] ?? '') : null, index: Number.isNaN(rawIndex) ? null : rawIndex }
}

/**
 * Touch drag for tabs on pointer events. HTML5 drag-and-drop cannot share the
 * long-press gesture with the context menu on touch screens, so this hook
 * arms after a short hold; moving then drags, staying still still reaches the
 * menu. Moving before the hold ends is left to scrolling. Mouse and pen keep
 * the native drag.
 */
export function useTouchTabDrag({ onDrop }: Options) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const onDropRef = useRef(onDrop)
  useEffect(() => { onDropRef.current = onDrop }, [onDrop])
  const gesture = useRef<{ index: number; x: number; y: number; armed: boolean; dragging: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClick = useRef(false)

  const reset = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    gesture.current = null
    setDraggingIndex(null)
    setOverIndex(null)
  }, [])

  // An armed finger must not scroll the bar. Needs a non-passive listener; React's synthetic touch events are passive.
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (gesture.current?.armed && e.cancelable) e.preventDefault()
    }
    document.addEventListener('touchmove', block, { passive: false })
    return () => {
      document.removeEventListener('touchmove', block)
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<Element>, index: number) => {
    if (e.pointerType !== 'touch' || !e.isPrimary) return
    reset()
    gesture.current = { index, x: e.clientX, y: e.clientY, armed: false, dragging: false }
    timer.current = setTimeout(() => {
      timer.current = null
      if (gesture.current) gesture.current.armed = true
    }, TOUCH_DRAG_ARM_MS)
  }, [reset])

  const onPointerMove = useCallback((e: React.PointerEvent<Element>) => {
    const g = gesture.current
    if (!g) return
    const moved = Math.hypot(e.clientX - g.x, e.clientY - g.y) > MOVE_TOLERANCE_PX
    if (!g.armed) {
      if (moved) reset() // scroll gesture
      return
    }
    if (!g.dragging) {
      if (!moved) return
      g.dragging = true
      setDraggingIndex(g.index)
    }
    const { index } = targetAt(e.clientX, e.clientY)
    setOverIndex(index !== g.index ? index : null)
  }, [reset])

  const onPointerUp = useCallback((e: React.PointerEvent<Element>) => {
    const g = gesture.current
    if (g?.dragging) {
      suppressClick.current = true
      setTimeout(() => { suppressClick.current = false }, CLICK_SUPPRESS_MS)
      onDropRef.current(g.index, targetAt(e.clientX, e.clientY))
    }
    reset()
  }, [reset])

  const onClickCapture = useCallback((e: React.MouseEvent<Element>) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return { draggingIndex, overIndex, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: reset, onClickCapture }
}
