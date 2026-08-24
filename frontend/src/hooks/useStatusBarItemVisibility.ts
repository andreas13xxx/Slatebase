/**
 * useStatusBarItemVisibility — per-item visibility toggle for built-in status
 * bar items (Requirement 6). Mirrors useStatusBar.ts's module-level
 * useSyncExternalStore pattern (see lessons-learned.md: Status Bar uses
 * useSyncExternalStore, not useState, so all consumers stay in sync).
 */
import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_PREFIX = 'slatebase:statusBarItem:'

export type BuiltinStatusBarItemId = 'clock' | 'wordStats' | 'cursorPosition' | 'vaultName' | 'linkCounts'

export interface UseStatusBarItemVisibilityReturn {
  visible: boolean
  toggle(): void
}

// ── Module-level state ──

const currentVisible = new Map<BuiltinStatusBarItemId, boolean>()
const subscribers = new Set<() => void>()

function readFromStorage(itemId: BuiltinStatusBarItemId): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + itemId)
    if (raw === null) return true
    return JSON.parse(raw) === true
  } catch {
    return true
  }
}

function persistToStorage(itemId: BuiltinStatusBarItemId, visible: boolean): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + itemId, JSON.stringify(visible))
  } catch {
    // localStorage unavailable — silently ignore
  }
}

function getVisible(itemId: BuiltinStatusBarItemId): boolean {
  let value = currentVisible.get(itemId)
  if (value === undefined) {
    value = readFromStorage(itemId)
    currentVisible.set(itemId, value)
  }
  return value
}

function notifySubscribers(): void {
  for (const cb of subscribers) cb()
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => { subscribers.delete(callback) }
}

function toggleItem(itemId: BuiltinStatusBarItemId): void {
  const next = !getVisible(itemId)
  currentVisible.set(itemId, next)
  persistToStorage(itemId, next)
  notifySubscribers()
}

/**
 * Per-item visibility toggle for a built-in status bar item.
 * Defaults to visible (true) — matches the pre-existing single-item (clock) behavior.
 */
export function useStatusBarItemVisibility(itemId: BuiltinStatusBarItemId): UseStatusBarItemVisibilityReturn {
  const visible = useSyncExternalStore(subscribe, () => getVisible(itemId))

  const toggle = useCallback(() => {
    toggleItem(itemId)
  }, [itemId])

  return { visible, toggle }
}
