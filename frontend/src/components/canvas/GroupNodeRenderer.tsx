/**
 * GroupNodeRenderer — Renders a group node (container with label).
 * Supports drag/move and resize.
 */

import { memo, useCallback } from 'react'
import type { GroupNode } from '../../canvas/types'
import { getCanvasColorClass } from './canvas-utils'
import { useNodeDrag } from './useNodeDrag'
import { useNodeResize } from './useNodeResize'
import { ResizeHandles } from './ResizeHandles'
import { NodeAnchors } from './NodeAnchors'

export interface GroupNodeRendererProps {
  node: GroupNode
  selected: boolean
  onSelect: (additive: boolean) => void
  readOnly: boolean
}

export const GroupNodeRenderer = memo(function GroupNodeRenderer({
  node, selected, onSelect, readOnly,
}: GroupNodeRendererProps) {
  const colorClass = getCanvasColorClass(node.color)

  const { onDragStart } = useNodeDrag(node.id, readOnly)
  const { onResizeStart } = useNodeResize(node.id, readOnly)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    onSelect(e.shiftKey)
    onDragStart(e)
  }, [onSelect, onDragStart])

  return (
    <div
      className={`canvas-node canvas-node--group ${colorClass} ${selected ? 'canvas-node--selected' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
      data-node-id={node.id}
      onMouseDown={handleMouseDown}
      role="group"
      aria-label={node.label ? `Gruppe: ${node.label}` : 'Gruppe'}
    >
      {node.label && (
        <span className="canvas-node__group-label">{node.label}</span>
      )}
      <ResizeHandles visible={selected && !readOnly} onResizeStart={onResizeStart} />
      <NodeAnchors nodeId={node.id} width={node.width} height={node.height} visible={selected && !readOnly} />
    </div>
  )
})
