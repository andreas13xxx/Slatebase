import { useCallback, useState } from 'react'

const STORAGE_KEY = 'slatebase:readableLineLength'

/** Return value of the useReadableLineLength hook. */
export interface UseReadableLineLengthReturn {
  /** Whether readable line length is currently enabled. */
  enabled: boolean
  /** Toggles readable line length on/off and persists to localStorage. */
  toggle(): void
}

/**
 * Reads the initial enabled state from localStorage.
 * Defaults to true (enabled) — Slatebase's editor has always constrained line
 * width, so an unset preference must preserve that existing look rather than
 * silently switching everyone to full-width on their next visit.
 */
function readInitialState(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return true
    }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'enabled' in parsed &&
      typeof (parsed as { enabled: unknown }).enabled === 'boolean'
    ) {
      return (parsed as { enabled: boolean }).enabled
    }
    return true
  } catch {
    return true
  }
}

/**
 * Persists the enabled state to localStorage.
 * Silently ignores errors if localStorage is unavailable.
 */
function persistState(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled }))
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/**
 * Custom hook managing readable-line-length enabled/disabled state.
 *
 * - Reads initial state from localStorage key `slatebase:readableLineLength`
 * - Defaults to enabled (matching Slatebase's existing constrained-width editor)
 *   if localStorage is unavailable or data is corrupted
 * - `toggle()` flips the boolean and persists the new value
 */
export function useReadableLineLength(): UseReadableLineLengthReturn {
  const [enabled, setEnabled] = useState<boolean>(readInitialState)

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev
      persistState(next)
      return next
    })
  }, [])

  return { enabled, toggle }
}
