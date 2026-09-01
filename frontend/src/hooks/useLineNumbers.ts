/**
 * useLineNumbers — editor gutter line numbers, stored per user and per vault.
 *
 * Was a device-local `localStorage` flag shared across every vault. It now
 * lives in `vaultSettingsStore`, so the setting follows the account and each
 * vault remembers its own answer — a code-heavy vault usually wants line
 * numbers where a prose vault does not.
 *
 * Reached through the editor context menu, not the settings panel.
 */
import { useCallback } from 'react'
import { useVaultSetting, updateVaultSettings, getVaultSettings } from '../state/vaultSettingsStore'

/** Return value of the useLineNumbers hook. */
export interface UseLineNumbersReturn {
  /** Whether line numbers are currently enabled. */
  enabled: boolean
  /** Toggles line numbers on/off for the active vault. */
  toggle(): void
}

/** Toggles line numbers from outside React (command palette, context menu). */
export function toggleLineNumbers(): void {
  updateVaultSettings({ lineNumbers: !getVaultSettings().lineNumbers })
}

/** Line numbers state for the active vault. */
export function useLineNumbers(): UseLineNumbersReturn {
  const enabled = useVaultSetting('lineNumbers')
  const toggle = useCallback(() => { toggleLineNumbers() }, [])
  return { enabled, toggle }
}
