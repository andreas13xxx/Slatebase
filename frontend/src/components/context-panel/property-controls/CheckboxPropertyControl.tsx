/**
 * Checkbox property control — toggle switch for boolean values.
 */

import { useCallback } from 'react'

interface CheckboxPropertyControlProps {
  value: boolean | string
  onChange: (newValue: boolean) => void
}

export function CheckboxPropertyControl({ value, onChange }: CheckboxPropertyControlProps) {
  const checked = value === true || value === 'true'

  const handleChange = useCallback(() => {
    onChange(!checked)
  }, [checked, onChange])

  return (
    <label className="property-control property-control--checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        className="property-control__checkbox-input"
      />
      <span className="property-control__checkbox-label">
        {checked ? 'true' : 'false'}
      </span>
    </label>
  )
}
