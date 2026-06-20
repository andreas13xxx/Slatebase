/**
 * NodeAnchors — Renders draggable anchor points on node borders for edge creation.
 * When a user drags from an anchor, a preview line appears until they drop on another node's anchor.
 */

import { memo, useCallback, useRef } from 'react'
import type { EdgeSide } from '../../canvas/types'
import { useCanvasContext } from '../../state/canvasContext'
import { generateCanvasId } from './canvas-utils'

interface NodeAnchorsProps {
  nodeId: string
  width: number
  height: number
  visible: boolean
}

/** Anchor positions relative to node. */
const ANCHORS: Array<{ side: EdgeSide; style: React.CSSProperties }> = [
  { side: 'top', style: { top: -5, left: '50%', marginLeft: -5 } },
  { side: 'right', style: { top: '50%', right: -5, marginTop: -5 } },
  { side: 'bottom', style: { bottom: -5, left: '50%', marginLeft: -5 } },
  { side: 'left', style: { top: '50%', left: -5, marginTop: -5 } },
]

export const NodeAnchors = memo(function NodeAnchors({ nodeId, visible }: NodeAnchorsProps) {
  const { state, dispatch } = useCanvasContext()
  const dragStateRef = useRef<{ fromSide: EdgeSide } | null>(null)

  const handleAnchorMouseDown = useCallback((e: React.MouseEvent, side: EdgeSide) => {
    e.stopPropagation()
    e.preventDefault()
    dragStateRef.current = { fromSide: side }

    const handleMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mouseup', handleMouseUp)
      if (!dragStateRef.current) return

      // Find if we dropped on another node
      const target = ev.target as HTMLElement
      const targetNode = target.closest('[data-node-id]') as HTMLElement | null
      if (targetNode && targetNode.dataset['nodeId'] !== nodeId) {
        const toNodeId = targetNode.dataset['nodeId']!
        // Determine the target side based on relative position
        const rect = targetNode.getBoundingClientRect()
        const relX = ev.clientX - rect.left
        const relY = ev.clientY - rect.top
        const toSide = getClosestSide(relX, relY, rect.width, rect.height)

        dispatch({
          type: 'ADD_EDGE',
          payload: {
            edge: {
              id: generateCanvasId(),
              fromNode: nodeId,
              fromSide: dragStateRef.current.fromSide,
              toNode: toNodeId,
              toSide,
              toEnd: 'arrow',
            },
          },
        })
      }
      dragStateRef.current = null
    }

    window.addEventListener('mouseup', handleMouseUp)
  }, [nodeId, state, dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null

  return (
    <>
      {ANCHORS.map(({ side, style }) => (
        <div
          key={side}
          className="canvas-node__anchor"
          style={{ ...style, position: 'absolute' }}
          onMouseDown={(e) => handleAnchorMouseDown(e, side)}
          title={`Verbindung von ${side}`}
          role="button"
          aria-label={`Verbindungsanker ${side}`}
        />
      ))}
    </>
  )
})

/** Determine closest side based on position within a rectangle. */
function getClosestSide(x: number, y: number, width: number, height: number): EdgeSide {
  const distances = {
    top: y,
    bottom: height - y,
    left: x,
    right: width - x,
  }
  let min: EdgeSide = 'top'
  let minDist = Infinity
  for (const [side, dist] of Object.entries(distances)) {
    if (dist < minDist) {
      minDist = dist
      min = side as EdgeSide
    }
  }
  return min
}
