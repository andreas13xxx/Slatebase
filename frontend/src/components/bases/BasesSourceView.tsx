/**
 * BasesSourceView — raw `.base` YAML editor, mirroring CanvasSourceView.
 * A fallback for fields the table UI does not expose and for direct editing.
 */

import { useTranslation, translateNow } from '../../i18n'
import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { parseBase } from '@slatebase/shared-contracts'

export interface BasesSourceViewProps {
  /** Current raw `.base` YAML. */
  source: string
  /** Whether the base is read-only. */
  readOnly: boolean
  /** Apply edited YAML (validated as parseable before the callback fires). */
  onApplySource: (yaml: string) => void
}

export const BasesSourceView = memo(function BasesSourceView({ source, readOnly, onApplySource }: BasesSourceViewProps) {
  const { t } = useTranslation()
  const [editValue, setEditValue] = useState(source)
  const [parseError, setParseError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastSourceRef = useRef(source)

  useEffect(() => {
    if (source !== lastSourceRef.current) {
      setEditValue(source)
      setParseError(null)
      lastSourceRef.current = source
    }
  }, [source])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setEditValue(value)
    const result = parseBase(value)
    setParseError(result.success ? null : (result.errors[0]?.message ?? translateNow('basesUi.invalidYaml')))
  }, [])

  const handleApply = useCallback(() => {
    const result = parseBase(editValue)
    if (!result.success) {
      setParseError(result.errors[0]?.message ?? translateNow('basesUi.invalidYaml'))
      return
    }
    setParseError(null)
    onApplySource(editValue)
  }, [editValue, onApplySource])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleApply()
    }
  }, [handleApply])

  return (
    <div className="bases-source-view">
      <div className="bases-source-view__header">
        <span className="bases-source-view__title">{t('basesUi.sourceTitle')}</span>
        {!readOnly && (
          <button
            type="button"
            className="bases-source-view__apply-btn"
            onClick={handleApply}
            disabled={!!parseError}
            title={t('basesUi.applyChanges')}
          >
            {t('basesUi.apply')}
          </button>
        )}
      </div>
      {parseError && <div className="bases-source-view__error" role="alert">{parseError}</div>}
      <textarea
        ref={textareaRef}
        className="bases-source-view__editor"
        value={editValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        spellCheck={false}
        aria-label={t('basesUi.sourceLabel')}
      />
    </div>
  )
})
