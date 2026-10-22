/**
 * WebViewerPrompt — a small modal asking for a URL to open in a web-viewer tab.
 *
 * Mirrors QuickSwitcher's overlay + focus-trap + Enter/Escape handling and
 * reuses its `.command-palette-*` styling for a consistent look. Only accepts
 * `http(s)` URLs; anything else is refused inline with a message rather than
 * opening a broken tab. The parent decides what to do with a confirmed URL.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Globe } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useTranslation } from '../i18n'
import { parseWebUrl } from './web-url'

export interface WebViewerPromptProps {
  isOpen: boolean
  onClose: () => void
  /** Called with a validated http(s) URL when the user confirms. */
  onConfirm: (url: string) => void
}

export function WebViewerPrompt({ isOpen, onClose, onConfirm }: WebViewerPromptProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  })

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue('')
      setError(null)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  const submit = useCallback(() => {
    const raw = value.trim()
    if (!raw) return
    // Accept a bare host by assuming https, then validate.
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const { valid } = parseWebUrl(candidate)
    if (!valid) {
      setError(t('webViewer.invalidUrl'))
      return
    }
    onConfirm(candidate)
    onClose()
  }, [value, onConfirm, onClose, t])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }, [submit])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className="command-palette-overlay" onClick={handleOverlayClick} role="presentation">
      <div
        ref={containerRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('webViewer.promptLabel')}
      >
        <div className="command-palette-search">
          <Globe size={14} className="command-palette-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="url"
            className="command-palette-input"
            placeholder={t('webViewer.promptPlaceholder')}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null) }}
            onKeyDown={handleKeyDown}
            aria-label={t('webViewer.promptLabel')}
          />
        </div>
        {error && <div className="command-palette-empty" role="alert">{error}</div>}
      </div>
    </div>
  )
}
