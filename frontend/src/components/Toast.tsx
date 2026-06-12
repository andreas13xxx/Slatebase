import { useState, useCallback, createContext, useContext, useRef, useEffect } from 'react'
import React from 'react'
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react'

/** Toast notification variant. */
export type ToastVariant = 'error' | 'success' | 'info'

/** A single toast entry. */
interface ToastEntry {
  id: number
  message: string
  variant: ToastVariant
}

/** Context value for the toast system. */
export interface ToastContextValue {
  /** Show a toast notification. Auto-dismisses after duration (default 5s). */
  showToast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 0

/**
 * Provider that renders toast notifications at the bottom-right of the viewport.
 * Wrap your app (or a subtree) with this to enable `useToast()`.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const showToast = useCallback((message: string, variant: ToastVariant = 'error') => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, variant }])

    const duration = variant === 'error' ? 6000 : 4000
    const timer = setTimeout(() => {
      dismiss(id)
    }, duration)
    timersRef.current.set(id, timer)
  }, [dismiss])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  const contextValue: ToastContextValue = { showToast }

  return React.createElement(
    ToastContext.Provider,
    { value: contextValue },
    children,
    toasts.length > 0 && React.createElement(
      'div',
      { className: 'toast-container', 'aria-live': 'polite', 'aria-atomic': 'false' },
      toasts.map((toast) => React.createElement(ToastItem, {
        key: toast.id,
        toast,
        onDismiss: dismiss,
      })),
    ),
  )
}

/** Individual toast notification item. */
function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  const Icon = toast.variant === 'error' ? AlertCircle
    : toast.variant === 'success' ? CheckCircle
    : Info

  return (
    <div className={`toast toast--${toast.variant}`} role="alert">
      <Icon size={16} className="toast-icon" />
      <span className="toast-message">{toast.message}</span>
      <button
        type="button"
        className="toast-dismiss"
        onClick={() => onDismiss(toast.id)}
        aria-label="Schließen"
      >
        <X size={14} />
      </button>
    </div>
  )
}

/**
 * Hook to show toast notifications.
 * Falls back to console.error if used outside ToastProvider (e.g. in tests).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (context === null) {
    // Graceful fallback for tests without provider
    return {
      showToast: (message, variant) => {
        console.error(`[Toast ${variant ?? 'error'}] ${message}`)
      },
    }
  }
  return context
}
