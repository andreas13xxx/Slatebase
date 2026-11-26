/**
 * Structured property control — edits a nested object or a mixed list as YAML.
 * Used where no richer widget (a plugin's) takes the value over, so such a
 * property is never flattened into text. Blur commits when the YAML is valid;
 * invalid YAML stays in the field with an error until it is fixed or reverted.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { useTranslation } from '../../../i18n'
import { extractErrorMessage } from '../../../utils/error'
import { useCommitOnUnmount } from './useCommitOnUnmount'

interface StructuredPropertyControlProps {
  value: unknown
  onChange: (newValue: unknown) => void
}

export function StructuredPropertyControl({ value, onChange }: StructuredPropertyControlProps) {
  const { t } = useTranslation()
  const text = useMemo(() => stringifyYaml(value, { indent: 2, lineWidth: 0 }).replace(/\n$/, ''), [value])
  // null = not editing: show the value as stored.
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Ref, not state: an explicit commit unmounts this control right away (see useCommitOnUnmount).
  const settledRef = useRef(true)

  const commitDraft = useCallback((): boolean => {
    settledRef.current = true
    if (draft === null || draft === text) {
      setDraft(null)
      return true
    }
    try {
      onChange(parseYaml(draft))
      setDraft(null)
      setError(null)
      return true
    } catch (err) {
      setError(extractErrorMessage(err, t('contextPanel.properties.structuredInvalid')))
      settledRef.current = false
      return false
    }
  }, [draft, text, onChange, t])

  useCommitOnUnmount(() => { if (!settledRef.current) commitDraft() })

  return (
    <div className="property-control property-control--structured">
      <textarea
        className="property-control__structured-input"
        value={draft ?? text}
        rows={Math.min(12, (draft ?? text).split('\n').length)}
        spellCheck={false}
        aria-label={t('contextPanel.properties.structuredAriaLabel')}
        aria-invalid={error !== null}
        onChange={(e) => {
          settledRef.current = false
          setDraft(e.target.value)
        }}
        onBlur={() => { commitDraft() }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            settledRef.current = true
            setDraft(null)
            setError(null)
          }
        }}
      />
      {error !== null && <p className="property-control__error" role="alert">{error}</p>}
    </div>
  )
}
