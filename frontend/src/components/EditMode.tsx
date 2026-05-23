import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Props for the EditMode component.
 * Auto-saves after a debounce period when content changes.
 */
export interface EditModeProps {
  /** Current text content (editBuffer or original content). */
  content: string
  /** Called when the user types in the textarea. */
  onChange: (content: string) => void
  /** Called to trigger a save. */
  onSave: () => void
  /** Called when the user clicks Cancel (discard changes, switch to view). */
  onCancel: () => void
  /** Whether a save operation is in progress. */
  saving: boolean
  /** Error message from a failed save, or null. */
  error: string | null
}

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

/**
 * EditMode renders a plain-text editor with auto-save.
 * Changes are automatically saved after 1.5 seconds of inactivity.
 * Shows a status indicator at the bottom (unsaved/saving/saved/error).
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7
 */
export function EditMode({ content, onChange, onSave, onCancel, saving, error }: EditModeProps) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSavingRef = useRef(false)
  const hasEditedRef = useRef(false)

  // Detect save completion
  useEffect(() => {
    if (wasSavingRef.current && !saving) {
      if (error) {
        setStatus('error')
      } else {
        setStatus('saved')
        // Reset to idle after 2 seconds
        const timer = setTimeout(() => setStatus('idle'), 2000)
        return () => clearTimeout(timer)
      }
    }
    if (saving) {
      setStatus('saving')
    }
    wasSavingRef.current = saving
  }, [saving, error])

  // Auto-save: debounce 1.5s after last edit
  const triggerAutoSave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      onSave()
    }, 1500)
  }, [onSave])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    onChange(newContent)
    hasEditedRef.current = true
    setStatus('unsaved')
    triggerAutoSave()
  }

  // Keyboard shortcut: Ctrl+S / Cmd+S to save immediately
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      onSave()
    }
  }

  const statusText = (() => {
    switch (status) {
      case 'unsaved': return '● Ungespeicherte Änderungen'
      case 'saving': return 'Speichern…'
      case 'saved': return '✓ Gespeichert'
      case 'error': return `✗ Fehler: ${error ?? 'Unbekannt'}`
      default: return ''
    }
  })()

  const statusClass = (() => {
    switch (status) {
      case 'saving': return 'edit-mode-status edit-mode-status--saving'
      case 'saved': return 'edit-mode-status edit-mode-status--saved'
      case 'error': return 'edit-mode-status edit-mode-status--error'
      default: return 'edit-mode-status'
    }
  })()

  return (
    <div style={containerStyle}>
      <textarea
        style={textareaStyle}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={saving}
        aria-label="Dateiinhalt bearbeiten"
        spellCheck={false}
      />

      {status !== 'idle' && (
        <div className={statusClass} role={status === 'error' ? 'alert' : 'status'}>
          <span>{statusText}</span>
        </div>
      )}
    </div>
  )
}

/* Inline styles */

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}

const textareaStyle: React.CSSProperties = {
  flex: 1,
  fontFamily: 'monospace',
  fontSize: '14px',
  lineHeight: '1.5',
  padding: '12px',
  border: 'none',
  borderRadius: 0,
  resize: 'none',
  outline: 'none',
  whiteSpace: 'pre',
  overflowWrap: 'normal',
  overflow: 'auto',
}
