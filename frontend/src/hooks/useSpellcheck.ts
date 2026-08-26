import { useCallback, useState } from 'react'

const STORAGE_KEY = 'slatebase:spellcheck'

/** Return value of the useSpellcheck hook. */
export interface UseSpellcheckReturn {
  /** Whether browser spellcheck is currently enabled for the editor. */
  enabled: boolean
  /** Toggles spellcheck on/off and persists to localStorage. */
  toggle(): void
}

/**
 * Reads the initial enabled state from localStorage.
 * Defaults to true (enabled) — a `contenteditable` element is spellchecked by
 * the browser by default when no `spellcheck` attribute is set at all, which
 * was CM6's de facto behavior here before this toggle existed. An unset
 * preference must preserve that rather than silently disabling spellcheck for
 * everyone on their next visit.
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
 * Custom hook managing editor spellcheck enabled/disabled state.
 *
 * - Reads initial state from localStorage key `slatebase:spellcheck`
 * - Defaults to enabled (matching the browser's implicit spellcheck-on-by-default
 *   behavior) if localStorage is unavailable or data is corrupted
 * - `toggle()` flips the boolean and persists the new value
 */
export function useSpellcheck(): UseSpellcheckReturn {
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
