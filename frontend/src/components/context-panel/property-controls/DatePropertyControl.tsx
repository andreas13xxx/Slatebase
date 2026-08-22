/**
 * Date property control — native date picker or manual ISO field.
 * Supports both 'date' (YYYY-MM-DD) and 'datetime' (YYYY-MM-DDTHH:mm) types.
 */

import { useCallback } from 'react'
import { useTranslation } from '../../../i18n'

interface DatePropertyControlProps {
  value: string
  onChange: (newValue: string) => void
  includeTime?: boolean
}

export function DatePropertyControl({ value, onChange, includeTime = false }: DatePropertyControlProps) {
  const { t } = useTranslation()
  const inputType = includeTime ? 'datetime-local' : 'date'

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    if (newValue) {
      onChange(newValue)
    }
  }, [onChange])

  return (
    <input
      type={inputType}
      className={`property-control property-control--date${includeTime ? 'time' : ''}`}
      value={value || ''}
      onChange={handleChange}
      aria-label={includeTime ? t('contextPanel.propertyControls.dateTimeAriaLabel') : t('contextPanel.propertyControls.dateAriaLabel')}
    />
  )
}
