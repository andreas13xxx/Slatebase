/**
 * useStatusBar — status bar visibility, backed by the account-wide UI settings.
 *
 * Previously a device-local `localStorage` flag, which meant hiding the status
 * bar on the desktop left it showing on the laptop. It now lives in
 * `userSettingsStore` and follows the account; that store keeps a localStorage
 * cache of its own, so the first paint is still synchronous.
 */
import { useCallback } from 'react'
import { useUiSettings, updateUiSettings, getUiSettings } from '../state/userSettingsStore'

/** Return value of the useStatusBar hook. */
export interface UseStatusBarReturn {
  /** Whether the status bar is currently visible. */
  visible: boolean
  /** Toggles status bar visibility and syncs it to the account. */
  toggle(): void
}

/** Toggles the status bar from outside React (command palette, menus). */
export function toggleStatusBar(): void {
  updateUiSettings({ statusBarVisible: !getUiSettings().statusBarVisible })
}

/**
 * Status bar visibility, shared by every consumer through the settings store.
 * When one component toggles it, all consumers re-render immediately.
 */
export function useStatusBar(): UseStatusBarReturn {
  const visible = useUiSettings().statusBarVisible
  const toggle = useCallback(() => { toggleStatusBar() }, [])
  return { visible, toggle }
}
