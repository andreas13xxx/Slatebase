/**
 * Number property control — numeric input with validation.
 * Enter or blur commits, Escape cancels.
 * Uses a key-based reset: when not editing, always shows the prop value.
 */

import { useState, useCallback, useRef, useEffect } from 'react'

interface NumberPropertyControlProps {
  value: number | string
  onChange: (newValue: number) => void
}

export function NumberPropertyControl({ value, onChange }: NumberPropertyControlProps) {
  const numValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEditing = useCallback(() => {
    setDraft(String(numValue))
    setEditing(true)
  }, [numValue])

  const commit = useCallback(() => {
    setEditing(false)
    const parsed = parseFloat(draft)
    if (!isNaN(parsed) && parsed !== numValue) {
      onChange(parsed)
    }
  }, [draft, numValue, onChange])

  const cancel = useCallback(() => {
    setEditing(false)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }, [commit, cancel])

  if (!editing) {
    return (
      <button
        className="property-control property-control--number property-control--display"
        onClick={startEditing}
        type="button"
      >
        {numValue}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      type="number"
      step="any"
      className="property-control property-control--number property-control--editing"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  )
}
