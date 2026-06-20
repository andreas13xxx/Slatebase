/**
 * CanvasSourceView — Displays the raw JSON source of the canvas document.
 * Allows direct editing in source mode (non-read-only).
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { serializeCanvas } from '../../canvas'
import type { CanvasDocument } from '../../canvas/types'

export interface CanvasSourceViewProps {
  /** Current canvas document. */
  document: CanvasDocument
  /** Whether the canvas is read-only. */
  readOnly: boolean
  /** Apply changes from source editing. */
  onApplySource: (json: string) => void
}

export const CanvasSourceView = memo(function CanvasSourceView({
  document, readOnly, onApplySource,
}: CanvasSourceViewProps) {
  const serialized = serializeCanvas(document)
  const [editValue, setEditValue] = useState(serialized)
  const [parseError, setParseError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastDocRef = useRef(document)

  // Sync textarea when document changes externally (undo, visual edits)
  useEffect(() => {
    if (document !== lastDocRef.current) {
      const newSerialized = serializeCanvas(document)
      setEditValue(newSerialized)
      setParseError(null)
      lastDocRef.current = document
    }
  }, [document])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setEditValue(value)

    // Validate JSON on change
    try {
      JSON.parse(value)
      setParseError(null)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Ungültiges JSON')
    }
  }, [])

  const handleApply = useCallback(() => {
    if (parseError) return
    try {
      JSON.parse(editValue) // Final validation
      onApplySource(editValue)
      setParseError(null)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Ungültiges JSON')
    }
  }, [editValue, parseError, onApplySource])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl+S to apply
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleApply()
    }
    // Tab to insert tab character
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const value = ta.value
      const newValue = value.slice(0, start) + '\t' + value.slice(end)
      setEditValue(newValue)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 1
      })
    }
  }, [handleApply])

  return (
    <div className="canvas-source-view">
      <div className="canvas-source-view__header">
        <span className="canvas-source-view__title">Quelltext (.canvas JSON)</span>
        {!readOnly && (
          <button
            type="button"
            className="canvas-source-view__apply-btn"
            onClick={handleApply}
            disabled={!!parseError}
            title="Änderungen übernehmen (Ctrl+S)"
          >
            Übernehmen
          </button>
        )}
      </div>
      {parseError && (
        <div className="canvas-source-view__error" role="alert">
          {parseError}
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="canvas-source-view__editor"
        value={editValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        spellCheck={false}
        aria-label="Canvas JSON Quelltext"
      />
    </div>
  )
})
