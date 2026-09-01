/**
 * useReadableLineLength — constrains the editor to a readable measure.
 * Stored per user and per vault; see useLineNumbers for the reasoning.
 *
 * Reached through the editor context menu, not the settings panel.
 */
import { useCallback } from 'react'
import { useVaultSetting, updateVaultSettings, getVaultSettings } from '../state/vaultSettingsStore'

/** Return value of the useReadableLineLength hook. */
export interface UseReadableLineLengthReturn {
  /** Whether the readable line length is currently enabled. */
  enabled: boolean
  /** Toggles the readable line length for the active vault. */
  toggle(): void
}

/** Toggles from outside React (command palette, context menu). */
export function toggleReadableLineLength(): void {
  updateVaultSettings({ readableLineLength: !getVaultSettings().readableLineLength })
}

/** Readable-line-length state for the active vault. */
export function useReadableLineLength(): UseReadableLineLengthReturn {
  const enabled = useVaultSetting('readableLineLength')
  const toggle = useCallback(() => { toggleReadableLineLength() }, [])
  return { enabled, toggle }
}
