/**
 * useStatusBarItemVisibility — per-item visibility for built-in status bar
 * items, backed by the account-wide UI settings.
 *
 * Was one `localStorage` key per item; now one map inside
 * `userSettingsStore.statusBarItems`, so the choice follows the account
 * instead of the browser. Items default to visible, matching the original
 * single-item (clock) behaviour.
 */
import { useCallback } from 'react'
import { useUiSettings, updateUiSettings, getUiSettings } from '../state/userSettingsStore'

export type BuiltinStatusBarItemId = 'clock' | 'wordStats' | 'cursorPosition' | 'vaultName' | 'linkCounts'

export interface UseStatusBarItemVisibilityReturn {
  visible: boolean
  toggle(): void
}

/** Visibility for one item; absent from the map means visible. */
export function isStatusBarItemVisible(itemId: BuiltinStatusBarItemId): boolean {
  return getUiSettings().statusBarItems[itemId] ?? true
}

/** Toggles one item from outside React. */
export function toggleStatusBarItem(itemId: BuiltinStatusBarItemId): void {
  const current = getUiSettings().statusBarItems
  updateUiSettings({
    statusBarItems: { ...current, [itemId]: !(current[itemId] ?? true) },
  })
}

/** Per-item visibility toggle for a built-in status bar item. */
export function useStatusBarItemVisibility(itemId: BuiltinStatusBarItemId): UseStatusBarItemVisibilityReturn {
  const visible = useUiSettings().statusBarItems[itemId] ?? true
  const toggle = useCallback(() => { toggleStatusBarItem(itemId) }, [itemId])
  return { visible, toggle }
}
