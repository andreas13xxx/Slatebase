/**
 * useNodeResize — Hook for resizing canvas nodes via drag handles.
 * Supports 8 handles (corners + midpoints) with minimum size enforcement.
 */

import { useCallback, useRef } from 'react'
import { useCanvasContext } from '../../state/canvasContext'

/** Resize handle position. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const MIN_WIDTH = 100
const MIN_HEIGHT = 60

interface ResizeState {
  startX: number
  startY: number
  nodeX: number
  nodeY: number
  nodeWidth: number
  nodeHeight: number
  handle: ResizeHandle
}

/**
 * Returns a function to start resizing from a specific handle.
 */
export function useNodeResize(nodeId: string, readOnly: boolean) {
  const { state, dispatch } = useCanvasContext()
  const resizeRef = useRef<ResizeState | null>(null)

  const onResizeStart = useCallback((e: React.MouseEvent, handle: ResizeHandle) => {
    if (readOnly) return
    e.stopPropagation()
    e.preventDefault()

    const node = state.document?.nodes.find((n) => n.id === nodeId)
    if (!node) return

    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
      nodeWidth: node.width,
      nodeHeight: node.height,
      handle,
    }

    const handleMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const { startX, startY, nodeX, nodeY, nodeWidth, nodeHeight, handle: h } = resizeRef.current
      const dx = (ev.clientX - startX) / state.viewport.zoom
      const dy = (ev.clientY - startY) / state.viewport.zoom

      let newX = nodeX
      let newY = nodeY
      let newW = nodeWidth
      let newH = nodeHeight

      // Adjust based on handle direction
      if (h.includes('e')) { newW = Math.max(MIN_WIDTH, nodeWidth + dx) }
      if (h.includes('w')) {
        const w = Math.max(MIN_WIDTH, nodeWidth - dx)
        newX = nodeX + (nodeWidth - w)
        newW = w
      }
      if (h.includes('s')) { newH = Math.max(MIN_HEIGHT, nodeHeight + dy) }
      if (h.includes('n')) {
        const hh = Math.max(MIN_HEIGHT, nodeHeight - dy)
        newY = nodeY + (nodeHeight - hh)
        newH = hh
      }

      dispatch({
        type: 'RESIZE_NODE',
        payload: { nodeId, width: newW, height: newH, x: newX, y: newY },
      })
    }

    const handleUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [nodeId, readOnly, state.document, state.viewport.zoom, dispatch])

  return { onResizeStart }
}
