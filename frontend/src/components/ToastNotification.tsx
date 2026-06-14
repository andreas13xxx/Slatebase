import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Info, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import './ToastNotification.css'

/** Toast notification variant. */
export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

/** A single toast item in the queue. */
export interface ToastItem {
  id: string
  variant: ToastVariant
  message: string
  createdAt: number
}

// Module-level event system for adding toasts from anywhere
type ToastListener = (toast: Omit<ToastItem, 'id' | 'createdAt'>) => void
let addToastListener: ToastListener | null = null

/** Add a toast notification from anywhere in the app. */
// eslint-disable-next-line react-refresh/only-export-components
export function showToast(variant: ToastVariant, message: string): void {
  addToastListener?.({ variant, message })
}

/** Maximum number of simultaneously visible toasts. */
const MAX_VISIBLE_TOASTS = 5

/** Auto-dismiss duration in milliseconds. */
const AUTO_DISMISS_MS = 5000

/** Fade-out animation duration in milliseconds. */
const FADE_OUT_MS = 300

/** Map variant to its Lucide icon component. */
const VARIANT_ICONS = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
} as const

let nextToastId = 0

/**
 * Toast notification stack component.
 * Renders at the bottom-right of the viewport.
 * Manages its own internal toast queue.
 */
export function ToastNotification() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set())
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  /** Remove a toast from the list (after fade-out completes). */
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    setFadingOut((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    // Clean up timers
    const dismissTimer = dismissTimersRef.current.get(id)
    if (dismissTimer) {
      clearTimeout(dismissTimer)
      dismissTimersRef.current.delete(id)
    }
    const fadeTimer = fadeTimersRef.current.get(id)
    if (fadeTimer) {
      clearTimeout(fadeTimer)
      fadeTimersRef.current.delete(id)
    }
  }, [])

  /** Start the fade-out animation then remove after FADE_OUT_MS. */
  const startFadeOut = useCallback((id: string) => {
    setFadingOut((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    const fadeTimer = setTimeout(() => {
      removeToast(id)
    }, FADE_OUT_MS)
    fadeTimersRef.current.set(id, fadeTimer)
  }, [removeToast])

  /** Handle close button click — immediate fade-out. */
  const handleClose = useCallback((id: string) => {
    // Cancel the auto-dismiss timer
    const dismissTimer = dismissTimersRef.current.get(id)
    if (dismissTimer) {
      clearTimeout(dismissTimer)
      dismissTimersRef.current.delete(id)
    }
    startFadeOut(id)
  }, [startFadeOut])

  /** Add a new toast to the queue. */
  const addToast = useCallback((incoming: Omit<ToastItem, 'id' | 'createdAt'>) => {
    const id = `toast-${nextToastId++}`
    const newToast: ToastItem = {
      id,
      variant: incoming.variant,
      message: incoming.message,
      createdAt: Date.now(),
    }

    setToasts((prev) => {
      let updated = [...prev, newToast]
      // Enforce max visible limit — remove oldest when exceeding
      while (updated.length > MAX_VISIBLE_TOASTS) {
        const oldest = updated[0]
        if (oldest) {
          // Clean up the timer for the evicted toast
          const timer = dismissTimersRef.current.get(oldest.id)
          if (timer) {
            clearTimeout(timer)
            dismissTimersRef.current.delete(oldest.id)
          }
          const fTimer = fadeTimersRef.current.get(oldest.id)
          if (fTimer) {
            clearTimeout(fTimer)
            fadeTimersRef.current.delete(oldest.id)
          }
        }
        updated = updated.slice(1)
      }
      return updated
    })

    // Auto-dismiss after 5 seconds
    const dismissTimer = setTimeout(() => {
      dismissTimersRef.current.delete(id)
      startFadeOut(id)
    }, AUTO_DISMISS_MS)
    dismissTimersRef.current.set(id, dismissTimer)
  }, [startFadeOut])

  // Register the module-level listener on mount
  useEffect(() => {
    addToastListener = addToast
    return () => {
      addToastListener = null
    }
  }, [addToast])

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      dismissTimersRef.current.forEach((timer) => clearTimeout(timer))
      fadeTimersRef.current.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="toast-notification-container" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = VARIANT_ICONS[toast.variant]
        const isFading = fadingOut.has(toast.id)

        return (
          <div
            key={toast.id}
            className={`toast-notification-item toast-notification-item--${toast.variant}${isFading ? ' toast-notification-item--fading' : ''}`}
            role="alert"
          >
            <Icon size={16} className="toast-notification-item__icon" />
            <span className="toast-notification-item__message">{toast.message}</span>
            <button
              type="button"
              className="toast-notification-item__close"
              onClick={() => handleClose(toast.id)}
              aria-label="Schließen"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
