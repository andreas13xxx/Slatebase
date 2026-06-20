/**
 * CanvasMinimap — Scaled overview of the full canvas with a viewport indicator rectangle.
 * Click or drag on the minimap to navigate to that position.
 */

import { memo, useCallback, useRef } from 'react'
import type { CanvasNode } from '../../canvas/types'
import type { CanvasViewport } from '../../state/canvasState'
import { getCanvasColorVar } from './canvas-utils'

interface CanvasMinimapProps {
  nodes: CanvasNode[]
  viewport: CanvasViewport
  /** Container dimensions in pixels. */
  containerWidth: number
  containerHeight: number
  onNavigate: (x: number, y: number) => void
  visible: boolean
}

/** Fixed minimap dimensions. */
const MINIMAP_WIDTH = 180
const MINIMAP_HEIGHT = 120
const MINIMAP_PADDING = 10

export const CanvasMinimap = memo(function CanvasMinimap({
  nodes, viewport, containerWidth, containerHeight, onNavigate, visible,
}: CanvasMinimapProps) {
  const minimapRef = useRef<HTMLDivElement>(null)

  /** Convert minimap click coordinates to canvas coordinates and navigate. */
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!minimapRef.current || nodes.length === 0) return
    const rect = minimapRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // Compute bounding box for coordinate conversion
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodes) {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x + node.width)
      maxY = Math.max(maxY, node.y + node.height)
    }
    const contentWidth = maxX - minX + MINIMAP_PADDING * 2
    const contentHeight = maxY - minY + MINIMAP_PADDING * 2
    const scale = Math.min(
      (MINIMAP_WIDTH - 8) / contentWidth,
      (MINIMAP_HEIGHT - 8) / contentHeight,
    )
    const offsetX = (MINIMAP_WIDTH - contentWidth * scale) / 2
    const offsetY = (MINIMAP_HEIGHT - contentHeight * scale) / 2
    const viewWidth = containerWidth / viewport.zoom
    const viewHeight = containerHeight / viewport.zoom

    // Convert back to canvas coordinates
    const canvasX = (clickX - offsetX) / scale + minX - MINIMAP_PADDING
    const canvasY = (clickY - offsetY) / scale + minY - MINIMAP_PADDING

    // Center the viewport on clicked position
    const newX = -(canvasX - viewWidth / 2)
    const newY = -(canvasY - viewHeight / 2)
    onNavigate(newX, newY)
  }, [nodes, containerWidth, containerHeight, viewport.zoom, onNavigate])

  // Early return AFTER all hooks
  if (!visible || nodes.length === 0) return null

  // Compute bounding box of all nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  }

  const contentWidth = maxX - minX + MINIMAP_PADDING * 2
  const contentHeight = maxY - minY + MINIMAP_PADDING * 2

  // Scale factor to fit content into minimap
  const scale = Math.min(
    (MINIMAP_WIDTH - 8) / contentWidth,
    (MINIMAP_HEIGHT - 8) / contentHeight,
  )

  // Offset to center content in minimap
  const offsetX = (MINIMAP_WIDTH - contentWidth * scale) / 2
  const offsetY = (MINIMAP_HEIGHT - contentHeight * scale) / 2

  // Viewport rectangle in minimap coordinates
  const viewWidth = containerWidth / viewport.zoom
  const viewHeight = containerHeight / viewport.zoom
  const viewLeft = -viewport.x
  const viewTop = -viewport.y

  const viewRectX = offsetX + (viewLeft - minX + MINIMAP_PADDING) * scale
  const viewRectY = offsetY + (viewTop - minY + MINIMAP_PADDING) * scale
  const viewRectW = viewWidth * scale
  const viewRectH = viewHeight * scale

  return (
    <div
      ref={minimapRef}
      className="canvas-minimap"
      onClick={handleClick}
      role="navigation"
      aria-label="Canvas-Minimap"
    >
      <svg
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        className="canvas-minimap__svg"
      >
        {/* Node rectangles */}
        {nodes.map((node) => {
          const rx = offsetX + (node.x - minX + MINIMAP_PADDING) * scale
          const ry = offsetY + (node.y - minY + MINIMAP_PADDING) * scale
          const rw = node.width * scale
          const rh = node.height * scale
          const fill = getCanvasColorVar(node.color) ?? (node.type === 'group' ? 'var(--canvas-group-bg)' : 'var(--canvas-node-bg)')

          return (
            <rect
              key={node.id}
              x={rx}
              y={ry}
              width={Math.max(2, rw)}
              height={Math.max(2, rh)}
              rx={1}
              fill={fill}
              stroke="var(--canvas-node-border)"
              strokeWidth={0.5}
              opacity={node.type === 'group' ? 0.4 : 0.8}
            />
          )
        })}

        {/* Viewport indicator */}
        <rect
          x={viewRectX}
          y={viewRectY}
          width={viewRectW}
          height={viewRectH}
          fill="none"
          stroke="var(--canvas-selection-color)"
          strokeWidth={1.5}
          rx={1}
          className="canvas-minimap__viewport-rect"
        />
      </svg>
    </div>
  )
})
