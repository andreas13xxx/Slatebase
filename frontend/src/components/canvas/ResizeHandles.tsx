/**
 * ResizeHandles — Renders 8 resize handles around a selected node.
 */

import { memo } from 'react'
import type { ResizeHandle } from './useNodeResize'

interface ResizeHandlesProps {
  visible: boolean
  onResizeStart: (e: React.MouseEvent, handle: ResizeHandle) => void
}

const HANDLES: Array<{ handle: ResizeHandle; style: React.CSSProperties; cursor: string }> = [
  { handle: 'nw', style: { top: -4, left: -4 }, cursor: 'nw-resize' },
  { handle: 'n', style: { top: -4, left: '50%', marginLeft: -4 }, cursor: 'n-resize' },
  { handle: 'ne', style: { top: -4, right: -4 }, cursor: 'ne-resize' },
  { handle: 'e', style: { top: '50%', right: -4, marginTop: -4 }, cursor: 'e-resize' },
  { handle: 'se', style: { bottom: -4, right: -4 }, cursor: 'se-resize' },
  { handle: 's', style: { bottom: -4, left: '50%', marginLeft: -4 }, cursor: 's-resize' },
  { handle: 'sw', style: { bottom: -4, left: -4 }, cursor: 'sw-resize' },
  { handle: 'w', style: { top: '50%', left: -4, marginTop: -4 }, cursor: 'w-resize' },
]

export const ResizeHandles = memo(function ResizeHandles({ visible, onResizeStart }: ResizeHandlesProps) {
  if (!visible) return null

  return (
    <>
      {HANDLES.map(({ handle, style, cursor }) => (
        <div
          key={handle}
          className="canvas-node__resize-handle"
          style={{ ...style, cursor, position: 'absolute' }}
          onMouseDown={(e) => onResizeStart(e, handle)}
          role="separator"
          aria-label={`Größe ändern ${handle}`}
        />
      ))}
    </>
  )
})
