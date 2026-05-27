import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from '../i18n'

export interface ConfirmModalProps {
  /** Whether the modal is visible. */
  open: boolean
  /** Title displayed at the top of the modal. */
  title: string
  /** Main message body (supports newlines via whitespace CSS). */
  message: string
  /** Label for the confirm button. Defaults to common.confirm. */
  confirmLabel?: string
  /** Label for the cancel button. Defaults to common.cancel. */
  cancelLabel?: string
  /** Visual variant for the confirm button. */
  variant?: 'danger' | 'primary'
  /** Called when the user confirms. */
  onConfirm: () => void
  /** Called when the user cancels (or presses Escape). */
  onCancel: () => void
}

/**
 * Reusable confirmation modal that replaces window.confirm.
 * Renders as a fixed overlay with focus trap and Escape key support.
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus the cancel button when modal opens (safer default)
  useEffect(() => {
    if (open) {
      cancelRef.current?.focus()
    }
  }, [open])

  // Handle Escape key
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="confirm-modal-overlay" onClick={onCancel} role="presentation">
      <div
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-header">
          {variant === 'danger' && (
            <span className="confirm-modal-icon confirm-modal-icon--danger">
              <AlertTriangle size={18} />
            </span>
          )}
          <h2 id="confirm-modal-title" className="confirm-modal-title">{title}</h2>
        </div>
        <p id="confirm-modal-message" className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button
            ref={cancelRef}
            type="button"
            className="confirm-modal-btn confirm-modal-btn--cancel"
            onClick={onCancel}
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`confirm-modal-btn confirm-modal-btn--${variant}`}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
