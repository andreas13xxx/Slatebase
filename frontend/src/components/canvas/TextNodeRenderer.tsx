/**
 * TextNodeRenderer — Renders a text node with Markdown content.
 * Supports drag/move, resize, and inline text editing (double-click).
 * Renders Markdown in preview mode, raw text in edit mode.
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import type { TextNode } from '../../canvas/types'
import type { DirectoryTree } from '../../types'
import { getCanvasColorClass } from './canvas-utils'
import { renderSimpleMarkdown } from './markdown-render.tsx'
import { useNodeDrag } from './useNodeDrag'
import { useNodeResize } from './useNodeResize'
import { ResizeHandles } from './ResizeHandles'
import { NodeAnchors } from './NodeAnchors'

export interface TextNodeRendererProps {
  node: TextNode
  vaultId: string
  selected: boolean
  onSelect: (additive: boolean) => void
  onTextChange: (text: string) => void
  directoryTree: DirectoryTree | null
  readOnly: boolean
  token?: string
  /** Whether this node should be in edit mode (from context menu). */
  editing?: boolean
  /** Callback when edit mode should end. */
  onEditEnd?: () => void
}

export const TextNodeRenderer = memo(function TextNodeRenderer({
  node, selected, onSelect, onTextChange, readOnly, editing: externalEditing, onEditEnd,
}: TextNodeRendererProps) {
  const colorClass = getCanvasColorClass(node.color)
  const [internalEditing, setInternalEditing] = useState(false)
  const editing = externalEditing || internalEditing
  const [editText, setEditText] = useState(node.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { onDragStart, hasDraggedRef: _hasDraggedRef } = useNodeDrag(node.id, readOnly)
  const { onResizeStart } = useNodeResize(node.id, readOnly)

  // Sync editText when node.text changes from external (undo etc.)
  useEffect(() => {
    if (!editing) setEditText(node.text)
  }, [node.text, editing])

  // Focus textarea when entering edit mode. Deferred via rAF so the focus
  // wins the race against the context menu (portal) unmounting in the same
  // commit — otherwise focus falls back to the body and keystrokes are
  // swallowed by the global canvas key handler.
  useEffect(() => {
    if (!editing) return
    const raf = requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    })
    return () => cancelAnimationFrame(raf)
  }, [editing])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || editing) return
    onSelect(e.shiftKey)
    onDragStart(e)
  }, [editing, onSelect, onDragStart])

  const handleDoubleClick = useCallback(() => {
    if (readOnly) return
    setInternalEditing(true)
    setEditText(node.text)
  }, [readOnly, node.text])

  // Prevent mouse events from closing edit mode prematurely
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
  }, [])

  const finishEditing = useCallback(() => {
    setInternalEditing(false)
    onEditEnd?.()
    if (editText !== node.text) {
      onTextChange(editText)
    }
  }, [editText, node.text, onTextChange, onEditEnd])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setInternalEditing(false)
      onEditEnd?.()
      setEditText(node.text) // Discard changes
    }
  }, [node.text, onEditEnd])

  return (
    <div
      className={`canvas-node canvas-node--text ${colorClass} ${selected ? 'canvas-node--selected' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
      data-node-id={node.id}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      role="button"
      tabIndex={0}
      aria-label={`Textknoten${readOnly ? ' (nur lesen)' : ''}`}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          className="canvas-node__text-editor"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={finishEditing}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          aria-label="Text bearbeiten"
        />
      ) : (
        <div className="canvas-node__content canvas-node__text-content">
          {node.text ? (
            <div className="canvas-node__md-preview">
              {renderSimpleMarkdown(node.text)}
            </div>
          ) : (
            <span className="canvas-node__placeholder">Doppelklick zum Bearbeiten</span>
          )}
        </div>
      )}
      <ResizeHandles visible={selected && !readOnly && !editing} onResizeStart={onResizeStart} />
      <NodeAnchors nodeId={node.id} width={node.width} height={node.height} visible={selected && !readOnly && !editing} />
    </div>
  )
})
