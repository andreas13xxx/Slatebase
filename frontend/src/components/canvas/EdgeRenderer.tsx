/**
 * EdgeRenderer — SVG layer for rendering edges between canvas nodes.
 */

import { memo, useMemo } from 'react'
import type { CanvasEdge, CanvasNode, EdgeSide } from '../../canvas/types'
import { getCanvasColorVar } from './canvas-utils'

export interface EdgeRendererProps {
  edges: CanvasEdge[]
  nodes: CanvasNode[]
  selectedEdgeIds: Set<string>
  onSelectEdge: (edgeId: string, additive: boolean) => void
  onEdgeContextMenu?: (edgeId: string, x: number, y: number) => void
  readOnly: boolean
}

/** Get anchor point coordinates for a side of a node. */
function getAnchorPoint(node: CanvasNode, side: EdgeSide): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: node.x + node.width / 2, y: node.y }
    case 'bottom': return { x: node.x + node.width / 2, y: node.y + node.height }
    case 'left': return { x: node.x, y: node.y + node.height / 2 }
    case 'right': return { x: node.x + node.width, y: node.y + node.height / 2 }
  }
}

/** Calculate Bézier control points for a curved edge. */
function calculatePath(from: { x: number; y: number }, fromSide: EdgeSide, to: { x: number; y: number }, toSide: EdgeSide): string {
  const distance = Math.max(50, Math.hypot(to.x - from.x, to.y - from.y) * 0.4)

  // Control point offsets based on side direction
  const fromOffset = getOffset(fromSide, distance)
  const toOffset = getOffset(toSide, distance)

  const cp1x = from.x + fromOffset.x
  const cp1y = from.y + fromOffset.y
  const cp2x = to.x + toOffset.x
  const cp2y = to.y + toOffset.y

  return `M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`
}

function getOffset(side: EdgeSide, distance: number): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: 0, y: -distance }
    case 'bottom': return { x: 0, y: distance }
    case 'left': return { x: -distance, y: 0 }
    case 'right': return { x: distance, y: 0 }
  }
}

export const EdgeRenderer = memo(function EdgeRenderer({
  edges, nodes, selectedEdgeIds, onSelectEdge, onEdgeContextMenu,
}: EdgeRendererProps) {
  const nodeMap = useMemo(() => {
    const map = new Map<string, CanvasNode>()
    for (const node of nodes) map.set(node.id, node)
    return map
  }, [nodes])

  // Calculate bounding box for SVG viewBox
  const svgBounds = useMemo(() => {
    if (nodes.length === 0) return { minX: 0, minY: 0, width: 1000, height: 1000 }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodes) {
      minX = Math.min(minX, node.x - 100)
      minY = Math.min(minY, node.y - 100)
      maxX = Math.max(maxX, node.x + node.width + 100)
      maxY = Math.max(maxY, node.y + node.height + 100)
    }
    return { minX, minY, width: maxX - minX, height: maxY - minY }
  }, [nodes])

  return (
    <svg
      className="canvas-view__edges"
      viewBox={`${svgBounds.minX} ${svgBounds.minY} ${svgBounds.width} ${svgBounds.height}`}
      style={{
        position: 'absolute',
        left: svgBounds.minX,
        top: svgBounds.minY,
        width: svgBounds.width,
        height: svgBounds.height,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <defs>
        <marker
          id="canvas-arrow"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" className="canvas-edge__arrow" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const fromNode = nodeMap.get(edge.fromNode)
        const toNode = nodeMap.get(edge.toNode)
        if (!fromNode || !toNode) return null

        const from = getAnchorPoint(fromNode, edge.fromSide)
        const to = getAnchorPoint(toNode, edge.toSide)
        const path = calculatePath(from, edge.fromSide, to, edge.toSide)
        const isSelected = selectedEdgeIds.has(edge.id)
        const colorVar = getCanvasColorVar(edge.color)

        return (
          <g key={edge.id}>
            {/* Invisible wider hit area */}
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                onSelectEdge(edge.id, e.shiftKey)
              }}
              onContextMenu={(e) => {
                if (onEdgeContextMenu) {
                  e.preventDefault()
                  e.stopPropagation()
                  onSelectEdge(edge.id, false)
                  onEdgeContextMenu(edge.id, e.clientX, e.clientY)
                }
              }}
            />
            {/* Visible edge path */}
            <path
              d={path}
              fill="none"
              className={`canvas-edge ${isSelected ? 'canvas-edge--selected' : ''}`}
              style={colorVar ? { stroke: colorVar } : undefined}
              markerEnd={edge.toEnd === 'arrow' || edge.toEnd === undefined ? 'url(#canvas-arrow)' : undefined}
              markerStart={edge.fromEnd === 'arrow' ? 'url(#canvas-arrow)' : undefined}
            />
            {/* Edge label */}
            {edge.label && (
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2}
                className="canvas-edge__label"
                textAnchor="middle"
                dy="-6"
              >
                {edge.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
})
