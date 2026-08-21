/**
 * List property control — chip editor (add/remove items).
 * Each array item renders as a chip with a remove button.
 * A text input at the end allows adding new items (Enter to add).
 */

import { useState, useCallback, useRef } from 'react'
import { X } from 'lucide-react'

interface ListPropertyControlProps {
  value: string[]
  onChange: (newValue: string[]) => void
  /** Optional autocomplete suggestions (used by TagsPropertyControl). */
  suggestions?: string[]
}

export function ListPropertyControl({ value, onChange, suggestions }: ListPropertyControlProps) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addItem = useCallback((item: string) => {
    const trimmed = item.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInputValue('')
    setShowSuggestions(false)
  }, [value, onChange])

  const removeItem = useCallback((index: number) => {
    const newValue = [...value]
    newValue.splice(index, 1)
    onChange(newValue)
  }, [value, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (inputValue.trim()) {
        addItem(inputValue)
      }
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      // Remove last chip on backspace in empty input
      removeItem(value.length - 1)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }, [inputValue, value, addItem, removeItem])

  const filteredSuggestions = suggestions && inputValue
    ? suggestions.filter((s) =>
      s.toLowerCase().startsWith(inputValue.toLowerCase()) && !value.includes(s)
    ).slice(0, 8)
    : []

  return (
    <div className="property-control property-control--list">
      <div className="property-control__chips">
        {value.map((item, i) => (
          <span key={`${item}-${i}`} className="property-control__chip">
            {item}
            <button
              type="button"
              className="property-control__chip-remove"
              onClick={() => removeItem(i)}
              aria-label={`${item} entfernen`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="property-control__chip-input"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setShowSuggestions(true)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Delay to allow click on suggestion
            setTimeout(() => setShowSuggestions(false), 150)
          }}
          placeholder="Hinzufügen..."
          aria-label="Eintrag hinzufügen"
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul className="property-control__suggestions" role="listbox">
          {filteredSuggestions.map((suggestion) => (
            <li
              key={suggestion}
              className="property-control__suggestion-item"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); addItem(suggestion) }}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
