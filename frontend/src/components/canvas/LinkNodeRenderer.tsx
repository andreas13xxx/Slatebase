/**
 * LinkNodeRenderer — Renders an external URL link node with iframe content preview.
 * In preview mode: shows an iframe of the URL (sandboxed).
 * In edit mode: allows editing the URL.
 * Supports drag/move, resize, and double-click to open URL externally.
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react'
import { ExternalLink, Globe } from 'lucide-react'
import type { LinkNode } from '../../canvas/types'
import { getCanvasColorClass } from './canvas-utils'
import { useNodeDrag } from './useNodeDrag'
import { useNodeResize } from './useNodeResize'
import { ResizeHandles } from './ResizeHandles'
import { NodeAnchors } from './NodeAnchors'

export interface LinkNodeRendererProps {
  node: LinkNode
  selected: boolean
  onSelect: (additive: boolean) => void
  onUrlChange?: (newUrl: string) => void
  readOnly: boolean
  /** Whether this node is in edit mode. */
  editing?: boolean
  /** Callback when edit mode should end. */
  onEditEnd?: () => void
}

export const LinkNodeRenderer = memo(function LinkNodeRenderer({
  node, selected, onSelect, onUrlChange, readOnly, editing, onEditEnd,
}: LinkNodeRendererProps) {
  const colorClass = getCanvasColorClass(node.color)
  const [editUrl, setEditUrl] = useState(node.url)
  const inputRef = useRef<HTMLInputElement>(null)

  const { onDragStart } = useNodeDrag(node.id, readOnly)
  const { onResizeStart } = useNodeResize(node.id, readOnly)

  /** Extract display hostname from URL. */
  let displayUrl = node.url
  try {
    const url = new URL(node.url)
    displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname : '')
  } catch {
    // Keep original if invalid URL
  }

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  // Sync editUrl when node.url changes externally
  useEffect(() => {
    if (!editing) setEditUrl(node.url)
  }, [node.url, editing])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || editing) return
    onSelect(e.shiftKey)
    onDragStart(e)
  }, [onSelect, onDragStart, editing])

  const finishEditing = useCallback(() => {
    if (editUrl.trim() && editUrl !== node.url && onUrlChange) {
      onUrlChange(editUrl.trim())
    }
    onEditEnd?.()
  }, [editUrl, node.url, onUrlChange, onEditEnd])

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      finishEditing()
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      setEditUrl(node.url)
      onEditEnd?.()
    }
  }, [finishEditing, node.url, onEditEnd])

  /** Check if the URL is valid for iframe embedding. */
  const isValidUrl = (() => {
    try {
      const url = new URL(node.url)
      return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
      return false
    }
  })()

  // ─── Edit Mode ──────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div
        className={`canvas-node canvas-node--link ${colorClass} ${selected ? 'canvas-node--selected' : ''}`}
        style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
        data-node-id={node.id}
      >
        <div className="canvas-node__content canvas-node__link-edit">
          <label className="canvas-node__edit-label">URL:</label>
          <input
            ref={inputRef}
            type="url"
            className="canvas-node__edit-input"
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            onBlur={finishEditing}
            onKeyDown={handleEditKeyDown}
            placeholder="https://example.com"
            aria-label="URL bearbeiten"
          />
        </div>
      </div>
    )
  }

  // ─── Content Preview ────────────────────────────────────────────────────
  // Show iframe preview for nodes larger than a threshold
  const showIframe = isValidUrl && node.width >= 200 && node.height >= 150

  return (
    <div
      className={`canvas-node canvas-node--link ${colorClass} ${selected ? 'canvas-node--selected' : ''}`}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      data-node-id={node.id}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => {
        window.open(node.url, '_blank', 'noopener,noreferrer')
      }}
      role="button"
      tabIndex={0}
      aria-label={`Link: ${node.url}`}
    >
      {showIframe ? (
        <div className="canvas-node__link-preview">
          <div className="canvas-node__link-preview-header" onMouseDown={handleMouseDown}>
            <Globe size={12} />
            <span className="canvas-node__link-preview-url" title={node.url}>{displayUrl}</span>
            <ExternalLink size={12} className="canvas-node__link-preview-external" />
          </div>
          <iframe
            src={node.url}
            className="canvas-node__link-iframe"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title={`Vorschau: ${displayUrl}`}
            loading="lazy"
          />
        </div>
      ) : (
        <div className="canvas-node__content canvas-node__link-content">
          <ExternalLink size={14} className="canvas-node__link-icon" />
          <span className="canvas-node__link-url" title={node.url}>{displayUrl}</span>
        </div>
      )}
      <ResizeHandles visible={selected && !readOnly && !editing} onResizeStart={onResizeStart} />
      <NodeAnchors nodeId={node.id} width={node.width} height={node.height} visible={selected && !readOnly && !editing} />
    </div>
  )
})
