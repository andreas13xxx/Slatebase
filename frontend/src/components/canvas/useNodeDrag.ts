/**
 * useNodeDrag — Hook for dragging canvas nodes.
 * Handles single-node and multi-node drag (when shift-selected).
 */

import { useCallback, useRef } from 'react'
import { useCanvasContext } from '../../state/canvasContext'

interface DragState {
  startX: number
  startY: number
  nodeStartX: number
  nodeStartY: number
  /** Other selected node starting positions for multi-drag. */
  otherStarts: Array<{ nodeId: string; x: number; y: number }>
}

/**
 * Returns mouse event handlers for dragging a node.
 * Call onDragStart on mouseDown, and the hook handles move/up globally.
 */
export function useNodeDrag(nodeId: string, readOnly: boolean) {
  const { state, dispatch } = useCanvasContext()
  const dragRef = useRef<DragState | null>(null)
  const hasDraggedRef = useRef(false)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (readOnly || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const node = state.document?.nodes.find((n) => n.id === nodeId)
    if (!node) return

    // Collect starting positions of all selected nodes for multi-drag
    const selectedIds = state.selectedNodeIds
    const otherStarts: Array<{ nodeId: string; x: number; y: number }> = []
    if (selectedIds.has(nodeId) && selectedIds.size > 1) {
      for (const id of selectedIds) {
        if (id === nodeId) continue
        const other = state.document?.nodes.find((n) => n.id === id)
        if (other) otherStarts.push({ nodeId: id, x: other.x, y: other.y })
      }
    }

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      nodeStartX: node.x,
      nodeStartY: node.y,
      otherStarts,
    }
    hasDraggedRef.current = false

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = (ev.clientX - dragRef.current.startX) / state.viewport.zoom
      const dy = (ev.clientY - dragRef.current.startY) / state.viewport.zoom

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        hasDraggedRef.current = true
      }

      if (!hasDraggedRef.current) return

      const newX = dragRef.current.nodeStartX + dx
      const newY = dragRef.current.nodeStartY + dy

      if (dragRef.current.otherStarts.length > 0) {
        // Multi-drag
        const moves = [
          { nodeId, x: newX, y: newY },
          ...dragRef.current.otherStarts.map((s) => ({
            nodeId: s.nodeId,
            x: s.x + dx,
            y: s.y + dy,
          })),
        ]
        dispatch({ type: 'MOVE_NODES', payload: { moves } })
      } else {
        dispatch({ type: 'MOVE_NODE', payload: { nodeId, x: newX, y: newY } })
      }
    }

    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [nodeId, readOnly, state.document, state.selectedNodeIds, state.viewport.zoom, dispatch])

  return { onDragStart, hasDraggedRef }
}
