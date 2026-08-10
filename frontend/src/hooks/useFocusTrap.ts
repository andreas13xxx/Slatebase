import { useRef, useEffect, useCallback, type RefObject } from 'react'

/**
 * Options for the `useFocusTrap` hook.
 */
export interface UseFocusTrapOptions {
  /** Whether the focus trap is currently active. */
  isActive: boolean
  /** Called when Escape is pressed inside the trapped container. */
  onEscape?: () => void
  /** Whether focus returns to the trigger element on deactivation. Defaults to `true`. */
  returnFocusOnDeactivate?: boolean
}

/** Standard selector for focusable elements within a container. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Returns all focusable elements within the given container.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

/**
 * A reusable focus trap hook that keeps Tab/Shift+Tab cycling within a container,
 * invokes an Escape callback, and optionally returns focus to the triggering element
 * on deactivation.
 *
 * @param options - Configuration for the focus trap behavior.
 * @returns A ref to attach to the container element that should trap focus.
 *
 * @example
 * ```tsx
 * const containerRef = useFocusTrap<HTMLDivElement>({
 *   isActive: isOpen,
 *   onEscape: () => setIsOpen(false),
 * })
 * return <div ref={containerRef}>...</div>
 * ```
 */
export function useFocusTrap<T extends HTMLElement>(
  options: UseFocusTrapOptions,
): RefObject<T | null> {
  const { isActive, onEscape, returnFocusOnDeactivate = true } = options

  const containerRef = useRef<T | null>(null)
  const triggerRef = useRef<Element | null>(null)
  const onEscapeRef = useRef(onEscape)

  // Keep onEscape ref fresh to avoid stale closures in the keydown handler.
  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const container = containerRef.current
    if (!container) return

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onEscapeRef.current?.()
      return
    }

    if (e.key !== 'Tab') return

    const focusable = getFocusableElements(container)
    if (focusable.length === 0) {
      e.preventDefault()
      return
    }

    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!

    if (e.shiftKey) {
      // Shift+Tab: wrap from first to last
      if (document.activeElement === first || !container.contains(document.activeElement)) {
        e.preventDefault()
        last.focus()
      }
    } else {
      // Tab: wrap from last to first
      if (document.activeElement === last || !container.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (isActive) {
      // Remember the element that triggered the trap
      triggerRef.current = document.activeElement

      // Focus the first focusable child
      const focusable = getFocusableElements(container)
      if (focusable.length > 0) {
        focusable[0]!.focus()
      } else {
        // If no focusable children, make the container itself focusable temporarily
        container.focus()
      }

      container.addEventListener('keydown', handleKeyDown)

      return () => {
        container.removeEventListener('keydown', handleKeyDown)
      }
    }

    // Deactivation path: return focus to trigger element
    if (returnFocusOnDeactivate && triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus()
    }
    triggerRef.current = null

    return undefined
  }, [isActive, handleKeyDown, returnFocusOnDeactivate])

  return containerRef
}
