import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'slatebase:statusBar'

/** Return value of the useStatusBar hook. */
export interface UseStatusBarReturn {
  /** Whether the status bar is currently visible. */
  visible: boolean
  /** Toggles status bar visibility and persists to localStorage. */
  toggle(): void
}

// ── Module-level state ──

let currentVisible: boolean = readFromStorage()

/** Set of subscriber callbacks notified on state change. */
const subscribers = new Set<() => void>()

/**
 * Reads the visibility state from localStorage.
 * Returns true (visible) if localStorage is unavailable or data is corrupted.
 */
function readFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return true
    }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'visible' in parsed &&
      typeof (parsed as { visible: unknown }).visible === 'boolean'
    ) {
      return (parsed as { visible: boolean }).visible
    }
    return true
  } catch {
    return true
  }
}

/**
 * Persists the visibility state to localStorage.
 * Silently ignores errors if localStorage is unavailable.
 */
function persistToStorage(visible: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible }))
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/** Notify all subscribers of a state change. */
function notifySubscribers(): void {
  for (const cb of subscribers) {
    cb()
  }
}

/** Subscribe to state changes (for useSyncExternalStore). */
function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => { subscribers.delete(callback) }
}

/** Get current snapshot (for useSyncExternalStore). */
function getSnapshot(): boolean {
  return currentVisible
}

/** Toggle visibility and persist. */
function toggleStatusBar(): void {
  currentVisible = !currentVisible
  persistToStorage(currentVisible)
  notifySubscribers()
}

/**
 * Custom hook managing status bar visibility state.
 *
 * Uses a module-level store so all instances share the same state.
 * When one component toggles visibility, all consumers re-render immediately.
 *
 * - Reads initial state from localStorage key `slatebase:statusBar`
 * - Defaults to visible if localStorage is unavailable or data is corrupted
 * - `toggle()` flips the boolean, persists, and notifies all subscribers
 */
export function useStatusBar(): UseStatusBarReturn {
  const visible = useSyncExternalStore(subscribe, getSnapshot)

  const toggle = useCallback(() => {
    toggleStatusBar()
  }, [])

  return { visible, toggle }
}
