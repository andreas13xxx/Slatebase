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
  /** Auto-dismiss delay in ms; 0 means stay until dismissed programmatically or by the user. */
  duration: number
}

// Module-level event system for adding/updating/dismissing toasts from anywhere.
// The id is minted here (not inside the component) so callers — notably the
// Obsidian `Notice` compat shim, which must hand a stable id back to the
// plugin for `notice.hide()` — get it back synchronously from `showToast()`.
type ToastListener = (toast: Omit<ToastItem, 'createdAt'>) => void
let addToastListener: ToastListener | null = null
type ToastUpdateListener = (id: string, message: string) => void
let updateToastListener: ToastUpdateListener | null = null
type ToastDismissListener = (id: string) => void
let dismissToastListener: ToastDismissListener | null = null

let nextToastId = 0

/**
 * Add a toast notification from anywhere in the app.
 * Returns the toast's id — pass it to `updateToastMessage()`/`dismissToast()`
 * to change or close this specific toast later.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function showToast(variant: ToastVariant, message: string, duration = AUTO_DISMISS_MS): string {
  const id = `toast-${nextToastId++}`
  addToastListener?.({ id, variant, message, duration })
  return id
}

/** Replace the message of an already-shown toast in place, without spawning a new one. */
// eslint-disable-next-line react-refresh/only-export-components
export function updateToastMessage(id: string, message: string): void {
  updateToastListener?.(id, message)
}

/** Dismiss a specific toast immediately (cancels its auto-dismiss timer first, if any). */
// eslint-disable-next-line react-refresh/only-export-components
export function dismissToast(id: string): void {
  dismissToastListener?.(id)
}

/** Maximum number of simultaneously visible toasts. */
const MAX_VISIBLE_TOASTS = 5

/** Default auto-dismiss duration in milliseconds. */
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

  /** Add a new toast to the queue. The id is supplied by the caller (see showToast()). */
  const addToast = useCallback((incoming: Omit<ToastItem, 'createdAt'>) => {
    const { id } = incoming
    const newToast: ToastItem = {
      ...incoming,
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

    // duration: 0 means "stay until dismissed" (Obsidian's Notice semantics) — no timer.
    if (incoming.duration > 0) {
      const dismissTimer = setTimeout(() => {
        dismissTimersRef.current.delete(id)
        startFadeOut(id)
      }, incoming.duration)
      dismissTimersRef.current.set(id, dismissTimer)
    }
  }, [startFadeOut])

  /** Replace an already-shown toast's message in place. */
  const updateToast = useCallback((id: string, message: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, message } : t)))
  }, [])

  // Register the module-level listeners on mount
  useEffect(() => {
    addToastListener = addToast
    updateToastListener = updateToast
    dismissToastListener = handleClose
    return () => {
      addToastListener = null
      updateToastListener = null
      dismissToastListener = null
    }
  }, [addToast, updateToast, handleClose])

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
