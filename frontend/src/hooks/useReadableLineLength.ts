/**
 * useReadableLineLength — constrains the editor to a readable measure.
 * A vault setting stored in `.obsidian/app.json`; see useLineNumbers for the reasoning.
 *
 * Reached through the editor context menu, not the settings panel.
 */
import { useCallback } from 'react'
import { toggleAppConfigFlag } from './appConfigToggle'
import { useAppConfigValue } from '../state/vaultAppConfigStore'

/** Return value of the useReadableLineLength hook. */
export interface UseReadableLineLengthReturn {
  /** Whether the readable line length is currently enabled. */
  enabled: boolean
  /** Toggles the readable line length for the active vault. */
  toggle(): void
}

/** Toggles from outside React (command palette, context menu). */
export function toggleReadableLineLength(): void {
  toggleAppConfigFlag('readableLineLength')
}

/** Readable-line-length state for the active vault. */
export function useReadableLineLength(): UseReadableLineLengthReturn {
  const enabled = useAppConfigValue('readableLineLength')
  const toggle = useCallback(() => { toggleReadableLineLength() }, [])
  return { enabled, toggle }
}
