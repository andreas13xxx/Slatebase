/**
 * EdgeContextMenu — Context menu for editing edge properties.
 * Appears on right-click on an edge. Allows editing label and toggling arrow endpoints.
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import type { CanvasEdge, EdgeEnd } from '../../canvas/types'

export interface EdgeContextMenuProps {
  edge: CanvasEdge
  position: { x: number; y: number }
  onClose: () => void
  onUpdateLabel: (edgeId: string, label: string) => void
  onUpdateArrows: (edgeId: string, fromEnd: EdgeEnd | undefined, toEnd: EdgeEnd | undefined) => void
  onDelete: (edgeId: string) => void
}

export const EdgeContextMenu = memo(function EdgeContextMenu({
  edge, position, onClose, onUpdateLabel, onUpdateArrows, onDelete,
}: EdgeContextMenuProps) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(edge.label ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Focus input when entering label edit mode
  useEffect(() => {
    if (editingLabel && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingLabel])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Close when focus leaves the window (e.g. clicking into a cross-origin
    // iframe such as a canvas link-node preview).
    function handleWindowBlur() {
      onClose()
    }
    // Registered in the capture phase so node drag handlers calling
    // stopPropagation() can't prevent the event from reaching this handler.
    document.addEventListener('mousedown', handleClickOutside, true)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleLabelSave = useCallback(() => {
    onUpdateLabel(edge.id, labelValue)
    setEditingLabel(false)
  }, [edge.id, labelValue, onUpdateLabel])

  const handleLabelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleLabelSave()
    }
    if (e.key === 'Escape') {
      setEditingLabel(false)
      setLabelValue(edge.label ?? '')
    }
  }, [handleLabelSave, edge.label])

  const toggleFromArrow = useCallback(() => {
    const newFromEnd: EdgeEnd | undefined = edge.fromEnd === 'arrow' ? 'none' : 'arrow'
    onUpdateArrows(edge.id, newFromEnd, edge.toEnd)
  }, [edge, onUpdateArrows])

  const toggleToArrow = useCallback(() => {
    const newToEnd: EdgeEnd | undefined = edge.toEnd === 'none' ? 'arrow' : 'none'
    onUpdateArrows(edge.id, edge.fromEnd, newToEnd)
  }, [edge, onUpdateArrows])

  return (
    <div
      ref={menuRef}
      className="canvas-edge-context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Kantenmenü"
    >
      {/* Label editing */}
      <div className="canvas-edge-context-menu__section">
        {editingLabel ? (
          <div className="canvas-edge-context-menu__label-edit">
            <input
              ref={inputRef}
              type="text"
              className="canvas-edge-context-menu__label-input"
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onKeyDown={handleLabelKeyDown}
              onBlur={handleLabelSave}
              placeholder="Beschriftung…"
              aria-label="Kantenbeschriftung"
            />
          </div>
        ) : (
          <button
            type="button"
            className="canvas-edge-context-menu__item"
            onClick={() => setEditingLabel(true)}
            role="menuitem"
          >
            {edge.label ? `Beschriftung: "${edge.label}"` : 'Beschriftung hinzufügen…'}
          </button>
        )}
      </div>

      {/* Arrow toggles */}
      <div className="canvas-edge-context-menu__section">
        <button
          type="button"
          className={`canvas-edge-context-menu__item ${edge.fromEnd === 'arrow' ? 'canvas-edge-context-menu__item--active' : ''}`}
          onClick={toggleFromArrow}
          role="menuitemcheckbox"
          aria-checked={edge.fromEnd === 'arrow'}
        >
          ← Pfeil am Anfang {edge.fromEnd === 'arrow' ? '✓' : ''}
        </button>
        <button
          type="button"
          className={`canvas-edge-context-menu__item ${edge.toEnd !== 'none' ? 'canvas-edge-context-menu__item--active' : ''}`}
          onClick={toggleToArrow}
          role="menuitemcheckbox"
          aria-checked={edge.toEnd !== 'none'}
        >
          → Pfeil am Ende {edge.toEnd !== 'none' ? '✓' : ''}
        </button>
      </div>

      {/* Delete */}
      <div className="canvas-edge-context-menu__section canvas-edge-context-menu__section--danger">
        <button
          type="button"
          className="canvas-edge-context-menu__item canvas-edge-context-menu__item--danger"
          onClick={() => { onDelete(edge.id); onClose() }}
          role="menuitem"
        >
          Kante löschen
        </button>
      </div>
    </div>
  )
})
