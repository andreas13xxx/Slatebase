import { useCallback, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import './InfoModal.css'

export interface InfoModalProps {
  open: boolean
  title: string
  closeLabel?: string
  onClose: () => void
  children: ReactNode
}

/**
 * Shared chrome (overlay, focus-trapped panel, header + close button,
 * scrollable body) for simple read-only info dialogs — Release Notes and
 * Debug Info both use this instead of duplicating the same overlay/panel
 * markup twice. Modeled on PluginDetailPanel's overlay/panel structure.
 */
export function InfoModal({ open, title, closeLabel = 'Close', onClose, children }: InfoModalProps) {
  const containerRef = useFocusTrap<HTMLDivElement>({
    isActive: open,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  })

  const handleOverlayClick = useCallback((e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!open) return null

  return createPortal(
    <div className="info-modal-overlay" onClick={handleOverlayClick} role="presentation">
      <div
        ref={containerRef}
        className="info-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-modal-title"
      >
        <div className="info-modal__header">
          <span id="info-modal-title" className="info-modal__title">{title}</span>
          <button type="button" className="info-modal__close" onClick={onClose} aria-label={closeLabel}>
            <X size={18} />
          </button>
        </div>
        <div className="info-modal__content">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
