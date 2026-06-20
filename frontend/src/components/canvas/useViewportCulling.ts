/**
 * useViewportCulling — Filters nodes to only those visible in the current viewport.
 * Improves performance for canvases with >100 nodes by not rendering off-screen elements.
 * Applies a margin around the viewport to keep nodes visible during quick pan movements.
 */

import { useMemo } from 'react'
import type { CanvasNode } from '../../canvas/types'
import type { CanvasViewport } from '../../state/canvasState'

/** Culling margin in canvas units (extra space around visible viewport). */
const CULL_MARGIN = 200

/** Node count threshold below which culling is disabled (overhead not worth it). */
const CULLING_THRESHOLD = 100

/**
 * Returns only the nodes that are within the visible viewport (plus margin).
 * For canvases with fewer than CULLING_THRESHOLD nodes, returns all nodes unchanged.
 *
 * @param nodes - All nodes in the document
 * @param viewport - Current viewport state (x, y, zoom)
 * @param containerWidth - Container width in CSS pixels
 * @param containerHeight - Container height in CSS pixels
 * @returns Filtered array of visible nodes
 */
export function useViewportCulling(
  nodes: CanvasNode[],
  viewport: CanvasViewport,
  containerWidth: number,
  containerHeight: number,
): CanvasNode[] {
  return useMemo(() => {
    // Skip culling for small canvases
    if (nodes.length < CULLING_THRESHOLD) return nodes

    // Calculate visible area in canvas coordinates
    const viewLeft = -viewport.x - CULL_MARGIN
    const viewTop = -viewport.y - CULL_MARGIN
    const viewRight = -viewport.x + containerWidth / viewport.zoom + CULL_MARGIN
    const viewBottom = -viewport.y + containerHeight / viewport.zoom + CULL_MARGIN

    return nodes.filter((node) => {
      const nodeRight = node.x + node.width
      const nodeBottom = node.y + node.height

      // AABB overlap test
      return nodeRight >= viewLeft
        && node.x <= viewRight
        && nodeBottom >= viewTop
        && node.y <= viewBottom
    })
  }, [nodes, viewport.x, viewport.y, viewport.zoom, containerWidth, containerHeight])
}
