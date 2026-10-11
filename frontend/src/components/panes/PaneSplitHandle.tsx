import { useCallback, useRef } from 'react'
import { MIN_PANE_RATIO } from '../../state/paneTreeState'
import type { SplitDirection } from '../../state/paneTreeState'

/** Keyboard step for ratio adjustment (fraction of total). */
const KEYBOARD_RATIO_STEP = 0.05

interface PaneSplitHandleProps {
  /** Split orientation — decides whether the handle moves on X or Y. */
  direction: SplitDirection
  /** Current ratio of the child BEFORE this handle (the left/top child). */
  ratio: number
  /** Getter for the pixel extent of the whole split along its axis, read at drag start. */
  getAxisLengthPx: () => number
  /** Called with the new ratio for the child before the handle. */
  onResize: (ratio: number) => void
  /** Accessible label for the separator. */
  label: string
}

/**
 * A resize handle sitting between two panes/splits. Horizontal splits (panes
 * side by side) get a vertical, col-resize handle; vertical splits get a
 * horizontal, row-resize handle. Keyboard-operable per WCAG: arrow keys adjust
 * the ratio, with the four aria-value* attributes set.
 */
export function PaneSplitHandle({ direction, ratio, getAxisLengthPx, onResize, label }: PaneSplitHandleProps) {
  const dragging = useRef(false)
  const startPos = useRef(0)
  const startRatio = useRef(0)
  const axisLen = useRef(0)

  const isHorizontal = direction === 'horizontal'

  const clamp = (r: number): number => Math.min(Math.max(r, MIN_PANE_RATIO), 1 - MIN_PANE_RATIO)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true
      startPos.current = isHorizontal ? e.clientX : e.clientY
      startRatio.current = ratio
      axisLen.current = getAxisLengthPx()
      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current || axisLen.current <= 0) return
        const pos = isHorizontal ? ev.clientX : ev.clientY
        const deltaRatio = (pos - startPos.current) / axisLen.current
        onResize(clamp(startRatio.current + deltaRatio))
      }
      const onMouseUp = () => {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [isHorizontal, ratio, getAxisLengthPx, onResize],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const grow = isHorizontal ? e.key === 'ArrowRight' : e.key === 'ArrowDown'
      const shrink = isHorizontal ? e.key === 'ArrowLeft' : e.key === 'ArrowUp'
      if (!grow && !shrink) return
      e.preventDefault()
      onResize(clamp(ratio + (grow ? KEYBOARD_RATIO_STEP : -KEYBOARD_RATIO_STEP)))
    },
    [isHorizontal, ratio, onResize],
  )

  return (
    <div
      className={`pane-split-handle pane-split-handle--${direction}`}
      role="separator"
      aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={Math.round(MIN_PANE_RATIO * 100)}
      aria-valuemax={Math.round((1 - MIN_PANE_RATIO) * 100)}
      tabIndex={0}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
    />
  )
}
