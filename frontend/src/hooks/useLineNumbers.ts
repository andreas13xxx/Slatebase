import { useCallback, useState } from 'react'

const STORAGE_KEY = 'slatebase:lineNumbers'

/** Return value of the useLineNumbers hook. */
export interface UseLineNumbersReturn {
  /** Whether line numbers are currently enabled. */
  enabled: boolean
  /** Toggles line numbers on/off and persists to localStorage. */
  toggle(): void
}

/**
 * Reads the initial enabled state from localStorage.
 * Returns false (disabled) if localStorage is unavailable or data is corrupted.
 */
function readInitialState(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return false
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
    return false
  } catch {
    return false
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
 * Custom hook managing line numbers enabled/disabled state.
 *
 * - Reads initial state from localStorage key `slatebase:lineNumbers`
 * - Defaults to disabled if localStorage is unavailable or data is corrupted
 * - `toggle()` flips the boolean and persists the new value
 *
 * **Validates: Requirements 4.1, 4.5, 4.6**
 */
export function useLineNumbers(): UseLineNumbersReturn {
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
