/**
 * Date property control — native date picker or manual ISO field.
 * Supports both 'date' (YYYY-MM-DD) and 'datetime' (YYYY-MM-DDTHH:mm) types.
 *
 * Like the text and number controls, edits are held in a local draft and only
 * committed on blur or Enter. Committing on every `change` event is wrong here
 * for a structural reason: a commit rewrites the frontmatter block, which tears
 * down and remounts the whole properties editor (and this input with it). A
 * native date input fires `change` once per completed segment, so the first
 * segment the user touched destroyed the field they were still typing into.
 */

import { useCallback, useState } from 'react'
import { useTranslation } from '../../../i18n'

interface DatePropertyControlProps {
  value: string
  /** Receives null when the field is cleared, so the property stays but goes blank. */
  onChange: (newValue: string | null) => void
  includeTime?: boolean
}

export function DatePropertyControl({ value, onChange, includeTime = false }: DatePropertyControlProps) {
  const { t } = useTranslation()
  const inputType = includeTime ? 'datetime-local' : 'date'
  const [draft, setDraft] = useState(value || '')

  // Follow the document when the value changes underneath us — an external
  // edit, an undo, or the raw YAML being edited directly. Adjusted during
  // render (React's documented prop-change reset) rather than in an effect,
  // which would render the stale draft first.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value || '')
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value)
  }, [])

  const commit = useCallback(() => {
    if (draft === (value || '')) return
    onChange(draft === '' ? null : draft)
  }, [draft, value, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(value || '')
    }
  }, [commit, value])

  return (
    <input
      type={inputType}
      className={`property-control property-control--date${includeTime ? 'time' : ''}`}
      value={draft}
      onChange={handleChange}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      aria-label={includeTime ? t('contextPanel.propertyControls.dateTimeAriaLabel') : t('contextPanel.propertyControls.dateAriaLabel')}
    />
  )
}
