import { useState, useRef, useEffect } from 'react'

/**
 * Props for the InlineInput component.
 */
export interface InlineInputProps {
  /** Initial value displayed in the input field. */
  initialValue: string
  /** Optional selection range [start, end] applied after focus. */
  selectRange?: [number, number]
  /** Called when the user confirms the input (Enter key with valid value). */
  onConfirm: (value: string) => void
  /** Called when the user cancels (Escape, blur, or empty confirm). */
  onCancel: () => void
  /** Validates the current value. Returns null if valid, or an error message string. */
  validate: (value: string) => string | null
}

/**
 * InlineInput renders a compact text input for inline file/folder name editing.
 * Auto-focuses on mount, confirms on Enter, cancels on Escape or blur.
 * Shows a validation error message below the input when validation fails.
 *
 * Validates: Requirements 3.2, 3.5, 3.8, 4.2, 4.6
 */
export function InlineInput({ initialValue, selectRange, onConfirm, onCancel, validate }: InlineInputProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    if (selectRange) {
      input.setSelectionRange(selectRange[0], selectRange[1])
    }
  }, [selectRange])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const trimmed = value.trim()
      if (!trimmed) {
        onCancel()
        return
      }
      const validationError = validate(value)
      if (validationError) {
        setError(validationError)
        return
      }
      onConfirm(trimmed)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value)
    if (error) {
      setError(null)
    }
  }

  function handleBlur() {
    onCancel()
  }

  return (
    <div className="inline-input-wrapper">
      <input
        ref={inputRef}
        type="text"
        className="inline-input"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        maxLength={255}
        aria-label="Dateiname eingeben"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'inline-input-error' : undefined}
      />
      {error && (
        <span id="inline-input-error" className="inline-input-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
