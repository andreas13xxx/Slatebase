/**
 * Text property control — single-line text input.
 * Enter or blur commits, Escape cancels.
 * Uses a key-based reset: when not editing, always shows the prop value.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from '../../../i18n'
import { useCommitOnUnmount } from './useCommitOnUnmount'

interface TextPropertyControlProps {
  value: string
  onChange: (newValue: string) => void
}

export function TextPropertyControl({ value, onChange }: TextPropertyControlProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // Whether the open edit has already been resolved (committed or cancelled).
  // A ref, not state: an explicit commit unmounts this control almost
  // immediately (the frontmatter block is rewritten), so `editing` may still
  // read `true` in the unmount flush below, but a ref is already up to date.
  const settledRef = useRef(true)

  const startEditing = useCallback(() => {
    settledRef.current = false
    setDraft(value)
    setEditing(true)
  }, [value])

  const commitDraft = useCallback(() => {
    settledRef.current = true
    if (draft !== value) {
      onChange(draft)
    }
  }, [draft, value, onChange])

  const commit = useCallback(() => {
    setEditing(false)
    commitDraft()
  }, [commitDraft])

  const cancel = useCallback(() => {
    settledRef.current = true
    setEditing(false)
  }, [])

  // Blur commits, but unmounting fires no blur — commit the open draft anyway.
  useCommitOnUnmount(() => { if (!settledRef.current) commitDraft() })

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
        className="property-control property-control--text property-control--display"
        onClick={startEditing}
        type="button"
        title={value || t('contextPanel.propertyControls.emptyValue')}
      >
        {value || <span className="property-control__placeholder">{t('contextPanel.propertyControls.emptyValue')}</span>}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className="property-control property-control--text property-control--editing"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  )
}
